<?php
/**
 * Maltose — Email OTP Authentication
 *
 * Passwordless login via emailed one-time codes.
 * - sendEmailOtp(email): generates a 6-digit code, stores it as a transient,
 *   sends it via wp_mail, returns { sent, expiresIn }.
 * - verifyEmailOtp(email, code): validates the code, finds-or-creates a WP
 *   user by email, issues the same authToken/refreshToken pair the headless
 *   login plugin returns, and flags the user as needing profile completion.
 *
 * The code is stored WP-side (transient); the Astro frontend only keeps a
 * "currently verifying email" cookie for UX state.
 */

defined('ABSPATH') || exit;

class MaltoseEmailOtp {

    const TRANSIENT_PREFIX = 'maltose_otp_';
    const OTP_TTL = 600;            // seconds (10 min)
    const RESEND_MIN_INTERVAL = 60; // seconds between sends per email
    const CODE_LENGTH = 6;
    const MAX_VERIFY_FAILS = 5;     // wrong attempts before the code is voided

    public static function register(): void {
        // Expose last login time (stored in user meta) so the profile page can
        // render it via viewer without a second WP round-trip. Registered
        // synchronously (NOT via a nested add_action) so it runs in the same
        // graphql_register_types pass as the mutations below — a nested action
        // added mid-iteration is not guaranteed to execute.
        register_graphql_field('User', 'maltoseLastLogin', [
            'type'        => 'String',
            'description' => __('The last login timestamp (ISO 8601), from user meta.', 'maltose'),
            'resolve'     => static function ($user) {
                // WPGraphQL hands resolvers a Model\User (not WP_User); its
                // databaseId field is the reliable id. Accept both shapes.
                if ($user instanceof \WP_User) {
                    $id = $user->ID;
                } elseif (is_object($user) && isset($user->databaseId)) {
                    $id = (int) $user->databaseId;
                } else {
                    return null;
                }
                $ts = (int) get_user_meta($id, 'maltose_last_login', true);
                return $ts ? gmdate('c', $ts) : null;
            },
        ]);

        register_graphql_mutation('sendEmailOtp', [
            'description' => __('Send a one-time login code to an email address.', 'maltose'),
            'inputFields' => [
                'email' => [
                    'type'        => ['non_null' => 'String'],
                    'description' => __('The email address to send the code to.', 'maltose'),
                ],
            ],
            'outputFields' => [
                'sent' => [
                    'type'        => 'Boolean',
                    'description' => __('Whether the code was sent.', 'maltose'),
                    'resolve'     => fn($p) => (bool) $p['sent'],
                ],
                'expiresIn' => [
                    'type'        => 'Int',
                    'description' => __('OTP validity in seconds.', 'maltose'),
                    'resolve'     => fn($p) => (int) $p['expiresIn'],
                ],
                'error' => [
                    'type'        => 'String',
                    'description' => __('Error message if the send failed.', 'maltose'),
                    'resolve'     => fn($p) => $p['error'] ?? null,
                ],
            ],
            'mutateAndGetPayload' => function ($input) {
                $email = strtolower(trim(sanitize_email($input['email'] ?? '')));
                if (!is_email($email)) {
                    return ['sent' => false, 'expiresIn' => 0, 'error' => '邮箱格式不正确'];
                }

                // Resend throttle: one code per email per RESEND_MIN_INTERVAL.
                $lastKey = self::TRANSIENT_PREFIX . 'last_' . hash('sha256', $email);
                $lastSent = (int) get_transient($lastKey);
                if ($lastSent && (time() - $lastSent) < self::RESEND_MIN_INTERVAL) {
                    $wait = self::RESEND_MIN_INTERVAL - (time() - $lastSent);
                    return ['sent' => false, 'expiresIn' => 0, 'error' => "发送过于频繁，请 {$wait} 秒后再试"];
                }

                $code = self::generateCode();
                set_transient($lastKey, time(), self::RESEND_MIN_INTERVAL);

                $sent = wp_mail(
                    $email,
                    '[' . wp_specialchars_decode(get_bloginfo('name'), ENT_QUOTES) . '] 登录验证码',
                    '您的登录验证码是：' . $code . "\n\n" . '验证码 ' . intval(self::OTP_TTL / 60) . ' 分钟内有效。如果不是您本人操作，请忽略此邮件。',
                );

                if (!$sent) {
                    self::log('wp_mail failed for ' . $email);
                    return ['sent' => false, 'expiresIn' => 0, 'error' => '邮件发送失败，请稍后重试'];
                }

                // Store the code (hashed, with expiry) keyed by email.
                set_transient(self::TRANSIENT_PREFIX . hash('sha256', $email), wp_hash($code), self::OTP_TTL);

                return ['sent' => true, 'expiresIn' => self::OTP_TTL, 'error' => null];
            },
        ]);

        register_graphql_mutation('verifyEmailOtp', [
            'description' => __('Verify an emailed one-time code and log the user in.', 'maltose'),
            'inputFields' => [
                'email' => [
                    'type'        => ['non_null' => 'String'],
                    'description' => __('The email address the code was sent to.', 'maltose'),
                ],
                'code' => [
                    'type'        => ['non_null' => 'String'],
                    'description' => __('The 6-digit code from the email.', 'maltose'),
                ],
            ],
            'outputFields' => [
                'authToken' => [
                    'type'        => 'String',
                    'description' => __('JWT for subsequent authenticated requests.', 'maltose'),
                    'resolve'     => fn($p) => $p['authToken'] ?? null,
                ],
                'authTokenExpiration' => [
                    'type'        => 'String',
                    'description' => __('Auth token expiration timestamp.', 'maltose'),
                    'resolve'     => fn($p) => $p['authTokenExpiration'] ?? null,
                ],
                'refreshToken' => [
                    'type'        => 'String',
                    'description' => __('Refresh token for renewing the auth token.', 'maltose'),
                    'resolve'     => fn($p) => $p['refreshToken'] ?? null,
                ],
                'refreshTokenExpiration' => [
                    'type'        => 'String',
                    'description' => __('Refresh token expiration timestamp.', 'maltose'),
                    'resolve'     => fn($p) => $p['refreshTokenExpiration'] ?? null,
                ],
                'user' => [
                    'type'        => 'User',
                    'description' => __('The logged-in user.', 'maltose'),
                    // WPGraphQL's User type resolves databaseId via a callback
                    // type-hinted on Model\User; a raw WP_User triggers a PHP
                    // TypeError and a bare Model\User stays private (fields never
                    // initialize) when no current user is set. We set the current
                    // user in mutateAndGetPayload, then wrap like the plugin's
                    // own login payload (src/Mutation/Login.php:88-90).
                    'resolve'     => static fn($p) => isset($p['user']) && $p['user'] instanceof \WP_User
                        ? new \WPGraphQL\Model\User($p['user'])
                        : ($p['user'] ?? null),
                ],
                'error' => [
                    'type'        => 'String',
                    'description' => __('Error message if verification failed.', 'maltose'),
                    'resolve'     => fn($p) => $p['error'] ?? null,
                ],
                // Surfaces the raw PHP exception through the GraphQL response so
                // issues can be diagnosed without WP_DEBUG. Also mirrored to the
                // uploads/maltose-otp.log file via self::log().
                'debugError' => [
                    'type'        => 'String',
                    'description' => __('Internal exception detail (diagnostics).', 'maltose'),
                    'resolve'     => fn($p) => $p['debugError'] ?? null,
                ],
                // True only when the WP user has no completed profile yet
                // (display name is still the email fallback, or no bio/url).
                // Astro uses this to decide whether to redirect to /user/profile
                // after login — A 方案：老用户不再被强推资料页。
                'needsProfile' => [
                    'type'        => 'Boolean',
                    'description' => __('Whether the user still needs to complete their profile.', 'maltose'),
                    'resolve'     => fn($p) => (bool) ($p['needsProfile'] ?? false),
                ],
            ],
            'mutateAndGetPayload' => function ($input) {
                try {
                    $email = strtolower(trim(sanitize_email($input['email'] ?? '')));
                    $code  = trim((string) ($input['code'] ?? ''));

                if (!is_email($email) || !preg_match('/^\d{' . self::CODE_LENGTH . '}$/', $code)) {
                    return ['error' => '邮箱或验证码格式不正确'];
                }

                $key     = self::TRANSIENT_PREFIX . hash('sha256', $email);
                $stored  = get_transient($key);
                if (false === $stored) {
                    return ['error' => '验证码已过期，请重新获取'];
                }
                if (!hash_equals($stored, wp_hash($code))) {
                    // Brute-force guard: N wrong attempts invalidate the code.
                    $fail_key = self::TRANSIENT_PREFIX . 'fail_' . hash('sha256', $email);
                    $fails    = (int) get_transient($fail_key);
                    $fails++;
                    if ($fails >= self::MAX_VERIFY_FAILS) {
                        delete_transient($key);       // kill the code
                        delete_transient($fail_key);
                        self::log('otp code invalidated after ' . $fails . ' failed attempts: ' . $email);
                    } else {
                        set_transient($fail_key, $fails, self::OTP_TTL);
                    }
                    return ['error' => '验证码不正确'];
                }

                // Success — clear any failure counter.
                delete_transient(self::TRANSIENT_PREFIX . 'fail_' . hash('sha256', $email));
                delete_transient($key);

                // Find-or-create the WP user by email.
                $user = get_user_by('email', $email);
                if (!$user) {
                    $user_id = wp_create_user($email, wp_generate_password(24), $email);
                    if (is_wp_error($user_id)) {
                        return ['error' => '用户创建失败，请稍后重试'];
                    }
                    // 标记为 OTP 自动创建账号（ADR-0036 P2）：卸载向导据此列出
                    // 「无真实密码、建议删除」的账号；改密后 onPasswordChanged 移除标记。
                    update_user_meta($user_id, 'maltose_otp_user', time());
                    $user = get_user_by('id', $user_id);
                }
                if (!$user) {
                    return ['error' => '用户不存在'];
                }

                // Issue the plugin's standard JWT pair so downstream Astro code
                // treats this exactly like any login (wp-callback / password).
                // Set the current user FIRST, exactly like the plugin's own
                // Auth::login() (src/Auth/Auth.php:79) and RefreshToken mutation
                // (src/Mutation/RefreshToken.php:99): token issuance checks
                // Utils::is_current_user() when issuing the user secret, and the
                // User model's visibility depends on the current user. Without
                // this, get_refresh_token() returns null and Model\User stays
                // 'private' (its fields never initialize) — both surfaced as the
                // user.databaseId 500 and refreshToken null we fixed.
                wp_set_current_user($user->ID);

                self::log('verify user found: ' . $user->ID . ' email=' . $email);

                $auth_token  = null;
                $refresh     = null;
                $auth_exp    = null;
                $refresh_exp = null;
                if (class_exists('\WPGraphQL\Login\Auth\TokenManager')) {
                    $tm = '\WPGraphQL\Login\Auth\TokenManager';
                    $au = '\WPGraphQL\Login\Auth\User';
                    try {
                        $auth_token = call_user_func([$tm, 'get_auth_token'], $user, false);
                        // Expirations are written to user meta *during* token
                        // generation, so read them AFTER the get_auth_token call.
                        if (method_exists($au, 'get_auth_token_expiration')) {
                            $auth_exp = call_user_func([$au, 'get_auth_token_expiration'], $user->ID);
                        }
                        self::log('auth token issued: len=' . strlen((string) $auth_token));
                    } catch (\Throwable $e) {
                        self::log('get_auth_token THREW: ' . $e->getMessage());
                        $auth_token = null;
                    }
                    try {
                        $refresh = call_user_func([$tm, 'get_refresh_token'], $user, false);
                        if (method_exists($au, 'get_refresh_token_expiration')) {
                            $refresh_exp = call_user_func([$au, 'get_refresh_token_expiration'], $user->ID);
                        }
                        self::log('refresh token issued: len=' . strlen((string) $refresh));
                    } catch (\Throwable $e) {
                        self::log('get_refresh_token THREW: ' . $e->getMessage());
                        $refresh = null;
                    }
                } else {
                    self::log('TokenManager NOT present — cannot issue tokens');
                }

                if (empty($auth_token)) {
                    // No JWT, no login. A non-plugin token would not survive
                    // Astro's jwt.decode and would silently break every
                    // authenticated request — fail loudly instead.
                    return ['error' => '登录服务异常，请稍后重试'];
                }

                // Record last login (A 方案 / last_login feature).
                update_user_meta($user->ID, 'maltose_last_login', time());

                // A 方案：仅当 profile 尚未完善时标记 needsProfile，老用户
                // （displayName 非 email 且 bio/url 非空）不再被强推资料页。
                $display_name = $user->display_name ?? '';
                $profile_done = ! empty($display_name)
                    && $display_name !== $email
                    && (! empty($user->description) || ! empty($user->user_url));
                if (!$profile_done) {
                    update_user_meta($user->ID, 'maltose_needs_profile', time());
                }

                return [
                    'authToken'              => $auth_token,
                    'authTokenExpiration'    => $auth_exp ? gmdate('c', (int) $auth_exp) : null,
                    'refreshToken'           => $refresh,
                    'refreshTokenExpiration' => $refresh_exp ? gmdate('c', (int) $refresh_exp) : null,
                    'user'                   => $user,
                    'error'                  => null,
                    'debugError'             => null,
                    'needsProfile'           => !$profile_done,
                ];
                } catch (\Throwable $e) {
                    self::log('verifyEmailOtp FATAL: ' . $e->getMessage() . ' @ ' . $e->getFile() . ':' . $e->getLine());
                    return [
                        'authToken'           => null,
                        'refreshToken'        => null,
                        'user'                => null,
                        'error'               => '验证失败，请稍后重试',
                        'debugError'          => '[' . basename($e->getFile()) . ':' . $e->getLine() . '] ' . $e->getMessage(),
                    ];
                }
            },
        ]);
    }

