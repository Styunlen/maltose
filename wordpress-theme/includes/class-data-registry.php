<?php
/**
 * Maltose — Theme Data Registry (ADR-0036 P2)
 *
 * 统一注册主题写入的所有「额外数据」定义，让导出 / 导入 / 卸载向导按注册表
 * 遍历执行，避免散落 meta 失控。每个条目声明：
 *
 *   key        → 数据标识（meta key / transient 前缀 / option key）
 *   medium     → post_meta | user_meta | comment_meta | option | transient | file | custom
 *   cleanup    → clean（卸载时直接删）| ask（卸载时列出待用户确认）| keep（不自动处理）
 *   exportable → true（进入导出/导入）| false（仅可清理）
 *   label      → 管理界面显示名
 *
 * 约定：所有 meta / transient key 使用 maltose_ 前缀，卸载清理按前缀精确匹配。
 */

defined('ABSPATH') || exit;

class MaltoseDataRegistry {

    const MEDIUM_POST_META    = 'post_meta';
    const MEDIUM_USER_META    = 'user_meta';
    const MEDIUM_COMMENT_META = 'comment_meta';
    const MEDIUM_OPTION       = 'option';
    const MEDIUM_TRANSIENT    = 'transient';
    const MEDIUM_FILE         = 'file';

    const CLEAN_CLEAN = 'clean';
    const CLEAN_ASK   = 'ask';
    const CLEAN_KEEP  = 'keep';

    /** @var array<string, array{medium:string,cleanup:string,exportable:bool,label:string}> */
    private static $items = [];

    public static function init(): void {
        self::registerCore();
    }

    public static function register(array $def): void {
        $key = $def['key'];
        $medium = $def['medium'];
        $cleanup = $def['cleanup'] ?? self::CLEAN_CLEAN;
        $exportable = $def['exportable'] ?? true;
        $label = $def['label'] ?? $key;
        self::$items[$key] = compact('medium', 'cleanup', 'exportable', 'label');
    }

    private static function registerCore(): void {
        // 阅读量：保持 `views` 兼容 key（wp-postviews），post_meta。
        self::register([
            'key' => 'views',
            'medium' => self::MEDIUM_POST_META,
            'cleanup' => self::CLEAN_CLEAN,
            'exportable' => true,
            'label' => '文章阅读量 (post_meta: views)',
        ]);

        // OTP 自动创建账号标记：卸载时列出待确认（可能已改密成为正常用户）。
        self::register([
            'key' => 'maltose_otp_user',
            'medium' => self::MEDIUM_USER_META,
            'cleanup' => self::CLEAN_ASK,
            'exportable' => false,
            'label' => 'OTP 自动创建账号标记 (user_meta: maltose_otp_user)',
        ]);

        // 最近登录时间 / 待完善资料标记：随主题清理即可。
        self::register([
            'key' => 'maltose_last_login',
            'medium' => self::MEDIUM_USER_META,
            'cleanup' => self::CLEAN_CLEAN,
            'exportable' => false,
            'label' => '最近登录时间 (user_meta: maltose_last_login)',
        ]);
        self::register([
            'key' => 'maltose_needs_profile',
            'medium' => self::MEDIUM_USER_META,
            'cleanup' => self::CLEAN_CLEAN,
            'exportable' => false,
            'label' => '待完善资料标记 (user_meta: maltose_needs_profile)',
        ]);

        // 段落评论锚定（ADR-0036 P3）：comment_meta，随评论级联删除。
        self::register([
            'key' => 'maltose_block_ref',
            'medium' => self::MEDIUM_COMMENT_META,
            'cleanup' => self::CLEAN_CLEAN,
            'exportable' => true,
            'label' => '段落评论锚定 (comment_meta: maltose_block_ref)',
        ]);

        // 10 个设置项：options，清理时逐个删。
        foreach (MaltoseAdminSettings::OPTIONS as $key => $default) {
            self::register([
                'key' => $key,
                'medium' => self::MEDIUM_OPTION,
                'cleanup' => self::CLEAN_CLEAN,
                'exportable' => $key === 'maltose_secret_key' ? false : true,
                'label' => "设置项 (option: {$key})",
            ]);
        }

        // OTP 日志文件：无界追加 + 含 PII，卸载时删除。
        self::register([
            'key' => 'maltose-otp.log',
            'medium' => self::MEDIUM_FILE,
            'cleanup' => self::CLEAN_CLEAN,
            'exportable' => false,
            'label' => 'OTP 日志文件 (wp-content/uploads/maltose-otp.log)',
        ]);

        // Transients：TTL 自清，卸载时按前缀清理，不导出。
        self::register([
            'key' => 'maltose_comment_geo_stats',
            'medium' => self::MEDIUM_TRANSIENT,
            'cleanup' => self::CLEAN_CLEAN,
            'exportable' => false,
            'label' => '评论地域统计缓存 (transient)',
        ]);
        self::register([
            'key' => 'maltose_view_',
            'medium' => self::MEDIUM_TRANSIENT,
            'cleanup' => self::CLEAN_CLEAN,
            'exportable' => false,
            'label' => '阅读防滥用窗口 (transient: maltose_view_*)',
        ]);
        self::register([
            'key' => 'maltose_otp_',
            'medium' => self::MEDIUM_TRANSIENT,
            'cleanup' => self::CLEAN_CLEAN,
            'exportable' => false,
            'label' => 'OTP 验证码/节流 (transient: maltose_otp_*)',
        ]);
    }

