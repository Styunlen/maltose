<?php

class AstroPressAgentPublic {

    public static function register(): void {
        register_graphql_field('Comment', 'agentPublic', [
            'type'        => 'String',
            'auth'        => null,
            'description' => __('User agent stored by WordPress when the comment was created.', 'maltose'),
            'resolve'     => function ($comment) {
                $full = get_comment($comment->databaseId);
                return !empty($full->comment_agent) ? $full->comment_agent : null;
            },
        ]);
    }
}
