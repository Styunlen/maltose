<?php
/**
 * 段落评论锚定（ADR-0036 P3）。
 *
 * Comment.blockReference 字段：读取 comment_meta `maltose_block_ref`
 * （JSON：{ clientId, snippet }），匿名可读，用于前端把评论挂到段落。
 *
 * CreateCommentInput.blockReference 输入字段 + comment_post 钩子：
 * 创建评论时若带了该输入，落库为 comment_meta。snippet 在服务端截断到
 * 80 字符（与前端保持一致，防伪造超长值）。块存在性不做校验——
 * 悬空由前端按 clientId 渲染时判定，评论数据本身永不因块删除而丢失。
 */

defined('ABSPATH') || exit;

class MaltoseBlockReference {

    const META_KEY = 'maltose_block_ref';
    const SNIPPET_MAX = 80;

    public static function register(): void {
        register_graphql_object_type('MaltoseBlockReference', [
            'description' => __('段落评论锚定（客户端ID + 段落文本快照）。', 'maltose'),
            'fields'      => [
                'clientId' => [
                    'type'        => 'String',
                    'description' => __('Gutenberg 块 clientId（锚定段落）。', 'maltose'),
                ],
                'snippet' => [
                    'type'        => 'String',
                    'description' => __('锚定时段落文本快照（≤80 字），供重绑对照。', 'maltose'),
                ],
            ],
        ]);

        register_graphql_field('Comment', 'blockReference', [
            'type'        => 'MaltoseBlockReference',
            'auth'        => null,
            'description' => __('段落评论锚定（可能为 null = 普通评论）。', 'maltose'),
            'resolve'     => static function ($comment) {
                $raw = get_comment_meta($comment->databaseId, self::META_KEY, true);
                if (!$raw) {
                    return null;
                }
                $decoded = json_decode((string) $raw, true);
                if (!is_array($decoded) || empty($decoded['clientId'])) {
                    return null;
                }
                return [
                    'clientId' => sanitize_text_field($decoded['clientId']),
                    'snippet'  => isset($decoded['snippet']) ? sanitize_text_field($decoded['snippet']) : '',
                ];
            },
        ]);

        // CreateCommentInput 增加可选 blockReference 输入（WPGraphQL 原生无 meta 输入）。
        register_graphql_field('CreateCommentInput', 'blockReference', [
            'type'        => 'String',
            'description' => __('段落锚定 JSON（{clientId, snippet}），可选。', 'maltose'),
        ]);

        // 持久化策略：graphql_mutation_input 在 mutateAndGetPayload 之前触发，
        // 其 $unfiltered_input 保留全部原始字段（含自定义 blockReference）。
        // 这里把值暂存到静态属性，comment_post 钩子拿到 commentId 后落库。
        // 为什么不用 graphql_mutation_response：该钩子收到的 $input 已被过滤，
        // 自定义字段可能被剥离，且 payload 的 commentId 结构不稳定。
        add_filter('graphql_mutation_input', [self::class, 'captureInput'], 10, 4);
        add_action('comment_post', [self::class, 'onCommentInserted'], 10, 3);

        // 稳定 clientId（ADR-0036 P3）：插件默认每次请求 uniqid()，导致段落锚定
        // 漂移。用 resolve_blocks 过滤器覆盖为持久化 clientId（post_content 的
        // attrs.clientId），无持久化时回退到内容 hash+序号。
        add_filter('wpgraphql_content_blocks_resolve_blocks', [self::class, 'applyStableClientId'], 10, 4);
        // 保存时自动给缺 clientId 的块补 UUID 并写回 post_content（新文章持久化）。
        add_filter('content_save_pre', [self::class, 'ensureClientIds'], 10, 1);
    }

    /** @var array<string,int> 当前请求中「文本 hash → 出现次数」计数器（hash+序号回退用）。 */
    private static $textSeq = [];

