# ADR-0025: 内链悬浮预览卡（Hover Link Preview Cards）

## 状态

已接受

## 日期

2026-08-16

## 背景

文章正文中包含指向本站其他内容的链接（文章/页面/分类/标签/系列归档）。读者悬停在这些链接上时，希望看到目标内容的预览卡片，减少跳转决策成本。配合未来「关键词自动内链」功能（产出归档类链接），两种卡型天然配套。

**约束**：
- 只在真正具备悬停能力的指针设备上启用（触屏完全不启用、不拦截点击）。
- 静默加载：请求期间不显示 loading 占位，数据到手才淡入；鼠标已移开或请求失败则什么都不出现。
- 卡片内可点击（标题/缩略图/归档名/最近几篇标题都是真链接），鼠标从链接移到卡片上不收起。
- 接口只接受本站链接，不会变成任意 URL 的探测器。

## 决策

### 1. 预览数据 API：Astro `/api/preview.ts`

新增 Astro API 路由，接收本站内部链接，解析后经现有 `graphql-proxy` 签名代理拉取数据。复用现有机制（签名鉴权 / 限流 / LruLink 缓存），零 WP 主题改动。

- 只接受本站链接：校验 URL host 与 `APP_URL`/`SITE` 一致，否则返回 400。
- 支持 `?uri=/archives/post-1469.html` 或 `?url=<full>` 两种入参。

### 2. 数据查询：复用 nodeByUri + 新增 PreviewByUri 查询

走 ApolloClient + LruLink（跨请求缓存，TTL 300s）：

```graphql
query PreviewByUri($uri: String!) {
  nodeByUri(uri: $uri) {
    __typename
    ... on Post { title date excerpt featuredImage { node { sourceUrl } } commentCount viewCount content }
    ... on Page { title date excerpt featuredImage { node { sourceUrl } } commentCount content }
    ... on Category { name description count }
    ... on Tag { name description count }
  }
}
```

- 字数/预计阅读时长/摘要**服务端计算**（preview.ts 内去 HTML 计数，阅读速度可配字/分钟）。
- LruLink 按 operationName+variables 缓存，key 前缀 `PreviewByUri:`。

### 3. 缓存与失效

- 缓存走 LruLink（TTL 300s，SWR 后台刷新）。
- 文章保存/分类标签增删改时 `deleteByPrefix("PreviewByUri:")` 失效（挂在 WP save_post / term hooks 或评论 API 的失效链路上）。

### 4. 前端触发（HoverPreviewProvider）

- 文档级事件委托（ExternalLinkGuard 同款模式）——因为正文链接渲染在 `dangerouslySetInnerHTML` 里，无法服务端注入标记。
- `(hover: hover) and (pointer: fine)` 媒体查询判定悬停能力，不满足则完全不挂载。
- 触发延时（默认 ~300ms）后请求，期间鼠标移开则取消；数据到手淡入卡片。
- 卡片定位：链接下方，防溢出视口翻转；鼠标移入卡片期间不收起。
- 挂载位置：LayoutShell（与 ExternalLinkGuard 并列）。

### 5. 配置：WP 主题选项「阅读增强」+ GraphQL 桥

新增 `class-admin-settings.php` 的「阅读增强」section，`register_setting` 新选项：

| 选项 | 默认 | 说明 |
|---|---|---|
| `maltose_preview_enabled` | 1 | 总开关 |
| `maltose_preview_delay` | 300 | 触发延时（ms）|
| `maltose_preview_excerpt_len` | 120 | 摘要字数 |
| `maltose_preview_wpm` | 400 | 阅读速度（字/分钟）|
| `maltose_preview_cache_ttl` | 300 | 缓存时长（秒）|
| `maltose_preview_recent` | 3 | 归档卡「最近几篇」条数（0=只显示总数）|

新增 `RootQuery.maltoseSettings` GraphQL 字段（参照 class-sticky-posts.php 模式）桥接选项到 Astro 前端。

### 6. 归档描述别名行

「关键词自动内链」约定的 `别名: a, b` 配置行**本功能完全不处理**（不解析、不过滤展示）。该功能尚未实现，悬浮卡与它解耦——未来内链功能自行处理别名 → URI 映射。

## 影响

- 新增文件：`src/pages/api/preview.ts`、`src/components/HoverPreviewProvider.tsx`、`wordpress-theme/includes/class-hover-preview.php`（可选，若配置全走 Astro 则不需要）。
- 修改文件：`src/layouts/LayoutShell.tsx`（挂载 Provider）、`src/api/api.ts`（PreviewByUri 查询 + TTL 配置）、`class-admin-settings.php`（阅读增强 section）、主题 GraphQL 字段注册。
- 依赖：无新增（复用现有 nodeByUri / LruLink / DOMPurify 工具）。

## 备选方案

- WP REST 端点：主题零 REST 现状，需新建鉴权机制，弃。
- SSR 内联数据：首屏臃肿且失效复杂，弃。
- 前端直连 WP：跨域 + 无法复用 LruLink，弃。

## 参考文献

- ADR-0022（ExternalLinkGuard 全局链接拦截）
- ADR-0024（LruLink 进程内缓存）
- WPGraphQL nodeByUri
