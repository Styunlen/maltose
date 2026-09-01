# 术语表 (Glossary)

## 置顶文章 (Sticky Post)

WordPress 中的一种文章状态。被置顶的文章在 WordPress 后台「文章 → 置顶」中标记，其 ID 存储在 `wp_options` 表的 `sticky_posts` 选项中。置顶文章在 WordPress 原生主题的列表页中通常显示在普通文章之前。

## StickyCarousel

Astro 前端首页的置顶文章轮播组件，展示所有置顶文章，按发布时间倒序轮播。

## WPGraphQL Root Query 字段

`RootQuery` 类型上注册的顶层查询字段，例如 `posts`、`pages`。本项目中通过 Maltose 主题注册的自定义字段 `stickyPosts` 也属于此类。

## Maltose 主题

本项目配套的 WordPress 主题，负责提供 WPGraphQL 扩展字段、GraphQL 签名校验等后端功能。不提供前端样式。

## get_option('sticky_posts')

WordPress 原生函数，返回所有置顶文章 ID 的数组。这是置顶文章的权威数据源。
