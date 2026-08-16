<?php
/**
 * Maltose — Comment Geo Stats
 *
 * 评论者地域分布（ADR-0026）。在 WP 服务端按 comment_author_IP 聚合评论数，
 * 再用离线 IP 解析器定位省份/国家，绕过 WPGraphQL 对 Comment.authorIp 的
 * 私有字段限制（未登录用户不可见该字段）。结果写入 transient（12h），
 * 评论增删改/审核状态变化时失效（comment_post / wp_set_comment_status /
 * deleted_comment hooks）。
 *
 * 局限说明：内置 MaltoseIpResolver 是 ip2region 的精简替代，仅覆盖常用
 * 大陆省份大段与主要国家/地区段；未命中或私有/保留地址返回 null（计入
 * total 但不计入 resolved，也不进任何榜单）。需要完整精度时，可将
 * ip2region.xdb 放入 wordpress-theme/inc/ip2region/ 并改用其 Searcher。
 */

defined('ABSPATH') || exit;

require_once __DIR__ . '/class-ip-resolver.php';

class MaltoseCommentGeo {

    const TRANSIENT_KEY = 'maltose_comment_geo_stats';
    const CACHE_TTL = 12 * HOUR_IN_SECONDS;

    public static function register(): void {
        register_graphql_object_type('MaltoseGeoEntry', [
            'description' => __('地域统计条目（名称 + 评论数）。', 'maltose'),
            'fields' => [
                'name' => ['type' => 'String'],
                'count' => ['type' => 'Int'],
            ],
        ]);

        register_graphql_object_type('MaltoseCommentGeoStats', [
            'description' => __('评论者地域分布统计。', 'maltose'),
            'fields' => [
                'total' => [
                    'type'        => 'Int',
                    'description' => __('带非空 IP 的已审评论总数。', 'maltose'),
                ],
                'resolved' => [
                    'type'        => 'Int',
                    'description' => __('成功定位到省份/国家的评论数。', 'maltose'),
                ],
                'updatedAt' => [
                    'type'        => 'String',
                    'description' => __('统计生成时间（Y-m-d H:i）。', 'maltose'),
                ],
                'provinces' => [
                    'type'        => ['list_of' => 'MaltoseGeoEntry'],
                    'description' => __('中国省级行政区榜（含港澳台）。', 'maltose'),
                ],
                'countries' => [
                    'type'        => ['list_of' => 'MaltoseGeoEntry'],
                    'description' => __('国家/地区榜（海外按国家计）。', 'maltose'),
                ],
            ],
        ]);

        register_graphql_field('RootQuery', 'commentGeoStats', [
            'type'        => 'MaltoseCommentGeoStats',
            'description' => __('评论者地域分布（服务端 IP 聚合，transient 缓存 12h）。', 'maltose'),
            'resolve'     => function () {
                return self::getStats();
            },
        ]);

        register_graphql_field('RootQuery', 'siteBirthday', [
            'type'        => 'String',
            'description' => __('站点建站日期（主题选项 site_birthday，YYYY-MM-DD），未设置时为 null。', 'maltose'),
            'resolve'     => function () {
                $birthday = get_option('maltose_site_birthday', '');
                return $birthday ?: null;
            },
        ]);
    }

    /** 评论增删改 / 审核状态变化时清空 transient 缓存。 */
    public static function invalidate(): void {
        delete_transient(self::TRANSIENT_KEY);
    }

    public static function getStats(): array {
        $cached = get_transient(self::TRANSIENT_KEY);
        if (is_array($cached)) {
            return $cached;
        }
        $stats = self::buildStats();
        set_transient(self::TRANSIENT_KEY, $stats, self::CACHE_TTL);
        return $stats;
    }

    private static function buildStats(): array {
        global $wpdb;

        // 只对唯一 IP 解析：SQL 先按 IP 分组聚合评论数，避免逐条解析。
        $rows = $wpdb->get_results(
            "SELECT comment_author_IP AS ip, COUNT(*) AS cnt
             FROM {$wpdb->comments}
             WHERE comment_approved = '1'
               AND comment_author_IP <> ''
             GROUP BY comment_author_IP
             ORDER BY cnt DESC
             LIMIT 2000",
            ARRAY_A
        );

        $resolver = new MaltoseIpResolver();
        $provinces = [];
        $countries = [];
        $total = 0;
        $resolved = 0;

        foreach ($rows as $row) {
            $ip = trim((string) ($row['ip'] ?? ''));
            $cnt = (int) ($row['cnt'] ?? 0);
            if ($cnt <= 0) {
                continue;
            }
            // total 统计所有带非空 IP 的已审评论（无论能否解析）；
            // resolved 只统计成功解析出归属地的部分。
            $total += $cnt;
            $loc = $resolver->resolve($ip);
            if (!$loc) {
                continue;
            }
            $resolved += $cnt;
            $countries[$loc['country']] = ($countries[$loc['country']] ?? 0) + $cnt;
            if (!empty($loc['province'])) {
                $provinces[$loc['province']] = ($provinces[$loc['province']] ?? 0) + $cnt;
            }
        }

        arsort($provinces);
        arsort($countries);

        return [
            'total'     => $total,
            'resolved'  => $resolved,
            'updatedAt' => current_time('Y-m-d H:i'),
            'provinces' => self::toEntries($provinces),
            'countries' => self::toEntries($countries),
        ];
    }

    private static function toEntries(array $map): array {
        $entries = [];
        foreach ($map as $name => $count) {
            $entries[] = ['name' => $name, 'count' => $count];
        }
        return $entries;
    }
}