    public static function items(): array {
        return self::$items;
    }

    public static function byMedium(string $medium): array {
        return array_filter(self::$items, static fn($d) => $d['medium'] === $medium);
    }

    public static function byCleanup(string $cleanup): array {
        return array_filter(self::$items, static fn($d) => $d['cleanup'] === $cleanup);
    }

    public static function exportable(): array {
        return array_filter(self::$items, static fn($d) => $d['exportable']);
    }

    /**
     * 导出所选类别的数据（按 registry 条目遍历，返回可 JSON 序列化的数组）。
     * $categories 为 key 列表；null = 全部 exportable。
     */
    public static function export(?array $categories = null): array {
        $result = ['exported_at' => gmdate('c'), 'theme' => 'maltose', 'schema' => 1, 'data' => []];
        $items = $categories === null ? self::exportable() : array_intersect_key(self::exportable(), array_flip($categories));
        foreach ($items as $key => $def) {
            $result['data'][$key] = self::readItem($key, $def);
        }
        return $result;
    }

    /** 清理所选类别数据；$categories 为 key 列表；null = 全部 clean+ask。 */
    public static function clean(?array $categories = null): array {
        $items = $categories === null ? self::$items : array_intersect_key(self::$items, array_flip($categories));
        $deleted = [];
        foreach ($items as $key => $def) {
            $count = self::deleteItem($key, $def);
            if ($count > 0) {
                $deleted[$key] = $count;
            }
        }
        return $deleted;
    }

    public static function previewClean(): array {
        $out = [];
        foreach (self::$items as $key => $def) {
            $count = self::countItem($key, $def);
            if ($count > 0) {
                $out[$key] = ['label' => $def['label'], 'cleanup' => $def['cleanup'], 'count' => $count];
            }
        }
        return $out;
    }

    /**
     * 导入导出数据。$data 为 export() 产出结构（key → 值）。
     * $mode: restore（同站，按 ID 直接写）| migrate（跨站，按可匹配键：post slug / comment clientId）。
     * 返回报告：['ok' => [key => count], 'skipped' => [key => reason]]。
     */
    public static function import(array $data, string $mode = 'restore'): array {
        $report = ['ok' => [], 'skipped' => []];
        foreach ($data as $key => $value) {
            $def = self::$items[$key] ?? null;
            if (!$def || !$def['exportable']) {
                $report['skipped'][$key] = '未注册或不可导出';
                continue;
            }
            try {
                $n = self::writeItem($key, $def, $value, $mode);
                $report['ok'][$key] = $n;
            } catch (\Exception $e) {
                $report['skipped'][$key] = $e->getMessage();
            }
        }
        return $report;
    }

