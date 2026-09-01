# ADR-0003: 浏览数实时化与缓存主动失效

## 状态

已接受（**部分被推翻**——见下）

> **Superseded 注记**：本文档的核心问题（浏览数实时 + 内容陈旧）依然成立，但**具体方案已被后续 ADR 与代码审查修复改写**：
> - **cache-purge 主动失效链路**（`/api/cache-purge` + `save_post` 钩子）已**删除**。改为 ADR-0015 的**缓存分层**：实时数据（文章/评论/首页列表）一律 `network-only`，低变动数据（导航/侧边栏/时间轴）走 `cachedQuery` 60s TTL。
> - **内容查询保持 cache-first**（`getNodeByURI`、`homePagePostsQuery`）已改为 `network-only`（代码审查 #1/#2，2026-08-15）。全局 `cache-first` 仅作为默认兜底，实际实时数据全部显式覆盖。
> - **ViewCountsProvider 客户端批量刷新**已移除（见本文档"清理"节），浏览数由 SSR 直接渲染。
> - 参见：ADR-0013（查询合并）、ADR-0014（TTFB 优化）、ADR-0015（缓存分层）。

## 日期

2026-08-02

## 背景

浏览计数（`viewCount`）显示存在"刷新拿不到最新数据"的问题。排查发现数据经过三层缓存：

| 层 | 位置 | 配置 | 缓存时长 |
|---|---|---|---|
| HTTP 缓存 | `index.astro` | `Cache-Control: max-age=600, must-revalidate` | 10 分钟 |
| Apollo 内存缓存 | `api.ts` `InMemoryCache` + `cache-first` | 无 TTL | 无限期（跨 SSR 请求存活） |
| WP transient | `class-post-views.php` | `ANTI_ABUSE_WINDOW` | 5 分钟（仅写入去重，不影响读取） |

关键问题：Astro SSR 是长驻 Node 进程，`client` 为模块级单例，`InMemoryCache` 跨请求存活。**内容查询与浏览数查询混在同一 `posts()` 查询里，统一走 `cache-first`**——既导致浏览数不实时，也导致修改文章标题/内容后永远命中旧缓存（直到进程重启）。

参考 styunlen.cn（Argon 主题）的实现：纯 PHP 渲染，`cache-control: no-cache, no-store`，每次请求全量实时查 WP + 计数。浏览数强实时，但代价是每请求全量打 WP。

## 需求

- 浏览数**强实时**（秒级）：刷新即最新。
- 修改文章标题/内容后**尽快生效**（保存后下次请求即新）。
- 不牺牲页面性能：内容查询仍应利用缓存。
- 生产环境有 nginx 反代（会放大 HTTP 缓存）。

## 核心约束

浏览数是**嵌在 HTML 里**的（SSR 渲染 `{post.viewCount}`）。只要浏览数出现在页面 HTML 中，nginx 缓存整页就会连带缓存浏览数。因此"首屏浏览数最新"与"整页 HTTP 长缓存"在 HTTP 层**硬冲突**，必须将浏览数从内容查询中分离。

## 决策

采用「**方案 C：混合**」+「**主动失效**」组合。

### 1. 浏览数分离为独立批量查询（复用原生 posts 连接）

不新增自定义根字段，复用 WPGraphQL 原生连接：

```graphql
query ViewCounts($ids: [ID!]!) {
  posts(where: { in: $ids }) {
    nodes {
      databaseId
      viewCount
    }
  }
}
```

- `where.in` 接受 **global ID**（`cG9zdDoxNzEx` 形式），前端用已有的 `node.id` 直接传入。
- 返回顺序**不保证与输入一致** → 前端**按 `databaseId` 映射**，不依赖数组顺序。
- 该查询在 Astro 端用 `fetchPolicy: "network-only"`，每请求实时打 WP。
- 查询缓存键为 `posts(where:{in})` 独立条目，**不污染内容查询缓存**。

### 2. 内容查询保持缓存 + 主动失效

- `getNodeByURI`、`homePagePostsQuery`、`getStickyPosts`、`getMostViewedPosts` 保持 `cache-first`（利用 Apollo 内存缓存 + Astro 渲染优化）。
- 新增 **主动失效链路**：WordPress `save_post`（仅 `post_status == 'publish'`）→ 用共享密钥签名 POST 到 Astro `/api/cache-purge` → `client.cache.evict()` + `gc()`。

**鉴权**：复用现有 GraphQL 网关签名机制（`SHA256(secret + timestamp)` + `X-Graphql-Timestamp`/`X-Graphql-Signature` 头，60s 过期）。密钥为 WP `maltose_secret_key` 与 Astro `WP_GRAPHQL_SECRET_KEY` 的共享值——零新密钥，复用既有信任链。

### 3. 前端批量刷新（全局 Provider）

新增 `ViewCountsProvider` 客户端组件（`client:load`）：
- 接收全页所有需要浏览数的 `{ databaseId }` 集合（首页文章列表 + 置顶轮播 + 热门文章）。
- 挂载后一次性 `getViewCounts(ids)` 批量查询，按 `databaseId` 分发回各卡片元素。
- 首屏显示缓存值 → 挂载后 ~0.5s 更新为最新值（渐进更新）。

### 4. HTTP 缓存分级

- **含浏览数的页面**（首页、文章页）：`Cache-Control: no-cache`（与 Argon 一致，nginx 不缓存浏览数）。
- **不含浏览数的页面**（归档页、标签页、其他静态页）：保留原有缓存策略。

## 数据流

