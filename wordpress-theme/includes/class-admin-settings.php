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
        'maltose_site_birthday' => '',
    ];

    public static function init(): void {
        self::registerSettings();
        add_action('admin_post_maltose_cleanup', [self::class, 'handleCleanup']);
        add_action('admin_post_maltose_export', [self::class, 'handleExport']);
        add_action('admin_post_maltose_import', [self::class, 'handleImport']);
        add_action('admin_post_maltose_uninstall', [self::class, 'handleUninstall']);
        add_action('admin_post_maltose_migrate_clientids', [self::class, 'handleMigrateClientIds']);
    }

    public static function addAdminMenu(): void {
        add_options_page(
            'Maltose 设置',
            'Maltose',
            'manage_options',
            'maltose',
            [self::class, 'renderPage']
        );
        add_options_page(
            'Maltose 数据卸载',
            'Maltose 卸载',
            'manage_options',
            'maltose-uninstall',
            [self::class, 'renderUninstallPage']
        );
        add_options_page(
            'Maltose 悬空评论',
            'Maltose 悬空评论',
            'manage_options',
            'maltose-orphans',
            [self::class, 'renderOrphansPage']
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
            <?php $migrateResult = get_transient('maltose_migrate_clientids_result'); ?>
            <?php if ($migrateResult) : ?>
                <?php delete_transient('maltose_migrate_clientids_result'); ?>
                <div class="notice notice-success">
                    <p>clientId 迁移完成：共 <?php echo (int) $migrateResult['total']; ?> 篇文章，其中 <?php echo (int) $migrateResult['updated']; ?> 篇已补写 clientId。</p>
                </div>
            <?php endif; ?>
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
                                关闭后内链悬浮预览卡完全不生效。
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
            <h2>数据管理</h2>
            <p>
                管理 Maltose 主题写入的数据。导出用于备份或迁移；导入支持
                <strong>同站恢复</strong>（按 ID 重建）与 <strong>跨站迁移</strong>
                （按可匹配键：文章 slug / 段落 clientId，未匹配项跳过并报告）。<em>评论本身永不自动删除。</em>
            </p>

            <?php $exportables = MaltoseDataRegistry::exportable(); $preview = MaltoseDataRegistry::previewClean(); ?>

            <form method="post" action="<?php echo admin_url('admin-post.php'); ?>" style="margin-bottom:12px;">
                <input type="hidden" name="action" value="maltose_export" />
                <?php wp_nonce_field('maltose_export_action', 'maltose_export_nonce'); ?>
                <h3>导出</h3>
                <p>勾选要导出的数据类别，点击「导出 JSON」下载备份文件。</p>
                <?php foreach ($exportables as $key => $def) : ?>
                    <label style="display:block;margin:2px 0;">
                        <input type="checkbox" name="categories[]" value="<?php echo esc_attr($key); ?>" checked />
                        <?php echo esc_html($def['label']); ?>
                    </label>
                <?php endforeach; ?>
                <?php submit_button('导出 JSON', 'secondary'); ?>
            </form>

            <form method="post" action="<?php echo admin_url('admin-post.php'); ?>" enctype="multipart/form-data" style="margin-bottom:12px;">
                <input type="hidden" name="action" value="maltose_import" />
                <?php wp_nonce_field('maltose_import_action', 'maltose_import_nonce'); ?>
                <h3>导入</h3>
                <p>
                    选择导出文件。模式：
                    <label><input type="radio" name="mode" value="restore" checked /> 同站恢复（按 ID）</label>
                    <label style="margin-left:12px;"><input type="radio" name="mode" value="migrate" /> 跨站迁移（按 slug/clientId）</label>
                </p>
                <input type="file" name="maltose_import_file" accept="application/json" required />
                <?php submit_button('导入', 'secondary'); ?>
            </form>

            <h3>段落锚定迁移</h3>
            <p>
                为历史文章（post + page）的每个块补写持久化 clientId（UUID）到 post_content，
                使段落评论锚定稳定。已有 clientId 的块跳过，幂等可重复执行。
            </p>
            <form method="post" action="<?php echo admin_url('admin-post.php'); ?>" onsubmit="return confirm('确定要为所有历史文章补写 clientId 吗？此操作会修改文章内容（仅添加 clientId 属性，不改动结构）。');">
                <input type="hidden" name="action" value="maltose_migrate_clientids" />
                <?php wp_nonce_field('maltose_migrate_clientids_action', 'maltose_migrate_clientids_nonce'); ?>
                <?php submit_button('为历史文章补写 clientId', 'primary'); ?>
            </form>

            <h3>卸载预览</h3>
            <p>删除主题前可在此查看将清理/待确认的数据（按数据注册表统计）。评论数据不在此列。</p>
            <table class="widefat striped" style="max-width:720px;">
                <thead><tr><th>数据</th><th>类型</th><th>数量</th></tr></thead>
                <tbody>
                <?php if (empty($preview)) : ?>
                    <tr><td colspan="3">无残留数据。</td></tr>
                <?php else : ?>
                    <?php foreach ($preview as $key => $row) : ?>
                        <tr>
                            <td><?php echo esc_html($row['label']); ?></td>
                            <td><?php echo $row['cleanup'] === MaltoseDataRegistry::CLEAN_ASK ? '待确认' : '可清理'; ?></td>
                            <td><?php echo (int) $row['count']; ?></td>
                        </tr>
                    <?php endforeach; ?>
                <?php endif; ?>
                </tbody>
            </table>

            <h3>清理</h3>
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
        delete_option('maltose_preview_enabled');
        delete_option('maltose_preview_delay');
        delete_option('maltose_preview_excerpt_len');
        delete_option('maltose_preview_wpm');
        delete_option('maltose_preview_cache_ttl');
        delete_option('maltose_preview_recent');
        delete_option('maltose_site_birthday');

        wp_redirect(add_query_arg('page', 'maltose', admin_url('options-general.php')));
        exit;
    }

    public static function handleExport(): void {
        if (!current_user_can('manage_options')) {
            wp_die('无权限');
        }
        check_admin_referer('maltose_export_action', 'maltose_export_nonce');

        $categories = isset($_POST['categories']) ? array_map('sanitize_text_field', (array) $_POST['categories']) : null;
        $payload = MaltoseDataRegistry::export($categories);

        nocache_headers();
        header('Content-Type: application/json; charset=utf-8');
        header('Content-Disposition: attachment; filename=maltose-export-' . gmdate('Ymd-His') . '.json');
        echo wp_json_encode($payload, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE);
        exit;
    }

    public static function handleImport(): void {
        if (!current_user_can('manage_options')) {
            wp_die('无权限');
        }
        check_admin_referer('maltose_import_action', 'maltose_import_nonce');

        if (empty($_FILES['maltose_import_file']['tmp_name'])) {
            wp_die('未选择导入文件');
        }
        $raw = file_get_contents($_FILES['maltose_import_file']['tmp_name']);
        $payload = json_decode($raw, true);
        if (!is_array($payload) || ($payload['theme'] ?? '') !== 'maltose') {
            wp_die('无效的 Maltose 导出文件');
        }
        $mode = ($_POST['mode'] ?? 'restore') === 'migrate' ? 'migrate' : 'restore';
        $report = MaltoseDataRegistry::import($payload['data'] ?? [], $mode);

        set_transient('maltose_import_report', $report, 60);
        wp_redirect(add_query_arg(['page' => 'maltose', 'imported' => '1'], admin_url('options-general.php')));
        exit;
    }

    public static function renderUninstallPage(): void {
        if (!current_user_can('manage_options')) {
            return;
        }
        $report = get_transient('maltose_import_report');
        ?>
        <div class="wrap">
            <h1>Maltose 数据卸载向导</h1>
            <p>
                删除主题前处理 Maltose 写入的数据。<strong>评论数据永不自动删除</strong>
                ——它们是访客资产。以下仅处理主题自有数据。
            </p>

            <?php if ($report) : ?>
                <div class="notice notice-success"><p>导入完成：<?php echo esc_html(json_encode($report, JSON_UNESCAPED_UNICODE)); ?></p></div>
            <?php endif; ?>

            <form method="post" action="<?php echo admin_url('admin-post.php'); ?>" onsubmit="return confirm('确定要按所选方式处理数据吗？此操作不可撤销。');">
                <input type="hidden" name="action" value="maltose_uninstall" />
                <?php wp_nonce_field('maltose_uninstall_action', 'maltose_uninstall_nonce'); ?>
                <h2>选择处理方式</h2>
                <label style="display:block;margin:6px 0;">
                    <input type="radio" name="uninstall_mode" value="export_clean" checked />
                    <strong>① 导出 ZIP 后清理</strong> —— 下载数据备份，然后删除主题自有数据
                </label>
                <label style="display:block;margin:6px 0;">
                    <input type="radio" name="uninstall_mode" value="export_keep" />
                    <strong>② 仅导出保留</strong> —— 下载备份，数据留在数据库（可稍后手动处理）
                </label>
                <label style="display:block;margin:6px 0;">
                    <input type="radio" name="uninstall_mode" value="clean" />
                    <strong>③ 直接清理</strong> —— 不备份，直接删除主题自有数据
                </label>
                <label style="display:block;margin:6px 0;">
                    <input type="radio" name="uninstall_mode" value="keep" />
                    <strong>④ 不处理</strong> —— 数据全部保留（切换主题后仍留在数据库）
                </label>

                <h2>待处理数据预览</h2>
                <table class="widefat striped" style="max-width:720px;">
                    <thead><tr><th>数据</th><th>类型</th><th>数量</th></tr></thead>
                    <tbody>
                    <?php $preview = MaltoseDataRegistry::previewClean(); ?>
                    <?php if (empty($preview)) : ?>
                        <tr><td colspan="3">无残留数据。</td></tr>
                    <?php else : ?>
                        <?php foreach ($preview as $key => $row) : ?>
                            <tr>
                                <td><?php echo esc_html($row['label']); ?></td>
                                <td><?php echo $row['cleanup'] === MaltoseDataRegistry::CLEAN_ASK ? '待确认' : '可清理'; ?></td>
                                <td><?php echo (int) $row['count']; ?></td>
                            </tr>
                        <?php endforeach; ?>
                    <?php endif; ?>
                    </tbody>
                </table>

                <?php
                $otp_users = self::otpUsers();
                if ($otp_users) : ?>
                    <h2>OTP 自动创建账号</h2>
                    <p>
                        以下账号通过无密码 OTP 登录创建，密码为机器生成。若切换主题建议删除
                        （这些账号可能无法正常登录）。已自行设置真实密码的账号会自动移出此列表。
                    </p>
                    <table class="widefat striped" style="max-width:720px;">
                        <thead><tr><th>用户 ID</th><th>用户名</th><th>邮箱</th><th>创建时间</th></tr></thead>
                        <tbody>
                        <?php foreach ($otp_users as $u) : ?>
                            <tr>
                                <td><?php echo (int) $u->ID; ?></td>
                                <td><?php echo esc_html($u->user_login); ?></td>
                                <td><?php echo esc_html($u->user_email); ?></td>
                                <td><?php echo esc_html(gmdate('Y-m-d', strtotime($u->user_registered))); ?></td>
                            </tr>
                        <?php endforeach; ?>
                        </tbody>
                    </table>
                <?php endif; ?>

                <?php submit_button('执行卸载处理', 'delete'); ?>
            </form>
        </div>
        <?php
    }

    public static function handleUninstall(): void {
        if (!current_user_can('manage_options')) {
            wp_die('无权限');
        }
        check_admin_referer('maltose_uninstall_action', 'maltose_uninstall_nonce');

        $mode = $_POST['uninstall_mode'] ?? 'keep';
        $deleted = [];
        if ($mode === 'export_clean' || $mode === 'export_keep') {
            $payload = MaltoseDataRegistry::export();
            $export_dir = wp_upload_dir();
            $file = $export_dir['path'] . '/maltose-export-' . gmdate('Ymd-His') . '.json';
            file_put_contents($file, wp_json_encode($payload, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE));
            set_transient('maltose_uninstall_export', $file, 300);
        }
        if ($mode === 'export_clean' || $mode === 'clean') {
            $deleted = MaltoseDataRegistry::clean();
        }
        set_transient('maltose_uninstall_result', [
            'mode'    => $mode,
            'deleted' => $deleted,
            'export'  => get_transient('maltose_uninstall_export') ?? null,
        ], 300);
        wp_redirect(add_query_arg(['page' => 'maltose-uninstall', 'done' => '1'], admin_url('options-general.php')));
        exit;
    }

    public static function handleMigrateClientIds(): void {
        if (!current_user_can('manage_options')) {
            wp_die('无权限');
        }
        check_admin_referer('maltose_migrate_clientids_action', 'maltose_migrate_clientids_nonce');

        $result = MaltoseBlockReference::migrateAllPosts();
        set_transient('maltose_migrate_clientids_result', $result, 60);
        wp_redirect(add_query_arg(['page' => 'maltose', 'migrated' => '1'], admin_url('options-general.php')));
        exit;
    }

    private static function otpUsers(): array {
        $users = get_users([
            'meta_key' => 'maltose_otp_user',
            'fields'   => ['ID', 'user_login', 'user_email', 'user_registered'],
        ]);
        return $users;
    }

    /**
     * 悬空评论管理（ADR-0036 P3 Q11=B）：列出所有带 maltose_block_ref 的
     * 评论。实际重绑在文章评论区完成（选段模式）——本页是博主的总览入口，
     * 提供跳转到对应文章并定位到该评论。
     */
    public static function renderOrphansPage(): void {
        if (!current_user_can('manage_options')) {
            return;
        }
        global $wpdb;
        $rows = $wpdb->get_results(
            "SELECT cm.comment_id, cm.meta_value, c.comment_post_ID, c.comment_author,
                    c.comment_author_email, c.comment_content, c.comment_date
             FROM {$wpdb->commentmeta} cm
             INNER JOIN {$wpdb->comments} c ON c.comment_ID = cm.comment_id
             WHERE cm.meta_key = 'maltose_block_ref'
             ORDER BY c.comment_date DESC
             LIMIT 100"
        );
        ?>
        <div class="wrap">
            <h1>Maltose 悬空评论管理</h1>
            <p>
                以下评论带有段落锚定（<code>maltose_block_ref</code>）。若锚定段落已被
                删除/重构，评论会显示「原段落已删除」。博主可在文章评论区用「重新绑定段落」
                把它挂到新段落；本页为总览入口。
            </p>
            <?php if (empty($rows)) : ?>
                <p>暂无带段落锚定的评论。</p>
            <?php else : ?>
                <table class="widefat striped">
                    <thead>
                        <tr>
                            <th>评论 ID</th>
                            <th>作者</th>
                            <th>锚定 snippet</th>
                            <th>评论摘要</th>
                            <th>时间</th>
                            <th>操作</th>
                        </tr>
                    </thead>
                    <tbody>
                    <?php foreach ($rows as $row) :
                        $decoded = json_decode($row->meta_value, true);
                        $clientId = $decoded['clientId'] ?? '';
                        $snippet = $decoded['snippet'] ?? '';
                        $postPermalink = get_permalink((int) $row->comment_post_ID);
                        ?>
                        <tr>
                            <td><?php echo (int) $row->comment_id; ?></td>
                            <td>
                                <?php echo esc_html($row->comment_author); ?>
                                <br /><code style="font-size:0.75rem;"><?php echo esc_html($row->comment_author_email); ?></code>
                            </td>
                            <td>
                                <code style="font-size:0.75rem;"><?php echo esc_html($clientId); ?></code>
                                <br /><?php echo esc_html($snippet); ?>
                            </td>
                            <td><?php echo esc_html(wp_trim_words($row->comment_content, 20)); ?></td>
                            <td><?php echo esc_html($row->comment_date); ?></td>
                            <td>
                                <?php if ($postPermalink) : ?>
                                    <a class="button button-small" href="<?php echo esc_url($postPermalink . '#chat-comment-' . (int) $row->comment_id); ?>">
                                        在文章内查看/重绑
                                    </a>
                                <?php endif; ?>
                            </td>
                        </tr>
                    <?php endforeach; ?>
                    </tbody>
                </table>
            <?php endif; ?>
        </div>
        <?php
    }

    /** 切换主题时向管理员提示未导出的数据（ADR-0036 P2）。 */
    public static function onSwitchTheme(): void {
        if (!current_user_can('manage_options')) {
            return;
        }
        $preview = MaltoseDataRegistry::previewClean();
        if (empty($preview)) {
            return;
        }
        add_action('admin_notices', static function () {
            $url = admin_url('options-general.php?page=maltose-uninstall');
            echo '<div class="notice notice-warning"><p>'
                . '你已离开 Maltose 主题，但仍有主题数据留在数据库中。'
                . '请在 <a href="' . esc_url($url) . '">Maltose 数据卸载</a> 页面导出或清理。'
                . '</p></div>';
        });
    }
}
