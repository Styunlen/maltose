<?php

class MaltoseStickyPosts {

    public static function register(): void {
        register_graphql_field('RootQuery', 'stickyPosts', [
            'type'        => ['list_of' => 'Post'],
            'description' => __('All sticky posts ordered by publish date desc.', 'maltose'),
            'resolve'     => function () {
                $stickyIds = get_option('sticky_posts', []);
                if (empty($stickyIds) || !is_array($stickyIds)) {
                    return [];
                }

                $posts = get_posts([
                    'post__in'       => array_map('intval', $stickyIds),
                    'post_type'      => 'post',
                    'post_status'    => 'publish',
                    'orderby'        => 'date',
                    'order'          => 'DESC',
                    'numberposts'    => -1,
                    'suppress_filters' => false,
                ]);

                // WPGraphQL expects Model\Post objects, not raw WP_Post objects
                return array_map(function ($post) {
                    return new \WPGraphQL\Model\Post($post);
                }, $posts);
            },
        ]);
    }
}
