<?php
/**
 * Maltose — Change Username
 *
 * WordPress 核心在 wp_insert_user 更新路径中主动丢弃 user_login，且
 * WPGraphQL 的 updateUser 输入不暴露 username 字段。此文件补齐两者：
 * 1. 给 UpdateUserInput 增加 username 字段（供自服务改登录名）。
 * 2. 通过 wp_pre_insert_user_data 在写库前强制持久化 user_login。
 * 3. 在 graphql_user_insert_post_args 中校验唯一性与非法字符。
 *
 * 权限：WPGraphQL updateUser 对自身执行 current_user_can('edit_user', self)
 * 检查，任何已登录用户均可修改自己的登录名；改他人则需 edit_users。
 *
 * 注：maltoseLastLogin 字段注册在 class-email-otp.php（认证相关职责）。
 */

defined('ABSPATH') || exit;

use GraphQL\Error\UserError;

class MaltoseChangeUsername {

    public static function register(): void {
        // Add `username` to the updateUser input schema.
        add_action('graphql_register_types', function () {
            register_graphql_field('UpdateUserInput', 'username', [
                'type'        => 'String',
                'description' => __('The user\'s login username (user_login).', 'maltose'),
            ]);
        });

        // 3) Validate before persisting (uniqueness + sanitize + illegal logins).
        add_filter('graphql_user_insert_post_args', [self::class, 'validateUsername'], 10, 3);

        // 2) Persist user_login on update (core drops it; this is the only WP-API way).
        add_filter('wp_pre_insert_user_data', [self::class, 'persistUserLogin'], 10, 4);
    }

    public static function validateUsername($insert_user_args, $input, $mutation_name) {
        if ('updateUser' !== $mutation_name || empty($input['username'])) {
            return $insert_user_args;
        }

        $new_login = sanitize_user($input['username'], true);

        if ($new_login !== $input['username']) {
            throw new UserError(__('用户名包含非法字符，请使用字母、数字、下划线、中划线或点。', 'maltose'));
        }
        if (mb_strlen($new_login) > 60) {
            throw new UserError(__('用户名不能超过 60 个字符。', 'maltose'));
        }

        $illegal_logins = (array) apply_filters('illegal_user_logins', []);
        if (in_array(strtolower($new_login), array_map('strtolower', $illegal_logins), true)) {
            throw new UserError(__('该用户名不允许使用。', 'maltose'));
        }

        $owner = username_exists($new_login);
        if ($owner && (int) $owner !== (int) ($input['id'] ?: 0)) {
            throw new UserError(__('该用户名已被占用。', 'maltose'));
        }

        // Propagate the sanitized login so persistUserLogin sees it.
        $insert_user_args['user_login'] = $new_login;
        return $insert_user_args;
    }

    public static function persistUserLogin($data, $update, $user_id, $userdata) {
        if ($update && ! empty($userdata['user_login'])) {
            $data['user_login'] = $userdata['user_login'];
        }
        return $data;
    }
}