    /**
     * wpgraphql_content_blocks_resolve_blocks 过滤器：覆盖插件生成的随机 clientId。
     *
     * 插件在调用本过滤器前已把 block 树拍平成扁平数组（flatten_block_list），
     * 每个 block 是独立元素，父子关系靠 parentClientId 指针。因此不能依赖
     * innerBlocks 递归 —— 必须分三遍处理：
     *   1. 给每个 block 分配稳定 clientId（attrs.clientId 持久 UUID 优先，
     *      否则内容 hash + 出现序号回退）；
     *   2. 建立「旧 clientId → 新 clientId」映射；
     *   3. 用映射重写每个 block 的 parentClientId，保证前端重建树时
     *      父子关系不破裂（columns 不空壳、list/quote 内容不脱离父容器）。
     */
    public static function applyStableClientId(array $blocks, $node, $args, $allowed): array {
        self::$textSeq = [];

        // 第一遍：分配稳定 clientId，收集旧→新映射。
        $idMap = [];
        foreach ($blocks as &$block) {
            $oldId = $block['clientId'] ?? '';
            $block['clientId'] = self::stableClientId($block);
            if ('' !== $oldId) {
                $idMap[$oldId] = $block['clientId'];
            }
        }
        unset($block);

        // 第二遍：parentClientId 随父的稳定 clientId 同步重写。
        foreach ($blocks as &$block) {
            if (!empty($block['parentClientId']) && isset($idMap[$block['parentClientId']])) {
                $block['parentClientId'] = $idMap[$block['parentClientId']];
            }
        }
        unset($block);

        return $blocks;
    }

    private static function stableClientId(array $block): string {
        // 持久化优先：post_content 里的 attrs.clientId（含我们保存钩子写入的 UUID）。
        if (!empty($block['attrs']['clientId'])) {
            return $block['attrs']['clientId'];
        }
        // 回退：内容纯文本 hash + 出现序号（旧文章无持久化 clientId 时稳定）。
        $text = trim(wp_strip_all_tags($block['innerHTML'] ?? ''));
        $textHash = md5($text);
        $seq = self::$textSeq[$textHash] ?? 0;
        self::$textSeq[$textHash] = $seq + 1;
        return $textHash . '#' . $seq;
    }

    /**
     * content_save_pre 钩子：给 post_content 里缺 clientId 的块补 UUID 并写回。
     * 幂等：已有 clientId 的块跳过。返回新 content（WP 用它更新数据库）。
     */
    public static function ensureClientIds(string $content): string {
        if (false === strpos($content, '<!-- wp:')) {
            return $content;
        }
        $blocks = parse_blocks($content);
        $changed = self::ensureBlockClientIds($blocks);
        if (!$changed) {
            return $content;
        }
        $serialized = '';
        foreach ($blocks as $block) {
            $serialized .= serialize_block($block);
        }
        return $serialized;
    }

    private static function ensureBlockClientIds(array &$blocks): bool {
        $changed = false;
        foreach ($blocks as &$block) {
            if (!isset($block['attrs']['clientId']) || '' === $block['attrs']['clientId']) {
                $block['attrs']['clientId'] = wp_generate_uuid4();
                $changed = true;
            }
            if (!empty($block['innerBlocks'])) {
                $changed = self::ensureBlockClientIds($block['innerBlocks']) || $changed;
            }
        }
        unset($block);
        return $changed;
    }

    /**
     * 一键迁移历史文章（post + page）：给缺 clientId 的块补 UUID 并写回。
     * 返回统计 ['total' => n, 'updated' => n]。
     */
    public static function migrateAllPosts(): array {
        $posts = get_posts([
            'post_type'   => ['post', 'page'],
            'post_status' => ['publish', 'draft', 'future', 'private'],
            'numberposts' => -1,
            'fields'      => 'ids',
        ]);
        $updated = 0;
        foreach ($posts as $postId) {
            $content = get_post_field('post_content', $postId);
            if (false === strpos($content, '<!-- wp:')) {
                continue;
            }
            $blocks = parse_blocks($content);
            if (self::ensureBlockClientIds($blocks)) {
                $serialized = '';
                foreach ($blocks as $block) {
                    $serialized .= serialize_block($block);
                }
                wp_update_post([
                    'ID'           => $postId,
                    'post_content' => $serialized,
                ]);
                $updated++;
            }
        }
        return ['total' => count($posts), 'updated' => $updated];
    }

