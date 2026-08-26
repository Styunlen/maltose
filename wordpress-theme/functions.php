<?php
/**
 * Maltose — Theme Functions
 *
 * 提供 GraphQL 安全签名校验、agentPublic 字段注册、后台设置页面。
 * 此为「纯功能主题」，不包含前端样式。
 */

defined('ABSPATH') || exit;

$theme_dir = __DIR__;

require_once $theme_dir . '/includes/class-signature-verifier.php';
require_once $theme_dir . '/includes/class-agent-public.php';
require_once $theme_dir . '/includes/class-admin-settings.php';
require_once $theme_dir . '/includes/class-sticky-posts.php';
require_once $theme_dir . '/includes/class-post-views.php';
require_once $theme_dir . '/includes/class-maltose-settings.php';
require_once $theme_dir . '/includes/class-comment-geo.php';
require_once $theme_dir . '/includes/class-comment-geo-field.php';
require_once $theme_dir . '/includes/class-email-otp.php';
require_once $theme_dir . '/includes/class-change-username.php';

add_action('init', [AstroPressSignatureVerifier::class, 'init']);
add_action('graphql_register_types', [AstroPressAgentPublic::class, 'register']);

// 缩短 refreshToken 有效期：插件默认 1 年，泄露窗口过大（方案 A，见 OTP ADR）。
// 30 天 = 每次登录最迟一个月需重新验证邮箱。
add_filter('graphql_login_refresh_token_validity', static fn() => DAY_IN_SECONDS * 30);

add_action('graphql_register_types', [MaltoseStickyPosts::class, 'register']);
add_action('graphql_register_types', [MaltosePostViews::class, 'register']);
add_action('graphql_register_types', [MaltoseSettings::class, 'register']);
add_action('graphql_register_types', [MaltoseCommentGeo::class, 'register']);
add_action('graphql_register_types', [MaltoseCommentGeoField::class, 'register']);
add_action('graphql_register_types', [MaltoseEmailOtp::class, 'register']);
add_action('graphql_register_types', [MaltoseChangeUsername::class, 'register']);

// 记录最近登录时间（password / Authentik / OTP 统一走 wp_login hook；
// OTP 路径在 verifyEmailOtp 内已单独记录，此处覆盖其余登录方式）。
add_action('wp_login', static function ($user_login, $user) {
    if ($user instanceof WP_User) {
        update_user_meta($user->ID, 'maltose_last_login', time());
    }
}, 10, 2);
add_action('save_post', [MaltosePostViews::class, 'onSavePost']);
add_action('admin_menu', [MaltoseAdminSettings::class, 'addAdminMenu']);
add_action('admin_init', [MaltoseAdminSettings::class, 'init']);
// 评论地域统计缓存失效（ADR-0026 决策 2）：增删改 + 审核状态变化。
add_action('comment_post', [MaltoseCommentGeo::class, 'invalidate']);
add_action('wp_set_comment_status', [MaltoseCommentGeo::class, 'invalidate']);
add_action('deleted_comment', [MaltoseCommentGeo::class, 'invalidate']);

// 信任反向代理设置的 X-Forwarded-For，使 comment_author_IP 记录真实访客 IP
// （nginx 已设该头；proxy 转发时透传）。仅当值是合法 IP 时采用，防止伪造。
add_filter('pre_comment_user_ip', static function ($ip) {
    $forwarded = isset($_SERVER['HTTP_X_FORWARDED_FOR'])
        ? trim(explode(',', $_SERVER['HTTP_X_FORWARDED_FOR'])[0])
        : '';
    if ($forwarded && filter_var($forwarded, FILTER_VALIDATE_IP)) {
        return $forwarded;
    }
    return $ip;
});