```
首页 SSR
 ├─ homePagePostsQuery(posts, cache-first)     → 内容+viewCount(缓存值)
 ├─ getStickyPosts(cache-first)                → 内容
 ├─ getMostViewedPosts(cache-first)            → 内容+viewCount(缓存值)
 └─ [新增] getViewCounts(ids, network-only)     → 实时浏览数 → Provider 分发

文章页 SSR
 ├─ getNodeByURI(cache-first)                  → 内容
 └─ PostViewCounter(client:load)               → recordPostView 计数 + 显示

修改文章标题/内容
 └─ WP save_post(publish) → 签名 POST /api/cache-purge → cache.evict+gc → 下次请求新内容
```

## 备选方案

| 方案 | 说明 | 未采纳原因 |
|---|---|---|
| A. 纯强实时（Argon 式） | 全部 no-cache + 每请求全量打 WP | 性能差，内容查询无缓存 |
| B. 客户端秒级（渐进更新） | 内容长缓存 + 浏览数客户端刷新 | 首屏非最新，与强实时需求不符 |
| 新增 `viewCounts` 自定义端点 | 批量浏览数根字段 | 需改 WP 主题，复用原生 `posts where in` 即可零后端改动 |
| 60s TTL 自动过期 | 内容查询短 TTL | 延迟最高 60s，不如主动失效"保存即失效"精确 |

## 影响

### WordPress 主题端

- 新增 `includes/class-cache-purge.php`：`save_post` 钩子（publish 时）签名通知 Astro。
- `class-admin-settings.php` 新增 `maltose_astro_url` 配置项（Astro 前端地址）。

### Astro 前端

- 新增 `src/pages/api/cache-purge.ts`：校验签名 + `client.cache.evict()` + `gc()`。
- `src/api/api.ts` 新增 `getViewCounts(ids)`（network-only）。
- 新增 `src/components/ViewCountsProvider.tsx`：全局批量刷新。
- `PostCard.astro` / `StickyCarousel.astro` / `PopularPosts.astro` 接入 Provider。
- `index.astro` Cache-Control 改为 `no-cache`；归档/标签页保留缓存。

## 安全考虑

- 失效端点鉴权复用 GraphQL 网关签名（共享密钥 + 时间戳防重放），避免任意 URL 被恶意触发清缓存。
- 失效请求仅清理内存缓存，不涉及数据库写操作，风险面小。

## 修订（2026-08-05）：移除 Apollo 内存缓存

本 ADR 的决策 2（内容查询 `cache-first` + `cache-purge` 主动失效）已被**废弃**，理由与替代方案如下。

### 背景

`InMemoryCache` + `cache-first` 在 SSR + 签名代理架构下引发多类数据陈旧问题：

- 评论编辑/删除后，`nodeByUri` 内联的 `comments` 字段缓存旧值，刷新页面评论不更新。
- `cache-purge` 只覆盖 WP `save_post`（发布文章）场景，**遗漏了评论增删改**（发生在 Astro 端）。
- 排查链路复杂（签名代理 + Apollo 缓存双重机制叠加）。

### 新决策：全局 `network-only`

`src/api/api.ts` 的 `ApolloClient` 增加 `defaultOptions.query.fetchPolicy: "network-only"`，所有查询每次从 WP 实时拉取。

- `InMemoryCache` 保留但不再被读取（`network-only` 不读不写缓存）。
- `getRandomPosts`、`getViewCounts` 原有的 `network-only` 显式声明成为冗余（全局默认已覆盖），保留无妨。
- 性能取舍：SSR 每次请求打 WP，但请求经签名代理（WP 端可自行加 HTTP 缓存），且博客流量有限，可接受。

### 清理

- 删除 `src/pages/api/cache-purge.ts`、`src/pages/api/dev/cache-purge.ts`（无缓存可清）。
- WordPress 端删除 `includes/class-cache-purge.php`、`save_post` 钩子、`maltose_astro_url` 设置项。

### 影响

- 评论/文章编辑后刷新页面立即呈现新内容（无需任何失效通知）。
- 不再有"缓存数据陈旧"类 bug 的排查负担。

## 修订（2026-08-09）：移除 ViewCountsProvider

本 ADR 的决策 3（`ViewCountsProvider` 前端批量刷新，渐进更新浏览数）随 Apollo 缓存移除而**废弃**。

### 背景

`ViewCountsProvider` 的设计前提是"首屏显示缓存值 → 挂载后 0.5s 更新为最新值"（应对 cache-first 的陈旧问题）。2026-08-05 移除 Apollo 缓存（全局 `network-only`）后，SSR 首屏的 `viewCount` 已是 WP 实时值——渐进更新失去意义，`ViewCountsProvider` 变成**每次首页加载多余的 `getViewCounts` 请求**（值基本不变）。

### 清理

- 删除 `src/components/ViewCountsProvider.tsx`（含 `VIEW_COUNT_EVENT`）。
- `index.astro`：移除 Provider 挂载与 `viewCountTargets` 计算。
- `MainLayout.astro`：移除 `maltose:view-count` 事件监听脚本。
- `PostCard.astro` / `StickyCarousel.astro` / `PopularPosts.astro`：移除 `data-view-dbid` 属性（浏览数由 SSR 直接渲染，无客户端更新）。
- **保留** `getViewCounts` API 函数（未来如需批量刷新仍可用）。

### 影响

- 首页加载少一次 `getViewCounts` 网络请求。
- 浏览数展示不变（SSR 实时渲染）。
- 文章页 `PostViewCounter` 的 `recordPostView` 计数链路不受影响。

## 参考文献

- WPGraphQL `RootQueryToPostConnectionWhereArgs.in: [ID]`
- ADR-0002：浏览量存储与 recordPostView 实现
- styunlen.cn（Argon）响应头：`cache-control: no-cache, no-store`
- Argon 主题：`get_post_views`/`set_post_views` + `add_action('get_header', ...)`