    /** @var string 最近一次 createComment 输入的 blockReference（JSON 字符串）。 */
    private static $pendingBlockRef = '';

    /**
     * graphql_mutation_input 签名（WPMutationType.php）:
     *   ($input, $context, $info, $mutation_name)
     * 第 1 参是过滤后的 input；我们用 $unfiltered_input 场景下实际传入顺序：
     * 实际是 ($input, $context, $info, $mutation_name)，其中 $input 已含自定义字段
     * （自定义 input 字段不会主动被删，只是 mutateAndGetPayload 不消费它们）。
     */
    public static function captureInput(array $input, $context, $info, string $mutationName): array {
        // TEMP DEBUG (remove after blockReference persistence verified)
        error_log('[block-ref] mutation_input fired: mutation=' . $mutationName . ' keys=' . implode(',', array_keys($input)) . ' hasBlockRef=' . (!empty($input['blockReference']) ? 'yes' : 'no'));
        if ($mutationName === 'createComment' && !empty($input['blockReference'])) {
            self::$pendingBlockRef = (string) $input['blockReference'];
        }
        return $input;
    }

    /** comment_post 钩子：把暂存的 blockReference 落库为 comment_meta。 */
    public static function onCommentInserted(int $commentId, $approved, array $commentData): void {
        $pending = self::$pendingBlockRef;
        self::$pendingBlockRef = '';
        // TEMP DEBUG (remove after blockReference persistence verified)
        error_log('[block-ref] comment_post fired: id=' . $commentId . ' pending=' . ($pending === '' ? 'empty' : $pending));
        if ($pending === '') {
            return;
        }
        $decoded = json_decode($pending, true);
        if (!is_array($decoded) || empty($decoded['clientId'])) {
            return;
        }
        self::saveMeta($commentId, $decoded);
    }

    /**
     * 孤儿评论重绑（ADR-0036 P3）：更新某评论的 blockReference meta。
     * 经 graphql_register_types 注册为 Comment.rebindBlockReference mutation，
     * 前端 /api/comments/rebind 调用；权限在 Astro 端校验（作者本人或博主）。
     */
    public static function registerRebind(): void {
        register_graphql_mutation('rebindBlockReference', [
            'inputFields' => [
                'commentDatabaseId' => ['type' => 'Int'],
                'clientId'          => ['type' => 'String'],
                'snippet'           => ['type' => 'String'],
            ],
            'outputFields' => [
                'success' => ['type' => 'Boolean'],
            ],
            'mutateAndGetPayload' => static function ($input) {
                $commentId = (int) ($input['commentDatabaseId'] ?? 0);
                if (!$commentId) {
                    return ['success' => false];
                }
                $clientId = isset($input['clientId']) ? sanitize_text_field($input['clientId']) : '';
                if (!$clientId) {
                    return ['success' => false];
                }
                $snippet = isset($input['snippet']) ? sanitize_text_field($input['snippet']) : '';
                self::saveMeta($commentId, [
                    'clientId' => $clientId,
                    'snippet'  => $snippet,
                ]);
                return ['success' => true];
            },
        ]);
    }

    private static function saveMeta(int $commentId, array $decoded): void {
        $clientId = sanitize_text_field($decoded['clientId'] ?? '');
        if (!$clientId) {
            return;
        }
        $snippet = isset($decoded['snippet']) ? sanitize_text_field($decoded['snippet']) : '';
        if (mb_strlen($snippet) > self::SNIPPET_MAX) {
            $snippet = mb_substr($snippet, 0, self::SNIPPET_MAX);
        }
        // JSON_UNESCAPED_UNICODE: store CJK as raw UTF-8, NOT \uXXXX escapes.
        // update_comment_meta() runs wp_unslash() (stripslashes_deep) on the
        // value, which strips the backslash out of "\u524d" → literal "u524d",
        // corrupting every non-ASCII snippet. Raw UTF-8 survives wp_unslash.
        update_comment_meta($commentId, self::META_KEY, wp_json_encode([
            'clientId' => $clientId,
            'snippet'  => $snippet,
        ], JSON_UNESCAPED_UNICODE));
    }
}
