<?php
/**
 * Maltose — Cache Purge
 *
 * Notifies the Astro frontend when a post/page is published so it can
 * invalidate its Apollo in-memory cache. Uses the same shared-secret
 * signature scheme as the GraphQL gateway (SHA256(secret + timestamp)).
 */

defined('ABSPATH') || exit;

class MaltoseCachePurge {

    const OPTION_ASTRO_URL = 'maltose_astro_url';

    public static function onSavePost(int $postId): void {
        if (wp_is_post_revision($postId)) {
            return;
        }

        $status = get_post_status($postId);
        if ($status !== 'publish') {
            return;
        }

        $astroUrl = untrailingslashit(get_option(self::OPTION_ASTRO_URL, ''));
        if (empty($astroUrl)) {
            return;
        }

        $post = get_post($postId);
        $uri = $post ? get_permalink($postId) : '';

        self::notify($astroUrl, [
            'postId' => $postId,
            'uri'    => $uri,
        ]);
    }

    private static function notify(string $astroUrl, array $payload): void {
        $secret = (string) get_option('maltose_secret_key', '');
        if (empty($secret)) {
            return;
        }

        $timestamp = time();
        $signature = hash('sha256', $secret . $timestamp);
        $endpoint  = $astroUrl . '/api/cache-purge';

        $args = [
            'timeout'   => 5,
            'headers'   => [
                'Content-Type'            => 'application/json',
                'X-Graphql-Timestamp'     => (string) $timestamp,
                'X-Graphql-Signature'     => $signature,
            ],
            'body'      => wp_json_encode($payload),
            'blocking'  => false,
        ];

        wp_remote_post($endpoint, $args);
    }
}
