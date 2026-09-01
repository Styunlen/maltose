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

## WPGraphQL Mutation

WPGraphQL 中用于写操作（增删改）的根类型。与 `RootQuery`（读）相对。本项目的 `recordPostView` 属于此类。

## 热门文章区块 (Popular Posts Block)

Astro 首页 Recent Posts 列表下方展示的热门文章区域，数据来自 `mostViewedPosts` 查询，卡片略小、同一行多列排布。
