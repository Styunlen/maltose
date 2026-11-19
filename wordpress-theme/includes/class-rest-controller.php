<?php
/**
 * Maltose — REST controller for the React admin app (ADR-0044).
 *
 * All routes require `manage_options`; writes reuse the exact sanitizers used
 * by the legacy Settings-API forms (MaltoseAdminSettings / MaltoseSiteConfig),
 * so the data contract (option keys, value shapes) stays identical.
 */

defined('ABSPATH') || exit;

class MaltoseRestController {

    const NAMESPACE = 'maltose/v1';

    public static function init(): void {
        add_action('rest_api_init', [self::class, 'registerRoutes']);
    }

    public static function registerRoutes(): void {
        register_rest_route(self::NAMESPACE, '/settings', [
            'methods'             => WP_REST_Server::READABLE,
            'permission_callback' => [self::class, 'canManage'],
            'callback'            => [self::class, 'getSettings'],
        ]);
        register_rest_route(self::NAMESPACE, '/settings', [
            'methods'             => WP_REST_Server::EDITABLE,
            'permission_callback' => [self::class, 'canManage'],
            'callback'            => [self::class, 'updateSettings'],
        ]);
        register_rest_route(self::NAMESPACE, '/announcements', [
            'methods'             => WP_REST_Server::READABLE,
            'permission_callback' => [self::class, 'canManage'],
            'callback'            => [self::class, 'listAnnouncements'],
        ]);
        register_rest_route(self::NAMESPACE, '/announcements', [
            'methods'             => WP_REST_Server::CREATABLE,
            'permission_callback' => [self::class, 'canManage'],
            'callback'            => [self::class, 'createAnnouncement'],
        ]);
        register_rest_route(self::NAMESPACE, '/announcements/(?P<id>\d+)', [
            'methods'             => WP_REST_Server::EDITABLE,
            'permission_callback' => [self::class, 'canManage'],
            'callback'            => [self::class, 'updateAnnouncement'],
        ]);
        register_rest_route(self::NAMESPACE, '/announcements/(?P<id>\d+)', [
            'methods'             => WP_REST_Server::DELETABLE,
            'permission_callback' => [self::class, 'canManage'],
            'callback'            => [self::class, 'deleteAnnouncement'],
        ]);
        register_rest_route(self::NAMESPACE, '/data/overview', [
            'methods'             => WP_REST_Server::READABLE,
            'permission_callback' => [self::class, 'canManage'],
            'callback'            => [self::class, 'dataOverview'],
        ]);
        register_rest_route(self::NAMESPACE, '/data/export', [
            'methods'             => WP_REST_Server::READABLE,
            'permission_callback' => [self::class, 'canManage'],
            'callback'            => [self::class, 'dataExport'],
        ]);
        register_rest_route(self::NAMESPACE, '/data/import', [
            'methods'             => WP_REST_Server::CREATABLE,
            'permission_callback' => [self::class, 'canManage'],
            'callback'            => [self::class, 'dataImport'],
        ]);
        register_rest_route(self::NAMESPACE, '/data/cleanup', [
            'methods'             => WP_REST_Server::CREATABLE,
            'permission_callback' => [self::class, 'canManage'],
            'callback'            => [self::class, 'dataCleanup'],
        ]);
        register_rest_route(self::NAMESPACE, '/data/migrate-clientids', [
            'methods'             => WP_REST_Server::CREATABLE,
            'permission_callback' => [self::class, 'canManage'],
            'callback'            => [self::class, 'dataMigrateClientIds'],
        ]);
        register_rest_route(self::NAMESPACE, '/uninstall', [
            'methods'             => WP_REST_Server::READABLE,
            'permission_callback' => [self::class, 'canManage'],
            'callback'            => [self::class, 'uninstallOverview'],
        ]);
        register_rest_route(self::NAMESPACE, '/uninstall', [
            'methods'             => WP_REST_Server::CREATABLE,
            'permission_callback' => [self::class, 'canManage'],
            'callback'            => [self::class, 'runUninstall'],
        ]);
        register_rest_route(self::NAMESPACE, '/orphans', [
            'methods'             => WP_REST_Server::READABLE,
            'permission_callback' => [self::class, 'canManage'],
            'callback'            => [self::class, 'orphanComments'],
        ]);
    }

