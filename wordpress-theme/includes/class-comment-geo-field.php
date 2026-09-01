<?php
/**
 * 单条评论地理位置（ADR-0026 评论维度）。Comment.commentGeo 用
 * MaltoseIpResolver 解析 comment_author_IP → country/province。
 *
 * 不用 WPGraphQL 原生 authorIp：该字段受 moderate_comments 权限门控，
 * 匿名访客查询返回 null，故必须在服务端解析成非敏感地理字符串再输出，
 * 同时避免向公网暴露原始 IP。resolver 为纯内存 CIDR 匹配，评论列表
 * ≤100 条全量解析开销可忽略，不做 transient 缓存。
 */

defined('ABSPATH') || exit;

require_once __DIR__ . '/class-ip-resolver.php';

class MaltoseCommentGeoField {

    public static function register(): void {
        register_graphql_object_type('MaltoseCommentGeo', [
            'description' => __('评论者 IP 地理位置（服务端解析，仅暴露国家/省份）。', 'maltose'),
            'fields'      => [
                'country' => [
                    'type'        => 'String',
                    'description' => __('国家/地区。', 'maltose'),
                ],
                'province' => [
                    'type'        => 'String',
                    'description' => __('中国省级行政区（含港澳台）；海外评论为 null。', 'maltose'),
                ],
            ],
        ]);

        register_graphql_field('Comment', 'commentGeo', [
            'type'        => 'MaltoseCommentGeo',
            'auth'        => null,
            'description' => __('评论者 IP 定位结果（country/province），匿名可读。', 'maltose'),
            'resolve'     => function ($comment) {
                $full = get_comment($comment->databaseId);
                $ip = !empty($full->comment_author_IP) ? $full->comment_author_IP : '';
                if (!$ip) {
                    return null;
                }
                $resolver = new MaltoseIpResolver();
                $loc = $resolver->resolve($ip);
                if (!$loc) {
                    return null;
                }
                return [
                    'country'  => $loc['country'],
                    'province' => $loc['province'],
                ];
            },
        ]);
    }
}
