<?php
/**
 * Maltose — Post Views
 *
 * Self-contained view-count subsystem for headless setups.
 * Reads/writes the `views` postmeta key (shared with WP-PostViews) but
 * depends on no plugin functions, so it works with or without that plugin.
 */

defined('ABSPATH') || exit;

class MaltosePostViews {

    const VIEWS_META_KEY = 'views';
    const TRANSIENT_PREFIX = 'maltose_view_';
    const ANTI_ABUSE_WINDOW = 300; // seconds

    public static function register(): void {
        register_graphql_field('Post', 'viewCount', [
            'type'        => 'Int',
            'description' => __('Number of times this post has been viewed.', 'maltose'),
            'resolve'     => function ($post) {
                $id = self::postIdFrom($post);
                return $id ? self::getViews($id) : 0;
            },
        ]);

        register_graphql_field('RootQuery', 'mostViewedPosts', [
            'type'        => ['list_of' => 'Post'],
            'description' => __('Published posts ordered by view count, descending.', 'maltose'),
            'args'        => [
                'first' => [
                    'type'        => 'Int',
                    'description' => __('Maximum number of posts to return.', 'maltose'),
                ],
            ],
            'resolve'     => function ($source, $args) {
                $query = new WP_Query([
                    'post_type'      => 'post',
                    'post_status'    => 'publish',
                    'posts_per_page' => !empty($args['first']) ? (int) $args['first'] : 10,
                    'meta_key'       => self::VIEWS_META_KEY,
                    'orderby'        => 'meta_value_num',
                    'order'          => 'DESC',
                    'suppress_filters' => false,
                ]);

                return array_map(function ($post) {
                    return new \WPGraphQL\Model\Post($post);
                }, $query->posts);
            },
        ]);

        register_graphql_mutation('recordPostView', [
            'description' => __('Increment the view count of a post and return the new value.', 'maltose'),
            'inputFields' => [
                'postId' => [
                    'type'        => ['non_null' => 'ID'],
                    'description' => __('The database ID of the post to record a view for.', 'maltose'),
                ],
            ],
            'outputFields' => [
                'viewCount' => [
                    'type'        => 'Int',
                    'description' => __('The updated view count.', 'maltose'),
                    'resolve'     => function ($payload) {
                        return $payload['viewCount'];
                    },
                ],
            ],
            'mutateAndGetPayload' => function ($input) {
                $postId = absint($input['postId']);
                error_log('[MaltosePostViews] recordPostView input: ' . wp_json_encode($input));
                if (!$postId || !self::isPublishedPost($postId)) {
                    error_log('[MaltosePostViews] recordPostView REJECTED: postId=' . $postId
                        . ' status=' . var_export(get_post_status($postId), true));
                    return ['viewCount' => 0];
                }
                $result = self::incrementViews($postId);
                error_log('[MaltosePostViews] recordPostView postId=' . $postId . ' -> viewCount=' . $result);
                return ['viewCount' => $result];
            },
        ]);
    }

    public static function onSavePost(int $postId): void {
        if (wp_is_post_revision($postId)) {
            return;
        }
        $existing = get_post_meta($postId, self::VIEWS_META_KEY, true);
        if ($existing === '' || $existing === null) {
            add_post_meta($postId, self::VIEWS_META_KEY, 0, true);
        }
    }

    private static function getViews(int $postId): int {
        return (int) get_post_meta($postId, self::VIEWS_META_KEY, true);
    }

    private static function incrementViews(int $postId): int {
        $key = self::abuseKey($postId);
        $transientHit = get_transient($key) !== false;
        error_log('[MaltosePostViews] incrementViews postId=' . $postId
            . ' transient=' . ($transientHit ? 'HIT' : 'miss')
            . ' current=' . self::getViews($postId)
            . ' ip=' . self::clientIp());
        if ($transientHit) {
            // Same IP viewed this post within the window — count only once.
            return self::getViews($postId);
        }

        $views = self::getViews($postId) + 1;
        update_post_meta($postId, self::VIEWS_META_KEY, $views);
        set_transient($key, 1, self::ANTI_ABUSE_WINDOW);
        return $views;
    }

    private static function isPublishedPost(int $postId): bool {
        $status = get_post_status($postId);
        return $status === 'publish';
    }

    private static function abuseKey(int $postId): string {
        $ip = self::clientIp();
        return self::TRANSIENT_PREFIX . $postId . '_' . substr(hash('sha256', $ip), 0, 16);
    }

    private static function clientIp(): string {
        // Only trust X-Forwarded-For when a reverse proxy is known to set it.
        $forwarded = isset($_SERVER['HTTP_X_FORWARDED_FOR'])
            ? trim(explode(',', $_SERVER['HTTP_X_FORWARDED_FOR'])[0])
            : '';
        if ($forwarded && filter_var($forwarded, FILTER_VALIDATE_IP)) {
            return $forwarded;
        }
        return $_SERVER['REMOTE_ADDR'] ?? '';
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
}