    public static function canManage(): bool {
        return current_user_can('manage_options');
    }

    private static function intOption(string $key, int $default): int {
        return (int) get_option($key, $default);
    }

    public static function getSettings(): WP_REST_Response {
        // fields => 'all' returns WP_User objects; an array of field names
        // would return stdClass rows and break the typed callback below.
        $users = array_map(
            static fn($user): array => [
                'id'   => (int) $user->ID,
                'name' => (string) $user->display_name,
            ],
            get_users([
                'fields'  => 'all',
                'number'  => 500,
                'orderby' => 'display_name',
                'order'   => 'ASC',
            ])
        );

        return rest_ensure_response([
            'options' => [
                'secret_key'           => (string) get_option('maltose_secret_key', ''),
                'sign_expire'          => self::intOption('maltose_sign_expire', 60),
                'debug_mode'           => self::intOption('maltose_debug_mode', 0),
                'preview_enabled'      => self::intOption('maltose_preview_enabled', 1),
                'preview_delay'        => self::intOption('maltose_preview_delay', 300),
                'preview_excerpt_len'  => self::intOption('maltose_preview_excerpt_len', 120),
                'preview_wpm'          => self::intOption('maltose_preview_wpm', 400),
                'preview_cache_ttl'    => self::intOption('maltose_preview_cache_ttl', 300),
                'preview_recent'       => self::intOption('maltose_preview_recent', 3),
                'site_birthday'        => (string) get_option('maltose_site_birthday', ''),
                'social_links'         => MaltoseSiteConfig::socialLinks(),
                'owner_user_ids'       => MaltoseSiteConfig::ownerUserIds(),
            ],
            'users' => $users,
        ]);
    }

    public static function updateSettings(WP_REST_Request $request): WP_REST_Response|WP_Error {
        $body = $request->get_json_params();
        if (!is_array($body)) {
            return new WP_Error('invalid_body', '请求体必须是 JSON 对象', ['status' => 400]);
        }

        if (array_key_exists('secret_key', $body)) {
            update_option('maltose_secret_key', sanitize_text_field((string) $body['secret_key']));
        }
        if (array_key_exists('site_birthday', $body)) {
            update_option('maltose_site_birthday', MaltoseAdminSettings::sanitizeDate($body['site_birthday']));
        }
        if (array_key_exists('social_links', $body)) {
            update_option(
                MaltoseSiteConfig::OPTION_SOCIAL_LINKS,
                MaltoseSiteConfig::sanitizeSocialLinks(wp_json_encode($body['social_links']))
            );
        }
        if (array_key_exists('owner_user_ids', $body)) {
            update_option(
                MaltoseSiteConfig::OPTION_OWNER_USER_IDS,
                MaltoseSiteConfig::sanitizeOwnerUserIds($body['owner_user_ids'])
            );
        }

        $intKeys = [
            'sign_expire',
            'debug_mode',
            'preview_enabled',
            'preview_delay',
            'preview_excerpt_len',
            'preview_wpm',
            'preview_cache_ttl',
            'preview_recent',
        ];
        foreach ($intKeys as $key) {
            if (array_key_exists($key, $body)) {
                update_option('maltose_' . $key, absint($body[$key]));
            }
        }

        return self::getSettings();
    }

    // ── Announcements (CPT maltose_announcement) ─────────────────────────

    private static function announcementPayload(WP_Post $post): array {
        return [
            'id'       => (int) $post->ID,
            'date'     => $post->post_date_gmt,
            'modified' => $post->post_modified_gmt,
            'content'  => $post->post_content,
            'sticky'   => (bool) get_post_meta($post->ID, MaltoseAnnouncements::STICKY_META_KEY, true),
            'status'   => $post->post_status === 'publish' ? 'publish' : 'draft',
        ];
    }

    public static function listAnnouncements(): WP_REST_Response {
        $posts = get_posts([
            'post_type'   => MaltoseAnnouncements::POST_TYPE,
            'post_status' => ['publish', 'draft'],
            'numberposts' => 100,
            'orderby'     => 'date',
            'order'       => 'DESC',
        ]);

        return rest_ensure_response([
            'items' => array_map([self::class, 'announcementPayload'], $posts),
        ]);
    }

