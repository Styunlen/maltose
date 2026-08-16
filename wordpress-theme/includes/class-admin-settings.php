<?php

class MaltoseAdminSettings {

    const OPTIONS = [
        'maltose_secret_key'  => '',
        'maltose_sign_expire' => 60,
        'maltose_debug_mode'  => 0,
        'maltose_site_birthday' => '',
    ];

    public static function init(): void {
        self::registerSettings();
        add_action('admin_post_maltose_cleanup', [self::class, 'handleCleanup']);
    }

    public static function addAdminMenu(): void {
        add_options_page(
            'Maltose 设置',
            'Maltose',
            'manage_options',
            'maltose',
            [self::class, 'renderPage']
        );
    }

    public static function registerSettings(): void {
        register_setting('maltose_group', 'maltose_secret_key', [
            'type' => 'string',
            'default' => '',
        ]);
        register_setting('maltose_group', 'maltose_sign_expire', [
            'type' => 'integer',
            'sanitize_callback' => 'absint',
            'default' => 60,
        ]);
        register_setting('maltose_group', 'maltose_debug_mode', [
            'type' => 'integer',
            'sanitize_callback' => 'absint',
            'default' => 0,
        ]);
        register_setting('maltose_group', 'maltose_site_birthday', [
            'type' => 'string',
            'sanitize_callback' => [self::class, 'sanitizeDate'],
            'default' => '',
        ]);
    }

    /** 校验建站日期格式（YYYY-MM-DD），非法值置空（ADR-0026 决策 4）。 */
    public static function sanitizeDate($value): string {
        $value = trim((string) $value);
        if ($value !== '' && preg_match('/^\d{4}-\d{2}-\d{2}$/', $value) && strtotime($value) !== false) {
            return $value;
        }
        return '';
    }

    public static function renderPage(): void {
        if (!current_user_can('manage_options')) {
            return;
        }
        ?>
        <div class="wrap">
            <h1>Maltose 设置</h1>
            <form method="post" action="options.php">
                <?php settings_fields('maltose_group'); ?>
                <table class="form-table">
                    <tr>
                        <th scope="row">
                            <label for="maltose_secret_key">签名密钥</label>
                        </th>
                        <td>
                            <input
                                type="text"
                                id="maltose_secret_key"
                                name="maltose_secret_key"
                                value="<?php echo esc_attr(get_option('maltose_secret_key', '')); ?>"
                                class="regular-text"
                            />
                            <p class="description">
                                与 Astro 端 <code>.env</code> 中的 <code>WP_GRAPHQL_SECRET_KEY</code> 保持一致。
                            </p>
                        </td>
                    </tr>
                    <tr>
                        <th scope="row">
                            <label for="maltose_sign_expire">签名有效期（秒）</label>
                        </th>
                        <td>
                            <input
                                type="number"
                                id="maltose_sign_expire"
                                name="maltose_sign_expire"
                                value="<?php echo esc_attr(get_option('maltose_sign_expire', 60)); ?>"
                                class="small-text"
                                min="10"
                                max="3600"
                            />
                            <p class="description">默认 60 秒。建议范围 10–3600。</p>
                        </td>
                    </tr>
                    <tr>
                        <th scope="row">
                            <label for="maltose_debug_mode">调试模式</label>
                        </th>
                        <td>
                            <label>
                                <input
                                    type="checkbox"
                                    id="maltose_debug_mode"
                                    name="maltose_debug_mode"
                                    value="1"
                                    <?php checked(get_option('maltose_debug_mode', 0), 1); ?>
                                />
                                开启后签名验证失败时返回详细调试信息。
                            </label>
                        </td>
                    </tr>
                    <tr>
                        <th scope="row">
                            <label for="maltose_site_birthday">建站日期</label>
                        </th>
                        <td>
                            <input
                                type="date"
                                id="maltose_site_birthday"
                                name="maltose_site_birthday"
                                value="<?php echo esc_attr(get_option('maltose_site_birthday', '')); ?>"
                            />
                            <p class="description">
                                站点数据看板的「已运行天数」优先取此值；未填写时回落到首篇文章发布日期。
                            </p>
                        </td>
                    </tr>
                </table>
                <?php submit_button('保存设置'); ?>
            </form>

            <hr />
            <h2>数据清理</h2>
            <p>删除所有 Maltose 主题保存在数据库中的配置项（<code>maltose_secret_key</code>、<code>maltose_sign_expire</code>、<code>maltose_debug_mode</code>、<code>maltose_site_birthday</code>）。</p>
            <form method="post" action="<?php echo admin_url('admin-post.php'); ?>" onsubmit="return confirm('确定要清除所有 Maltose 配置吗？');">
                <input type="hidden" name="action" value="maltose_cleanup" />
                <?php wp_nonce_field('maltose_cleanup_action', 'maltose_cleanup_nonce'); ?>
                <?php submit_button('清除所有 Maltose 配置', 'delete'); ?>
            </form>
        </div>
        <?php
    }

    public static function handleCleanup(): void {
        if (!current_user_can('manage_options')) {
            wp_die('无权限');
        }
        check_admin_referer('maltose_cleanup_action', 'maltose_cleanup_nonce');

        delete_option('maltose_secret_key');
        delete_option('maltose_sign_expire');
        delete_option('maltose_debug_mode');
        delete_option('maltose_site_birthday');

        wp_redirect(add_query_arg('page', 'maltose', admin_url('options-general.php')));
        exit;
    }
}
