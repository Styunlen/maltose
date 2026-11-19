<?php
/**
 * Maltose — top-level admin menu + React app shell (ADR-0044).
 *
 * Replaces the legacy "设置 → Maltose" options pages with a single top-level
 * menu entry whose page mounts the prebuilt React bundle from
 * wordpress-theme/assets/admin/. Assets are committed to the repo; the theme
 * enqueues them only on this page.
 */

defined('ABSPATH') || exit;

class MaltoseAdminApp {

    const MENU_SLUG = 'maltose';
    const ASSET_DIR = 'assets/admin';
    const HANDLE_JS  = 'maltose-admin-app';
    const HANDLE_CSS = 'maltose-admin-app-css';

    public static function init(): void {
        add_action('admin_menu', [self::class, 'addAdminMenu']);
        add_action('admin_enqueue_scripts', [self::class, 'enqueueAssets']);
    }

    public static function addAdminMenu(): void {
        add_menu_page(
            'Maltose 主题后台',
            'Maltose',
            'manage_options',
            self::MENU_SLUG,
            [self::class, 'renderAdminPage'],
            'dashicons-megaphone',
            21
        );
    }

    public static function enqueueAssets(string $hook): void {
        // Load the bundle only on our own page.
        if ($hook !== 'toplevel_page_' . self::MENU_SLUG) {
            return;
        }

        // Child-theme aware: argon_styunlen (child) holds the admin bundle, so
        // use get_theme_file_* which resolves child first, then parent.
        $js  = get_theme_file_path(self::ASSET_DIR . '/admin.js');
        $css = get_theme_file_path(self::ASSET_DIR . '/admin.css');

        if (file_exists($js)) {
            wp_enqueue_script(
                self::HANDLE_JS,
                get_theme_file_uri(self::ASSET_DIR . '/admin.js'),
                [],
                (string) filemtime($js),
                true
            );
        }
        if (file_exists($css)) {
            wp_enqueue_style(
                self::HANDLE_CSS,
                get_theme_file_uri(self::ASSET_DIR . '/admin.css'),
                [],
                (string) filemtime($css)
            );
        }

        wp_localize_script(self::HANDLE_JS, 'MaltoseAdminConfig', [
            'restUrl'  => esc_url_raw(rest_url('maltose/v1')),
            'nonce'    => wp_create_nonce('wp_rest'),
            'userName' => wp_get_current_user()->display_name,
        ]);
    }

    public static function renderAdminPage(): void {
        if (!current_user_can('manage_options')) {
            wp_die(esc_html__('你没有权限访问此页面。'));
        }
        // The React app mounts here; the bundle and styles are enqueued above.
        echo '<div id="maltose-admin-root"></div>';
    }
}