    private static function readAnnouncementBody(WP_REST_Request $request): array|WP_Error {
        $body = $request->get_json_params();
        if (!is_array($body)) {
            return new WP_Error('invalid_body', '请求体必须是 JSON 对象', ['status' => 400]);
        }
        $content = isset($body['content']) ? (string) $body['content'] : '';
        if (trim(wp_strip_all_tags($content)) === '') {
            return new WP_Error('empty_content', '公告内容不能为空', ['status' => 400]);
        }
        $status = ($body['status'] ?? 'publish') === 'draft' ? 'draft' : 'publish';
        return [
            'content' => $content,
            'status'  => $status,
            'sticky'  => !empty($body['sticky']),
        ];
    }

    public static function createAnnouncement(WP_REST_Request $request): WP_REST_Response|WP_Error {
        $data = self::readAnnouncementBody($request);
        if ($data instanceof WP_Error) return $data;

        $postId = wp_insert_post([
            'post_type'    => MaltoseAnnouncements::POST_TYPE,
            'post_status'  => $data['status'],
            'post_content' => $data['content'],
            'post_title'   => '',
        ], true);
        if (is_wp_error($postId)) {
            return new WP_Error('insert_failed', $postId->get_error_message(), ['status' => 500]);
        }
        update_post_meta($postId, MaltoseAnnouncements::STICKY_META_KEY, $data['sticky'] ? '1' : '');

        return rest_ensure_response(self::announcementPayload(get_post($postId)));
    }

    public static function updateAnnouncement(WP_REST_Request $request): WP_REST_Response|WP_Error {
        $postId = (int) $request['id'];
        $post = get_post($postId);
        if (!$post || $post->post_type !== MaltoseAnnouncements::POST_TYPE) {
            return new WP_Error('not_found', '公告不存在', ['status' => 404]);
        }
        $data = self::readAnnouncementBody($request);
        if ($data instanceof WP_Error) return $data;

        $result = wp_update_post([
            'ID'           => $postId,
            'post_status'  => $data['status'],
            'post_content' => $data['content'],
        ], true);
        if (is_wp_error($result)) {
            return new WP_Error('update_failed', $result->get_error_message(), ['status' => 500]);
        }
        update_post_meta($postId, MaltoseAnnouncements::STICKY_META_KEY, $data['sticky'] ? '1' : '');

        return rest_ensure_response(self::announcementPayload(get_post($postId)));
    }

    public static function deleteAnnouncement(WP_REST_Request $request): WP_REST_Response|WP_Error {
        $postId = (int) $request['id'];
        $post = get_post($postId);
        if (!$post || $post->post_type !== MaltoseAnnouncements::POST_TYPE) {
            return new WP_Error('not_found', '公告不存在', ['status' => 404]);
        }
        wp_delete_post($postId, true);
        return rest_ensure_response(['deleted' => true, 'id' => $postId]);
    }

    // ── Data management / uninstall / orphan comments ────────────────────

    private static function dataPreview(): array {
        $preview = [];
        foreach (MaltoseDataRegistry::previewClean() as $key => $row) {
            $preview[] = [
                'key'     => $key,
                'label'   => $row['label'],
                'cleanup' => $row['cleanup'],
                'count'   => (int) $row['count'],
            ];
        }
        return $preview;
    }

    private static function exportables(): array {
        $out = [];
        foreach (MaltoseDataRegistry::exportable() as $key => $def) {
            $out[] = [
                'key'    => $key,
                'label'  => $def['label'],
                'medium' => $def['medium'],
            ];
        }
        return $out;
    }

    private static function otpUsers(): array {
        $users = get_users([
            'meta_key' => 'maltose_otp_user',
            'fields'   => 'all',
        ]);
        return array_map(
            static fn($user): array => [
                'id'       => (int) $user->ID,
                'login'    => (string) $user->user_login,
                'email'    => (string) $user->user_email,
                'created'  => (string) $user->user_registered,
            ],
            $users
        );
    }

    private static function dataItems(): array {
        $out = [];
        foreach (MaltoseDataRegistry::items() as $key => $def) {
            $out[] = [
                'key'        => $key,
                'label'      => $def['label'],
                'medium'     => $def['medium'],
                'cleanup'    => $def['cleanup'],
                'exportable' => (bool) $def['exportable'],
                'count'      => MaltoseDataRegistry::countFor($key),
            ];
        }
        return $out;
    }

