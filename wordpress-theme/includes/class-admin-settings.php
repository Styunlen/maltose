<?php

class MaltoseAdminSettings {

    const OPTIONS = [
        'maltose_secret_key'  => '',
        'maltose_sign_expire' => 60,
        'maltose_debug_mode'  => 0,
        'maltose_preview_enabled'   => 1,
        'maltose_preview_delay'     => 300,
        'maltose_preview_excerpt_len' => 120,
        'maltose_preview_wpm'       => 400,
        'maltose_preview_cache_ttl' => 300,
        'maltose_preview_recent'    => 3,
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
        register_setting('maltose_group', 'maltose_preview_enabled', [
            'type' => 'integer',
            'sanitize_callback' => 'absint',
            'default' => 1,
        ]);
        register_setting('maltose_group', 'maltose_preview_delay', [
            'type' => 'integer',
            'sanitize_callback' => 'absint',
            'default' => 300,
        ]);
        register_setting('maltose_group', 'maltose_preview_excerpt_len', [
            'type' => 'integer',
            'sanitize_callback' => 'absint',
            'default' => 120,
        ]);
        register_setting('maltose_group', 'maltose_preview_wpm', [
            'type' => 'integer',
            'sanitize_callback' => 'absint',
            'default' => 400,
        ]);
        register_setting('maltose_group', 'maltose_preview_cache_ttl', [
            'type' => 'integer',
            'sanitize_callback' => 'absint',
            'default' => 300,
        ]);
        register_setting('maltose_group', 'maltose_preview_recent', [
            'type' => 'integer',
            'sanitize_callback' => 'absint',
            'default' => 3,
        ]);
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
                </table>
                <?php submit_button('保存设置'); ?>
            </form>

            <h2>阅读增强（内链悬浮预览）</h2>
            <form method="post" action="options.php">
                <?php settings_fields('maltose_group'); ?>
                <table class="form-table">
                    <tr>
                        <th scope="row">
                            <label for="maltose_preview_enabled">悬浮预览总开关</label>
                        </th>
                        <td>
                            <label>
                                <input
                                    type="checkbox"
                                    id="maltose_preview_enabled"
                                    name="maltose_preview_enabled"
                                    value="1"
                                    <?php checked(get_option('maltose_preview_enabled', 1), 1); ?>
                                />
                                关闭后内链悬浮预览卡完全不生效（ADR-0025）。
                            </label>
                        </td>
                    </tr>
                    <tr>
                        <th scope="row">
                            <label for="maltose_preview_delay">触发延时（毫秒）</label>
                        </th>
                        <td>
                            <input
                                type="number"
                                id="maltose_preview_delay"
                                name="maltose_preview_delay"
                                value="<?php echo esc_attr(get_option('maltose_preview_delay', 300)); ?>"
                                class="small-text"
                                min="0"
                                max="3000"
                            />
                            <p class="description">悬停多久后开始加载预览数据，默认 300ms。</p>
                        </td>
                    </tr>
                    <tr>
                        <th scope="row">
                            <label for="maltose_preview_excerpt_len">摘要字数</label>
                        </th>
                        <td>
                            <input
                                type="number"
                                id="maltose_preview_excerpt_len"
                                name="maltose_preview_excerpt_len"
                                value="<?php echo esc_attr(get_option('maltose_preview_excerpt_len', 120)); ?>"
                                class="small-text"
                                min="30"
                                max="500"
                            />
                            <p class="description">预览卡摘要截断长度，默认 120 字。</p>
                        </td>
                    </tr>
                    <tr>
                        <th scope="row">
                            <label for="maltose_preview_wpm">阅读速度（字/分钟）</label>
                        </th>
                        <td>
                            <input
                                type="number"
                                id="maltose_preview_wpm"
                                name="maltose_preview_wpm"
                                value="<?php echo esc_attr(get_option('maltose_preview_wpm', 400)); ?>"
                                class="small-text"
                                min="50"
                                max="1000"
                            />
                            <p class="description">用于估算「预计阅读时长」，默认 400。</p>
                        </td>
                    </tr>
                    <tr>
                        <th scope="row">
                            <label for="maltose_preview_cache_ttl">缓存时长（秒）</label>
                        </th>
                        <td>
                            <input
                                type="number"
                                id="maltose_preview_cache_ttl"
                                name="maltose_preview_cache_ttl"
                                value="<?php echo esc_attr(get_option('maltose_preview_cache_ttl', 300)); ?>"
                                class="small-text"
                                min="30"
                                max="3600"
                            />
                            <p class="description">
                                预览数据进程内缓存时长（SWR），默认 300 秒。Astro 端
                                <code>TTL_CONFIG.PreviewByUri</code> 为实际生效值。
                            </p>
                        </td>
                    </tr>
                    <tr>
                        <th scope="row">
                            <label for="maltose_preview_recent">归档卡「最近几篇」</label>
                        </th>
                        <td>
                            <input
                                type="number"
                                id="maltose_preview_recent"
                                name="maltose_preview_recent"
                                value="<?php echo esc_attr(get_option('maltose_preview_recent', 3)); ?>"
                                class="small-text"
                                min="0"
                                max="20"
                            />
                            <p class="description">分类/标签预览卡展示的最近文章条数，0 表示只显示总数。</p>
                        </td>
                    </tr>
                </table>
                <?php submit_button('保存设置'); ?>
            </form>

            <hr />
            <h2>数据清理</h2>
            <p>删除所有 Maltose 主题保存在数据库中的配置项（<code>maltose_secret_key</code>、<code>maltose_sign_expire</code>）。</p>
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
        delete_option('maltose_preview_enabled');
        delete_option('maltose_preview_delay');
        delete_option('maltose_preview_excerpt_len');
        delete_option('maltose_preview_wpm');
        delete_option('maltose_preview_cache_ttl');
        delete_option('maltose_preview_recent');

        wp_redirect(add_query_arg('page', 'maltose', admin_url('options-general.php')));
        exit;
    }
}
