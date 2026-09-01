<?php
/**
 * Maltose — Reading Enhancement Settings
 *
 * Bridges the theme "阅读增强" options (hover link preview, ADR-0025) to the
 * Astro frontend via a RootQuery.maltoseSettings GraphQL field. The frontend
 * and the /api/preview routes read these instead of hardcoding values.
 */

defined('ABSPATH') || exit;

class MaltoseSettings {

    public static function register(): void {
        register_graphql_object_type('MaltoseSettings', [
            'description' => __('Reading enhancement settings (hover link preview).', 'maltose'),
            'fields'      => [
                'previewEnabled' => [
                    'type'        => 'Boolean',
                    'description' => __('Master switch for hover preview cards.', 'maltose'),
                ],
                'previewDelay' => [
                    'type'        => 'Int',
                    'description' => __('Trigger delay in milliseconds before loading preview data.', 'maltose'),
                ],
                'previewExcerptLen' => [
                    'type'        => 'Int',
                    'description' => __('Excerpt truncation length for preview cards.', 'maltose'),
                ],
                'previewWpm' => [
                    'type'        => 'Int',
                    'description' => __('Words-per-minute used to estimate reading time.', 'maltose'),
                ],
                'previewCacheTtl' => [
                    'type'        => 'Int',
                    'description' => __('Cache TTL in seconds for preview data.', 'maltose'),
                ],
                'previewRecent' => [
                    'type'        => 'Int',
                    'description' => __('Number of recent posts shown on term cards; 0 means total only.', 'maltose'),
                ],
            ],
        ]);

        register_graphql_field('RootQuery', 'maltoseSettings', [
            'type'        => 'MaltoseSettings',
            'description' => __('Theme "阅读增强" options bridged from get_option().', 'maltose'),
            'resolve'     => function () {
                return [
                    'previewEnabled'   => (bool) get_option('maltose_preview_enabled', 1),
                    'previewDelay'     => (int) get_option('maltose_preview_delay', 300),
                    'previewExcerptLen' => (int) get_option('maltose_preview_excerpt_len', 120),
                    'previewWpm'       => (int) get_option('maltose_preview_wpm', 400),
                    'previewCacheTtl'  => (int) get_option('maltose_preview_cache_ttl', 300),
                    'previewRecent'    => (int) get_option('maltose_preview_recent', 3),
                ];
            },
        ]);
    }
}
