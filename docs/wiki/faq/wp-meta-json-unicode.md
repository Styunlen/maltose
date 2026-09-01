# FAQ：WordPress meta 里的中文 JSON 变成 `uXXXX` 乱码

## 症状

评论的段落引用（`maltose_block_ref` comment meta）里，中文 snippet 存进数据库后变成类似
`u524du4e09u7bc7` 的字面文本（注意：**反斜杠没了**，不是 `\u524d` 而是 `u524d`），
前端拿到后显示成一串 `u524d...` 而非正常中文。纯英文 snippet 则完全正常。

## 一句话结论

**PHP `json_encode()` 默认把非 ASCII 字符输出为 `\uXXXX` 转义；WordPress 的
`update_comment_meta()` 内部会对值执行 `wp_unslash()`（`stripslashes_deep`），把
`\uXXXX` 里的反斜杠剥掉，落库就变成了字面 `u524d`。**

## 完整链路

```
wp_json_encode(['snippet' => '前三篇…'])   # PHP 默认 → {"snippet":"\u524d\u4e09…"}（带反斜杠）
        │
        ▼
update_comment_meta(…)                     # 内部强制 $meta_value = wp_unslash($meta_value)
        │                                    # stripslashes_deep 剥掉 \ → "u524du4e09…"（反斜杠丢失）
        ▼
数据库落库                                  # {"snippet":"u524du4e09…"} ← 损坏！
```

## 为什么 `\uXXXX` 会有反斜杠

- `json_encode()` 默认（未传 `JSON_UNESCAPED_UNICODE`）对中文等非 ASCII 输出 `\uXXXX`
  转义。这是 PHP 的历史默认：输出纯 ASCII，任何编码管道（HTTP 头、老式数据库连接、
  日志）都能无损传递。
- `wp_json_encode()` 只是 `json_encode()` 的薄封装，没传该标志，所以继承默认转义。

## 为什么 WordPress 要剥反斜杠

`wp_unslash()` 是**魔法引号（magic_quotes_gpc）的历史遗产**：早年 PHP 会自动给
`$_POST`/`$_GET` 数据加反斜杠，WordPress 统一在入库前剥掉。这个清理对 meta 值同样
生效，于是 `\uXXXX` 的 `\` 被误伤。

## 为什么纯英文 snippet 没事

纯 ASCII 字符不需要 `\u` 转义，`json_encode()` 原样输出，没有反斜杠可剥——所以只有
中文（非 ASCII）会被破坏。

## 修复

### 写入端（代码修复）

存 meta 时传 `JSON_UNESCAPED_UNICODE`，中文以原始 UTF-8 落库，不再产生反斜杠：

```php
update_comment_meta( $comment_id, $meta_key, wp_json_encode( $data, JSON_UNESCAPED_UNICODE ) );
```

- 需求 PHP 5.4+（`JSON_UNESCAPED_UNICODE` 于 2012 年引入），现代 WP 环境均满足。
- 原始 UTF-8 是 JSON 规范（RFC 8259）允许的标准形式，`json_decode()` / 前端
  `JSON.parse()` 完全兼容。
- 数据库连接需为 utf8mb4（WP 自 4.2 起强制），否则中文会乱码。

### 存量数据修复（一次性脚本）

对已损坏的数据，把 `uXXXX` 字面序列重新解码回中文后，用上述方式重写 meta：

```php
$restored = preg_replace_callback( '/u([0-9a-fA-F]{4})/', function ( $m ) {
    return mb_chr( hexdec( $m[1] ), 'UTF-8' );
}, $snippet );
update_comment_meta( $comment_id, $meta_key, wp_json_encode( $decoded, JSON_UNESCAPED_UNICODE ) );
```

## 防复发检查点

1. 主题/插件里所有「`json_encode` → 存 comment/post meta」的路径都要带
   `JSON_UNESCAPED_UNICODE`。
2. 同理适用于 `update_post_meta()` / `update_option()`——它们同样走 `wp_unslash()`。
3. 排查时用 `HEX(meta_value)` 看真实字节：损坏数据是 ASCII `75 35 32 34 64`（字面
   `u524d`），修复后是 UTF-8 中文 `E5 89 8D`（「前」）。注意 `JSON_EXTRACT()` 的输出
   仍会显示 `\uXXXX`（MySQL 的 JSON 文本表示），那是显示层转义，不代表存储值，别误判。
