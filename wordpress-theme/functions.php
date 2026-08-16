<?php
/**
 * Maltose — Theme Functions
 *
 * 提供 GraphQL 安全签名校验、agentPublic 字段注册、后台设置页面。
 * 此为「纯功能主题」，不包含前端样式。
 */

defined('ABSPATH') || exit;

$theme_dir = __DIR__;

require_once $theme_dir . '/includes/class-signature-verifier.php';
require_once $theme_dir . '/includes/class-agent-public.php';
require_once $theme_dir . '/includes/class-admin-settings.php';
require_once $theme_dir . '/includes/class-sticky-posts.php';
require_once $theme_dir . '/includes/class-post-views.php';
require_once $theme_dir . '/includes/class-comment-geo.php';

add_action('init', [AstroPressSignatureVerifier::class, 'init']);
add_action('graphql_register_types', [AstroPressAgentPublic::class, 'register']);
add_action('graphql_register_types', [MaltoseStickyPosts::class, 'register']);
add_action('graphql_register_types', [MaltosePostViews::class, 'register']);
add_action('graphql_register_types', [MaltoseCommentGeo::class, 'register']);
add_action('save_post', [MaltosePostViews::class, 'onSavePost']);
add_action('admin_menu', [MaltoseAdminSettings::class, 'addAdminMenu']);
add_action('admin_init', [MaltoseAdminSettings::class, 'init']);
// 评论地域统计缓存失效（ADR-0026 决策 2）：增删改 + 审核状态变化。
add_action('comment_post', [MaltoseCommentGeo::class, 'invalidate']);
add_action('wp_set_comment_status', [MaltoseCommentGeo::class, 'invalidate']);
add_action('deleted_comment', [MaltoseCommentGeo::class, 'invalidate']);
