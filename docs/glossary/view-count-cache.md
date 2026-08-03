# 术语表 (Glossary)

## 浏览量 (Post View)

一篇 WordPress 文章的浏览次数。本项目存储在文章的 postmeta 中，key 为 `views`（整数）。

## WP-PostViews 插件

WordPress 的浏览量统计插件。本项目的 Maltose 主题**不依赖**该插件的任何函数，仅与其共用 `views` postmeta key。安装与否都不影响主题的浏览量功能。

## viewCount

Maltose 主题在 WPGraphQL 的 `Post` 类型上注册的字段，返回文章浏览量（整数）。前端文章卡片、文章详情页均通过它读取浏览量。

## recordPostView

Maltose 主题在 WPGraphQL 的 `Mutation` 类型上注册的 mutation，入参为文章 `postId`，将浏览量 +1 并返回最新值。前端文章页挂载时调用一次，用于计数。

## mostViewedPosts

Maltose 主题在 WPGraphQL 的 `RootQuery` 类型上注册的字段，返回按浏览量倒序排列的文章列表，可传入 `first` 控制数量。用于首页「热门文章」区块。

## 防刷窗口 (Anti-abuse Window)

防止浏览量被刷量而设置的时间窗口。本项目采用双层：
- **Astro 代理层**：`rate-limiter-flexible` 按 `IP + postId` 做 60 秒粗粒度限流。
- **WordPress 端**：transient `maltose_view_{postId}_{ipHash}` 做 5 分钟精确窗口，窗口内同一 IP 对同一文章只计一次。

## Apollo 内存缓存 (Apollo InMemoryCache)

Astro SSR 进程中 `client`（ApolloClient 单例）持有的查询结果缓存。默认 `cache-first` 策略，**跨请求存活**，无 TTL。内容查询依赖它提升性能，但也是"修改文章后读旧内容"的根源，需配合主动失效。

## 缓存主动失效 (Cache Purge)

WordPress 保存文章（`save_post`，仅 publish 状态）时，用共享密钥签名 POST 到 Astro 的 `/api/cache-purge` 端点，触发 `client.cache.evict()` + `gc()`，使被修改文章的内容在下一次请求即读到新值。

## cache-purge 端点

Astro 端接收 WordPress 失效通知的 API 端点。校验 `X-Graphql-Timestamp` + `X-Graphql-Signature`（与 GraphQL 网关相同的签名算法），通过后清空 Apollo 内存缓存中对应条目。

## ViewCountsProvider

Astro 前端的全局客户端组件（`client:load`）。收集首页所有需要浏览数的文章 `databaseId`，挂载后一次性通过 `posts(where:{in})` 批量查询最新浏览数，按 `databaseId` 分发回各卡片，实现浏览数秒级刷新。

## getViewCounts

Astro `api.ts` 中的批量浏览数查询函数，使用 `fetchPolicy: "network-only"` 每请求实时打 WordPress。查询体复用 WPGraphQL 原生 `posts(where:{in})` 连接，只取 `databaseId` 与 `viewCount` 字段。

## 渐进更新 (Progressive Update)

首屏 HTML 显示缓存里的旧浏览数，客户端组件（ViewCountsProvider）挂载后约 0.5 秒更新为最新值的过渡方式。用户通常感知不到这一跳变。
