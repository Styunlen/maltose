<?php
/**
 * Maltose — Site Config (社交链接 + 博主账号)
 *
 * 通过 RootQuery.siteConfig 暴露给 Astro 前端：社交链接列表 + 站点博主信息。
 * 社交链接存为 JSON（maltose_social_links），博主账号为 int 用户 ID 数组
 * （maltose_owner_user_ids）。设置项随数据注册表（DataRegistry）清理。
 */

defined('ABSPATH') || exit;

class MaltoseSiteConfig {

    const OPTION_SOCIAL_LINKS   = 'maltose_social_links';
    const OPTION_OWNER_USER_IDS = 'maltose_owner_user_ids';
    const SETTINGS_GROUP        = 'maltose_site_config_group';

    public static function init(): void {
        self::registerSettings();
    }

    private static function registerSettings(): void {
        register_setting(self::SETTINGS_GROUP, self::OPTION_SOCIAL_LINKS, [
            'type'              => 'string',
            'sanitize_callback' => [self::class, 'sanitizeSocialLinks'],
            'default'           => '[]',
        ]);
        register_setting(self::SETTINGS_GROUP, self::OPTION_OWNER_USER_IDS, [
            'type'              => 'array',
            'sanitize_callback' => [self::class, 'sanitizeOwnerUserIds'],
            'default'           => [],
        ]);
    }

    /** 校验并序列化社交链接：label/url/icon 非空、url 须 http(s)、iconType 合法。 */
    public static function sanitizeSocialLinks($value): string {
        $links = json_decode((string) $value, true);
        if (!is_array($links)) {
            $links = [];
        }
        $out = [];
        $i = 0;
        foreach ($links as $link) {
            if (!is_array($link)) {
                continue;
            }
            $label    = trim((string) ($link['label'] ?? ''));
            $url      = trim((string) ($link['url'] ?? ''));
            $icon     = trim((string) ($link['icon'] ?? ''));
            $iconType = ($link['iconType'] ?? '') === 'iconify' ? 'iconify' : 'url';
            if ($label === '' || $url === '' || $icon === '') {
                continue;
            }
            if (!preg_match('#^https?://#i', $url)) {
                continue;
            }
            $i++;
            $out[] = [
                'key'      => (is_string($link['key'] ?? null) && $link['key'] !== '') ? $link['key'] : 'social-' . $i,
                'label'    => $label,
                'url'      => $url,
                'iconType' => $iconType,
                'icon'     => $icon,
            ];
        }
        return wp_json_encode(array_values($out), JSON_UNESCAPED_UNICODE);
    }

    /** 校验博主账号 ID 数组：intval + 去重 + 过滤 0。 */
    public static function sanitizeOwnerUserIds($value): array {
        $ids = [];
        foreach ((array) $value as $id) {
            $id = (int) $id;
            if ($id > 0) {
                $ids[] = $id;
            }
        }
        return array_values(array_unique($ids));
    }

    public static function socialLinks(): array {
        $raw = get_option(self::OPTION_SOCIAL_LINKS, '[]');
        $links = json_decode((string) $raw, true);
        return is_array($links) ? $links : [];
    }

    public static function ownerUserIds(): array {
        return array_values(array_filter(array_map('intval', (array) get_option(self::OPTION_OWNER_USER_IDS, []))));
    }

    // ── GraphQL ───────────────────────────────────────────────────────────

    public static function register(): void {
        register_graphql_object_type('MaltoseSocialLink', [
            'description' => __('站点社交链接。', 'maltose'),
            'fields'      => [
                'label'    => ['type' => 'String', 'description' => __('平台名。', 'maltose')],
                'url'      => ['type' => 'String', 'description' => __('链接地址。', 'maltose')],
                'iconType' => ['type' => 'String', 'description' => __('图标类型：url 或 iconify。', 'maltose')],
                'icon'     => ['type' => 'String', 'description' => __('图标值：图片 URL 或 iconify 图标名。', 'maltose')],
            ],
        ]);

        register_graphql_object_type('MaltoseOwnerAvatar', [
            'description' => __('博主头像。', 'maltose'),
            'fields'      => [
                'url' => ['type' => 'String', 'description' => __('头像 URL。', 'maltose')],
            ],
        ]);

        register_graphql_object_type('MaltoseOwner', [
            'description' => __('站点博主信息。', 'maltose'),
            'fields'      => [
                'name'        => ['type' => 'String', 'description' => __('昵称。', 'maltose')],
                'description' => ['type' => 'String', 'description' => __('简介。', 'maltose')],
                'avatar'      => ['type' => 'MaltoseOwnerAvatar', 'description' => __('头像。', 'maltose')],
                'url'         => ['type' => 'String', 'description' => __('个人主页 URL。', 'maltose')],
            ],
        ]);

        register_graphql_object_type('MaltoseSiteConfig', [
            'description' => __('站点级配置（社交链接 + 博主）。', 'maltose'),
            'fields'      => [
                'socialLinks' => [
                    'type'        => ['list_of' => 'MaltoseSocialLink'],
                    'description' => __('社交链接列表。', 'maltose'),
                ],
                'owner' => [
                    'type'        => 'MaltoseOwner',
                    'description' => __('站点博主（未配置/用户不存在时为 null）。', 'maltose'),
                ],
            ],
        ]);

        register_graphql_field('RootQuery', 'siteConfig', [
            'type'        => 'MaltoseSiteConfig',
            'description' => __('站点社交链接与博主配置。', 'maltose'),
            'resolve'     => static function () {
                return [
                    'socialLinks' => array_map(static fn($l) => [
                        'label'    => (string) ($l['label'] ?? ''),
                        'url'      => (string) ($l['url'] ?? ''),
                        'iconType' => (string) ($l['iconType'] ?? 'url'),
                        'icon'     => (string) ($l['icon'] ?? ''),
                    ], self::socialLinks()),
                    'owner' => self::ownerPayload(),
                ];
            },
        ]);
    }

    private static function ownerPayload(): ?array {
        $ids = self::ownerUserIds();
        if (empty($ids)) {
            return null;
        }
        $user = get_user_by('ID', $ids[0]);
        if (!$user) {
            return null;
        }
        $avatar = get_avatar_url($user->ID, ['size' => 256]);
        return [
            'name'        => $user->display_name ?: $user->user_login,
            'description' => (string) ($user->description ?? ''),
            'avatar'      => ['url' => $avatar ?: null],
            'url'         => (string) ($user->user_url ?? ''),
        ];
    }
}