    public static function dataOverview(): WP_REST_Response {
        return rest_ensure_response([
            'items'       => self::dataItems(),
            'preview'     => self::dataPreview(),
            'otpUsers'    => self::otpUsers(),
            'exportables' => self::exportables(),
        ]);
    }

    public static function dataExport(WP_REST_Request $request): WP_REST_Response {
        $categories = $request->get_param('categories');
        $categories = is_array($categories)
            ? array_values(array_map('sanitize_text_field', $categories))
            : null;
        $payload = MaltoseDataRegistry::export($categories);
        return rest_ensure_response([
            'filename' => 'maltose-export-' . gmdate('Ymd-His') . '.json',
            'payload'  => $payload,
        ]);
    }

    public static function dataImport(WP_REST_Request $request): WP_REST_Response|WP_Error {
        $body = $request->get_json_params();
        if (!is_array($body) || !is_array($body['payload'] ?? null)) {
            return new WP_Error('invalid_import', '导入数据必须是 Maltose 导出 JSON', ['status' => 400]);
        }
        if (($body['payload']['theme'] ?? '') !== 'maltose') {
            return new WP_Error('invalid_theme', '无效的 Maltose 导出文件', ['status' => 400]);
        }
        $mode = ($body['mode'] ?? 'restore') === 'migrate' ? 'migrate' : 'restore';
        $report = MaltoseDataRegistry::import($body['payload']['data'] ?? [], $mode);
        return rest_ensure_response(['report' => $report]);
    }

    public static function dataCleanup(WP_REST_Request $request): WP_REST_Response {
        $body = $request->get_json_params();
        $categories = is_array($body) && is_array($body['categories'] ?? null)
            ? array_values(array_map('sanitize_text_field', array_filter($body['categories'], 'is_string')))
            : null;
        $deleted = MaltoseDataRegistry::clean($categories);
        return rest_ensure_response(['deleted' => $deleted]);
    }

    public static function dataMigrateClientIds(): WP_REST_Response {
        return rest_ensure_response(MaltoseBlockReference::migrateAllPosts());
    }

    public static function uninstallOverview(): WP_REST_Response {
        return self::dataOverview();
    }

    public static function runUninstall(WP_REST_Request $request): WP_REST_Response {
        $body = $request->get_json_params();
        $mode = is_array($body) ? ($body['mode'] ?? 'keep') : 'keep';
        $allowed = ['export_clean', 'export_keep', 'clean', 'keep'];
        if (!in_array($mode, $allowed, true)) $mode = 'keep';

        // Optional scope: null = everything (legacy behaviour), [] = nothing,
        // otherwise only the checked registry keys. export()/clean() already
        // filter by exportable / cleanup=keep internally.
        $scope = is_array($body) && is_array($body['categories'] ?? null)
            ? array_values(array_map('sanitize_text_field', array_filter($body['categories'], 'is_string')))
            : null;

        $export = null;
        if ($mode === 'export_clean' || $mode === 'export_keep') {
            $payload = MaltoseDataRegistry::export($scope);
            if (!empty($payload['data'])) {
                $export = [
                    'filename' => 'maltose-export-' . gmdate('Ymd-His') . '.json',
                    'payload'  => $payload,
                ];
            }
        }
        $deleted = [];
        if ($mode === 'export_clean' || $mode === 'clean') {
            $deleted = MaltoseDataRegistry::clean($scope);
        }
        return rest_ensure_response([
            'mode'    => $mode,
            'deleted' => $deleted,
            'export'  => $export,
        ]);
    }

    public static function orphanComments(): WP_REST_Response {
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
        $items = array_map(static function ($row): array {
            $decoded = json_decode((string) $row->meta_value, true);
            $permalink = get_permalink((int) $row->comment_post_ID);
            return [
                'commentId'     => (int) $row->comment_id,
                'author'        => (string) $row->comment_author,
                'authorEmail'   => (string) $row->comment_author_email,
                'clientId'      => (string) ($decoded['clientId'] ?? ''),
                'snippet'       => (string) ($decoded['snippet'] ?? ''),
                'content'       => (string) $row->comment_content,
                'date'          => (string) $row->comment_date,
                'link'          => $permalink ? $permalink . '#chat-comment-' . (int) $row->comment_id : '',
            ];
        }, $rows ?: []);
        return rest_ensure_response(['items' => $items]);
    }
}
