<?php
/**
 * Maltose — Announcements CPT (maltose_announcement)
 *
 * Headless 公告内容类型：无前台归档/单页、无 title 支持（自动生成
 * 「公告 · Y-m-d H:i」）、支持置顶 meta，经 WPGraphQL 暴露给 Astro 前端。
 */

defined('ABSPATH') || exit;

class MaltoseAnnouncements {

    const POST_TYPE        = 'maltose_announcement';
    const STICKY_META_KEY  = 'maltose_sticky';
    const AUTO_TITLE_PREFIX = '公告 · ';

    public static function init(): void {
        self::registerPostType();
        self::registerMeta();

        // 无标题自动生成：保存时（含新发布与编辑）为空的标题补时间戳。
        add_action('save_post_' . self::POST_TYPE, [self::class, 'onSavePost'], 10, 2);
        // 兜底：insert/update 入库前拦截，避免 save_post 未覆盖到的路径（如 quick edit / 程序化写入）。
        add_filter('wp_insert_post_data', [self::class, 'filterInsertPostData'], 10, 2);

        // 后台列表「置顶」列（低优先级增强）。
        add_filter('manage_' . self::POST_TYPE . '_posts_columns', [self::class, 'columns']);
        add_action('manage_' . self::POST_TYPE . '_posts_custom_column', [self::class, 'column'], 10, 2);
    }

    private static function registerPostType(): void {
        register_post_type(self::POST_TYPE, [
            'labels'              => [
                'name'               => '公告',
                'singular_name'      => '公告',
                'add_new'            => '添加公告',
                'add_new_item'       => '添加公告',
                'edit_item'          => '编辑公告',
                'new_item'           => '新公告',
                'view_item'          => '查看公告',
                'search_items'       => '搜索公告',
                'not_found'          => '未找到公告',
                'not_found_in_trash' => '回收站中无公告',
                'all_items'          => '全部公告',
                'menu_name'          => '公告',
            ],
            'public'              => false,
            'show_ui'             => true,
            'show_in_menu'        => true,
            'show_in_rest'        => true,
            'show_in_graphql'     => true,
            'graphql_single_name' => 'MaltoseAnnouncement',
            'graphql_plural_name' => 'MaltoseAnnouncements',
            'menu_position'       => 21,
            'menu_icon'           => 'dashicons-megaphone',
            'supports'            => ['editor', 'revisions'],
            'has_archive'         => false,
            'publicly_queryable'  => false,
            'rewrite'             => false,
            'exclude_from_search' => true,
            'show_in_nav_menus'   => false,
            'capability_type'     => 'post',
        ]);
    }

    private static function registerMeta(): void {
        register_post_meta(self::POST_TYPE, self::STICKY_META_KEY, [
            'type'          => 'boolean',
            'single'        => true,
            'show_in_rest'  => true,
            'auth_callback' => static fn() => current_user_can('edit_posts'),
        ]);
    }

    public static function register(): void {
        register_graphql_field('MaltoseAnnouncement', 'sticky', [
            'type'        => 'Boolean',
            'description' => __('公告是否置顶。', 'maltose'),
            'resolve'     => static function ($post) {
                $id = self::postIdFrom($post);
                return $id ? (bool) get_post_meta($id, self::STICKY_META_KEY, true) : false;
            },
        ]);
    }

    /** 保存时：标题为空或仅自动前缀时，填入「公告 · 当前时间」。 */
    public static function onSavePost(int $postId, \WP_Post $post): void {
        if (wp_is_post_revision($postId) || wp_is_post_autosave($postId)) {
            return;
        }
        if ($post->post_type !== self::POST_TYPE) {
            return;
        }
        if (!self::needsAutoTitle(trim((string) $post->post_title))) {
            return;
        }
        self::setAutoTitle($postId);
    }

    /** 兜底过滤器：入库前标题为空/纯前缀时直接补全，避免二次查询。 */
    public static function filterInsertPostData(array $data, array $postarr): array {
        if (($data['post_type'] ?? '') !== self::POST_TYPE) {
            return $data;
        }
        $title = trim((string) ($data['post_title'] ?? ''));
        if (self::needsAutoTitle($title)) {
            $data['post_title'] = self::autoTitle();
        }
        return $data;
    }

    private static function setAutoTitle(int $postId): void {
        // 包裹 remove_action/add_action 防 wp_update_post 再次触发 save_post 造成递归。
        remove_action('save_post_' . self::POST_TYPE, [self::class, 'onSavePost'], 10);
        wp_update_post(['ID' => $postId, 'post_title' => self::autoTitle()]);
        add_action('save_post_' . self::POST_TYPE, [self::class, 'onSavePost'], 10, 2);
    }

    private static function needsAutoTitle(string $title): bool {
        if ($title === '') {
            return true;
        }
        // 已带自动前缀：若已是完整「前缀 + 时间戳」则保持（避免每次编辑刷新时间），否则重新生成。
        if (strpos($title, self::AUTO_TITLE_PREFIX) === 0) {
            return !self::isCompleteAutoTitle($title);
        }
        return false; // 人工标题，不处理
    }

    private static function isCompleteAutoTitle(string $title): bool {
        return (bool) preg_match(
            '/^' . preg_quote(self::AUTO_TITLE_PREFIX, '/') . '\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/',
            $title
        );
    }

    private static function autoTitle(): string {
        return self::AUTO_TITLE_PREFIX . current_time('Y-m-d H:i');
    }

    private static function postIdFrom($post): ?int {
        if (is_object($post) && !empty($post->databaseId)) {
            return (int) $post->databaseId;
        }
        if (is_object($post) && !empty($post->ID)) {
            return (int) $post->ID;
        }
        return null;
    }

    // ── 后台列表「置顶」列 ────────────────────────────────────────────────

    public static function columns(array $columns): array {
        $date = $columns['date'] ?? null;
        unset($columns['date']);
        $columns[self::STICKY_META_KEY] = '置顶';
        if ($date !== null) {
            $columns['date'] = $date;
        }
        return $columns;
    }

    public static function column(string $column, int $postId): void {
        if ($column !== self::STICKY_META_KEY) {
            return;
        }
        if ((bool) get_post_meta($postId, self::STICKY_META_KEY, true)) {
            echo '<span aria-hidden="true">📌</span>';
            echo '<span class="screen-reader-text">置顶</span>';
        } else {
            echo '—';
        }
    }
}