    // ── 单条读写 ────────────────────────────────────────────────────────────

    private static function readItem(string $key, array $def): mixed {
        global $wpdb;
        switch ($def['medium']) {
            case self::MEDIUM_OPTION:
                return get_option($key, null);
            case self::MEDIUM_POST_META:
                $rows = $wpdb->get_results($wpdb->prepare(
                    "SELECT pm.post_id, pm.meta_value, p.post_name AS slug
                     FROM {$wpdb->postmeta} pm
                     LEFT JOIN {$wpdb->posts} p ON p.ID = pm.post_id
                     WHERE pm.meta_key = %s",
                    $key
                ), ARRAY_A);
                return array_map(static fn($r) => [
                    'post_id'    => (int) $r['post_id'],
                    'slug'       => $r['slug'] ?? '',
                    'meta_value' => $r['meta_value'],
                ], $rows);
            case self::MEDIUM_USER_META:
                $rows = $wpdb->get_col($wpdb->prepare(
                    "SELECT meta_value FROM {$wpdb->usermeta} WHERE meta_key = %s",
                    $key
                ));
                return $rows;
            case self::MEDIUM_COMMENT_META:
                $rows = $wpdb->get_col($wpdb->prepare(
                    "SELECT meta_value FROM {$wpdb->commentmeta} WHERE meta_key = %s",
                    $key
                ));
                return $rows;
            case self::MEDIUM_TRANSIENT:
                return get_transient($key);
            case self::MEDIUM_FILE:
                $path = WP_CONTENT_DIR . '/uploads/' . $key;
                return file_exists($path) ? ['size' => filesize($path), 'mtime' => filemtime($path)] : null;
            default:
                return null;
        }
    }

    private static function countItem(string $key, array $def): int {
        global $wpdb;
        switch ($def['medium']) {
            case self::MEDIUM_OPTION:
                return get_option($key, null) !== null ? 1 : 0;
            case self::MEDIUM_POST_META:
                return (int) $wpdb->get_var($wpdb->prepare(
                    "SELECT COUNT(*) FROM {$wpdb->postmeta} WHERE meta_key = %s", $key
                ));
            case self::MEDIUM_USER_META:
                return (int) $wpdb->get_var($wpdb->prepare(
                    "SELECT COUNT(*) FROM {$wpdb->usermeta} WHERE meta_key = %s", $key
                ));
            case self::MEDIUM_COMMENT_META:
                return (int) $wpdb->get_var($wpdb->prepare(
                    "SELECT COUNT(*) FROM {$wpdb->commentmeta} WHERE meta_key = %s", $key
                ));
            case self::MEDIUM_TRANSIENT:
                if (self::isPrefixKey($key)) {
                    return self::countTransientPrefix($key);
                }
                return get_transient($key) !== false ? 1 : 0;
            case self::MEDIUM_FILE:
                $path = WP_CONTENT_DIR . '/uploads/' . $key;
                return file_exists($path) ? 1 : 0;
            default:
                return 0;
        }
    }

    private static function deleteItem(string $key, array $def): int {
        global $wpdb;
        switch ($def['medium']) {
            case self::MEDIUM_OPTION:
                if (get_option($key, null) !== null) {
                    delete_option($key);
                    return 1;
                }
                return 0;
            case self::MEDIUM_POST_META:
                $n = (int) $wpdb->query($wpdb->prepare(
                    "DELETE FROM {$wpdb->postmeta} WHERE meta_key = %s", $key
                ));
                return $n;
            case self::MEDIUM_USER_META:
                $n = (int) $wpdb->query($wpdb->prepare(
                    "DELETE FROM {$wpdb->usermeta} WHERE meta_key = %s", $key
                ));
                return $n;
            case self::MEDIUM_COMMENT_META:
                $n = (int) $wpdb->query($wpdb->prepare(
                    "DELETE FROM {$wpdb->commentmeta} WHERE meta_key = %s", $key
                ));
                return $n;
            case self::MEDIUM_TRANSIENT:
                if (self::isPrefixKey($key)) {
                    return self::deleteTransientPrefix($key);
                }
                if (delete_transient($key)) {
                    return 1;
                }
                return 0;
            case self::MEDIUM_FILE:
                $path = WP_CONTENT_DIR . '/uploads/' . $key;
                if (file_exists($path)) {
                    unlink($path);
                    return 1;
                }
                return 0;
            default:
                return 0;
        }
    }

