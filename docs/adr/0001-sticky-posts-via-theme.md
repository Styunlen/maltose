# ADR-0001: 通过主题自定义 WPGraphQL 字段获取全部置顶文章

## 状态

已接受

## 日期

2026-08-01

## 背景

首页置顶文章轮播（`StickyCarousel`）的数据来源是 `getStickyPosts()`，当前实现为：

```graphql
posts(first: 50, where: { orderby: { field: DATE, order: DESC } }) {
  nodes { isSticky ... }
}
```

前端获取前 50 篇最新文章后，在内存中过滤 `isSticky`。

**缺陷**：若某篇置顶文章的发布时间早于最近 50 篇文章，它将永远不会出现在结果中，导致置顶文章「消失」。

WPGraphQL 原生 `RootQueryToPostConnectionWhereArgs` **不提供 `sticky` 过滤参数**（已核对 schema），无法直接通过现有连接查询全部置顶文章。

## 决策

在 Maltose 主题中注册自定义 WPGraphQL 根字段 `stickyPosts`，直接读取 WordPress 权威数据源 `get_option('sticky_posts')`，返回完整的 Post 对象列表。

### 关键设计点

1. **数据来源**：`get_option('sticky_posts')` 返回的置顶 ID 数组，是 WordPress 官方的置顶文章权威数据源，天然包含所有置顶文章，不受分页限制。
2. **排序**：按发布时间倒序（`orderby => date`, `order => DESC`），最新发布的置顶文章排最前，与既有 carousel 行为一致。
3. **返回类型**：`['list_of' => 'Post']`，完整 Post 对象，前端一次查询即可获得 StickyCarousel 所需的全部字段，轮播组件无需改动。
4. **公开访问**：与普通 `posts` 连接一致，不设访问权限限制。

### 备选方案

| 方案 | 说明 | 未采纳原因 |
|---|---|---|
| B. `stickyPostIds` + `posts(where: {in})` | 注册 ID 字段后前端两次查询 | 多一次网络请求，前端逻辑复杂化 |
| C. 给 posts 连接注入 `sticky` where 过滤 | hook `graphql_posts_connection_query_args` | 侵入 WPGraphQL 内部过滤，受插件执行顺序影响，耦合度高 |

## 影响

### WordPress 主题端

新增 `includes/class-sticky-posts.php`，在 `graphql_register_types` 钩子注册 `stickyPosts` 字段。

### Astro 前端

`getStickyPosts()` 改为查询 `{ stickyPosts { ... } }`，返回结构与现有实现保持一致，`StickyCarousel` 组件零改动。

## 兼容性

- 主题未激活时 `stickyPosts` 字段不存在，前端查询会报错。需与主题配套部署。
- 无置顶文章时返回空数组，前端轮播自动隐藏（`hasPosts` 判断已有）。

## 实施修正（2026-08-01）

初次实现直接返回 `get_posts()` 的原生 `WP_Post` 对象，导致 WPGraphQL 报错 `Cannot return null for non-nullable field "Post.databaseId"`。原因是 WPGraphQL 的 `Post` 类型解析器期望接收 `WPGraphQL\Model\Post` 模型对象，而非原生的 `WP_Post` 对象。

**修正**：resolve 中使用 `array_map` 将每个 `WP_Post` 包装为 `new \WPGraphQL\Model\Post($post)` 后返回，确保 WPGraphQL 能正确解析 `databaseId`、`title` 等字段。

## 参考文献

- WPGraphQL Schema: `RootQueryToPostConnectionWhereArgs`（无 sticky 过滤）
- WordPress: `get_option('sticky_posts')`
- WPGraphQL Model: `WPGraphQL\Model\Post`