    private static function generateCode(): string {
        $code = '';
        for ($i = 0; $i < self::CODE_LENGTH; $i++) {
            $code .= random_int(0, 9);
        }
        return $code;
    }

    /**
     * Append a line to the OTP debug log. WP_DEBUG is off in production, so
     * error_log() goes nowhere visible — write to an uploads file instead.
     */
    private static function log(string $message): void {
        $dir = WP_CONTENT_DIR . '/uploads';
        if (!is_dir($dir) && !wp_mkdir_p($dir)) {
            return;
        }
        $file = $dir . '/maltose-otp.log';
        $line = '[' . gmdate('c') . '] ' . $message . "\n";
        // LOCK_EX + FILE_APPEND is atomic enough for single-log-per-request.
        @file_put_contents($file, $line, FILE_APPEND | LOCK_EX);
    }

    /**
     * 用户设置真实密码后重分类为正常用户（ADR-0036 P2）：
     * 移除 maltose_otp_user 标记，卸载向导不再将其列为候选删除账号。
     * 挂载在 after_password_reset / profile_update。
     */
    public static function onPasswordChanged(int $userId): void {
        if (delete_user_meta($userId, 'maltose_otp_user')) {
            self::log("user {$userId} set a real password; OTP marker removed");
        }
    }
}