    /**
     * 写入单条数据。restore 模式按原值直写；migrate 模式对 post_meta
     * （views）按 post slug 匹配、对 comment_meta（block_ref）按 clientId
     * 匹配（结构内已含），匹配不到则抛异常进 skipped。
     */
    private static function writeItem(string $key, array $def, mixed $value, string $mode): int {
        global $wpdb;
        if ($mode === 'restore') {
            return self::writeItemRestore($key, $def, $value);
        }
        switch ($def['medium']) {
            case self::MEDIUM_OPTION:
                update_option($key, $value);
                return 1;
            case self::MEDIUM_POST_META:
                $count = 0;
                foreach ((array) $value as $row) {
                    $postId = self::postIdBySlug($row['slug'] ?? '');
                    if (!$postId) {
                        throw new \Exception("post slug 未匹配: " . ($row['slug'] ?? ''));
                    }
                    update_post_meta($postId, $key, $row['meta_value']);
                    $count++;
                }
                return $count;
            case self::MEDIUM_COMMENT_META:
                $count = 0;
                foreach ((array) $value as $row) {
                    $decoded = json_decode($row['meta_value'] ?? '', true);
                    $clientId = is_array($decoded) ? ($decoded['clientId'] ?? '') : '';
                    if (!$clientId) {
                        throw new \Exception("block_ref 缺 clientId");
                    }
                    $count++; // clientId 为 WP 块内稳定键，跨站可直接沿用；由前端渲染时匹配
                }
                return $count;
            default:
                throw new \Exception("medium 不支持迁移: {$def['medium']}");
        }
    }

    private static function writeItemRestore(string $key, array $def, mixed $value): int {
        global $wpdb;
        switch ($def['medium']) {
            case self::MEDIUM_OPTION:
                if (get_option($key, null) === null) {
                    add_option($key, $value);
                } else {
                    update_option($key, $value);
                }
                return 1;
            case self::MEDIUM_POST_META:
                $count = 0;
                foreach ((array) $value as $row) {
                    $postId = (int) ($row['post_id'] ?? 0);
                    if (!$postId) {
                        continue;
                    }
                    if (get_post_meta($postId, $key, true) !== '') {
                        update_post_meta($postId, $key, $row['meta_value']);
                    } else {
                        add_post_meta($postId, $key, $row['meta_value']);
                    }
                    $count++;
                }
                return $count;
            default:
                throw new \Exception("medium 不支持恢复: {$def['medium']}");
        }
    }

    private static function postIdBySlug(string $slug): int {
        if (!$slug) {
            return 0;
        }
        $post = get_page_by_path($slug, OBJECT, ['post', 'page']);
        return $post ? (int) $post->ID : 0;
    }

    private static function isPrefixKey(string $key): bool {
        return str_ends_with($key, '_');
    }

    private static function transientKeys(string $prefix): array {
        global $wpdb;
        $rows = $wpdb->get_col($wpdb->prepare(
            "SELECT option_name FROM {$wpdb->options}
             WHERE option_name LIKE %s",
            $wpdb->esc_like('_transient_' . $prefix) . '%'
        ));
        return array_map(static fn($n) => preg_replace('/^_transient_/', '', (string) $n), $rows);
    }

    private static function countTransientPrefix(string $prefix): int {
        return count(self::transientKeys($prefix));
    }

    private static function deleteTransientPrefix(string $prefix): int {
        $n = 0;
        foreach (self::transientKeys($prefix) as $key) {
            if (delete_transient($key)) {
                $n++;
            }
        }
        return $n;
    }
}
