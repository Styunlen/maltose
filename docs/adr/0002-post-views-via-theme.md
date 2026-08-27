# ADR-0002: 通过主题实现浏览量统计（viewCount / recordPostView / mostViewedPosts）

## 状态

已接受

## 日期

2026-08-02

## 背景

前端需要展示文章浏览量（文章页显示「xx 次浏览」）以及「热门文章」列表。站点已安装 **WP-PostViews** 插件，但存在两个问题：

1. **无法通过 GraphQL 读取**：WP-PostViews 仅提供 PHP 函数（`the_views()` 等）与 REST 字段，不注册任何 WPGraphQL 字段。
2. **headless 架构下计数失效**（更关键）：WP-PostViews 的计数逻辑挂在 `wp_head` 钩子上，仅在 WordPress 自己渲染页面（`is_single() || is_page()`）时执行 `update_post_meta($id, 'views', $post_views + 1)`。本项目前端是 Astro SSR（`output: "server"`），浏览器访问的是 Astro 服务器而非 WordPress PHP 模板，`wp_head` 永远不会触发，`views` 数据始终为 0。

另外要求：**未安装 WP-PostViews 插件的用户也能使用本主题的浏览量功能**。

## 决策

在 Maltose 主题中自建完整的浏览量子系统，不依赖 WP-PostViews 插件的任何函数（仅复用其 `views` postmeta key 作为存储位置），通过 WPGraphQL 暴露给前端。

### 存储设计

- **key 选择**：一律使用 `views` postmeta key。
  - 装了 WP-PostViews：历史数据（插件写入的 `views`）直接可读，零迁移。
  - 未装插件：主题自行读写同一 key，功能完全自洽。
  - `views` 是 WordPress 生态中浏览量的**事实标准 key**（WP-PostViews 及多款统计插件共用），冲突概率极低。**不依赖插件函数，仅共用 key 字符串**，因此「无插件兼容」天然成立。
- **初始化**：`save_post` 钩子中，文章发布时若 `views` meta 不存在则写入 0，保证 `mostViewedPosts` 排序一致性。

### 主题端（WordPress）

1. **`Post.viewCount: Int` 字段**
   - `register_graphql_field('Post', 'viewCount', ...)`
   - resolve：`(int) get_post_meta($post->databaseId, 'views', true)`
   - 只挂在 `Post` 类型（浏览量仅对文章有意义）。

2. **`Mutation.recordPostView(postId: ID!): Int` mutation**
   - 入参：文章 databaseId（`ID` 类型，GraphQL 会把 `"123"` 解析为 `123`）。
   - 逻辑：
     a. 防刷：`get_transient("maltose_view_{$postId}_{$ipHash}")`，5 分钟窗口内同一 IP 对同一文章只计一次；命中则直接返回当前值。
     b. 未命中：`update_post_meta($id, 'views', $current + 1)`，并 `set_transient(..., 300)`。
     c. 返回最新计数值。
   - 公开可调用（无需登录），依赖代理层签名 + 代理层限流 + transient 三重保护。

3. **`RootQuery.mostViewedPosts(first: Int = 10): [Post]` 字段**
   - `WP_Query`：`meta_key=views`、`orderby=meta_value_num`、`order=DESC`、`post_type=post`、`post_status=publish`。
   - resolve 结果用 `array_map` 包装为 `WPGraphQL\Model\Post`（沿用 ADR-0001 的修正经验，避免 `Cannot return null for non-nullable field`）。

4. **`save_post` 钩子**：文章发布时初始化 `views=0`。

### Astro 前端

5. **API 层（`src/api/api.ts`）**：
   - `recordPostView(postId)` → 执行 `recordPostView` mutation。
   - `getMostViewedPosts(first)` → 查询 `mostViewedPosts`。
   - 相关列表查询补充 `viewCount` 字段。

6. **文章页计数（`PostViewCounter` React 组件，`client:load`）**：
   - 挂载时经现有 `/api/graphql-proxy` 发起 `recordPostView` mutation。
   - 用返回值更新显示「xx 次浏览」；失败静默（不影响阅读）。
   - 位置：`Single.astro` 的 `post-meta` 区块。

7. **代理层限流（`graphql-proxy.ts`，双层防刷的 Astro 端）**：
   - 识别 `recordPostView` 操作，用 `rate-limiter-flexible`（项目已有依赖）按 `IP + postId` 做 60 秒粗粒度限流，超限直接返回当前逻辑（不转发）。
   - WP 端 transient 5 分钟窗口做最终精确防刷。

8. **展示**：
   - `PostCard`：把浏览数填入现有的 `—` 占位（overlay 与 card-meta）。
   - **热门文章区块**：首页 Recent Posts 列表下方，新增 `PopularPosts` 区块，卡片略小、同一行多列（grid），数据来自 `mostViewedPosts(first)`，`first` 可变。

### 备选方案

| 方案 | 说明 | 未采纳原因 |
|---|---|---|
| B. 给 posts 连接注入 views 排序 | hook `graphql_posts_connection_query_args` 加 `orderby=meta_value_num` | 侵入 WPGraphQL 内部，受插件执行顺序影响，且无法独立控制数量/范围 |
| C. 前端本地存储计数 | Astro 端用 localStorage 记录 | 数据无法汇总到 WP，热门文章列表无权威数据源，多设备不同步 |
| D. 主题注册 `maltose_views` key 并回退读 `views` | 双 key 策略 | 装了插件的用户会出现两套数据打架，逻辑复杂 |
| E. 检测插件激活动态选 key | `function_exists('the_views')` 分支 | 依赖插件函数名（不可控契约），复杂度高，收益低 |

## 影响

### WordPress 主题端

新增 `includes/class-post-views.php`，`functions.php` require 并注册 `graphql_register_types` 钩子。激活主题后自动暴露 `viewCount`、`recordPostView`、`mostViewedPosts`。

### Astro 前端

- `api.ts` 增加 mutation/查询；`Single.astro`、`PostCard.astro`、`index.astro` 更新；新增 `PostViewCounter` 组件与首页热门文章区块。
- `schema.graphql` 手动同步新增字段（沿用现有做法）。

## 兼容性

- **未激活主题**：三个字段不存在，前端查询报错，需与主题配套部署（与 ADR-0001 一致）。
- **未安装 WP-PostViews**：主题自写 `views` key，功能完整。
- **已安装 WP-PostViews**：`viewCount` 读到插件历史数据；`recordPostView` 自增与插件共用同一 key，数据连续。注意：插件自身的 `wp_head` 计数在 headless 下仍不触发，因此实际只有 `recordPostView` 在计数——不冲突，反而统一。
- **无浏览记录的文章**：`viewCount` 返回 0，`mostViewedPosts` 排序时排最后。

## 安全考虑

- mutation 公开可调，依赖三层防护：代理签名（防止外部直接构造）、代理层 60s 限流（防止单点高频）、WP transient 5min 窗口（最终精确防刷）。
- transient key 使用 IP 哈希，避免直接暴露 IP；IP 从 `REMOTE_ADDR` / `HTTP_X_FORWARDED_FOR` 获取需注意头伪造（仅在代理可信时用 XFF）。

## 参考文献

- WP-PostViews 源码：`wp_head` 钩子 `process_postviews()`，`get_post_meta($id, 'views')` 读写
- WPGraphQL: `register_graphql_field` / `Mutation` 类型 / `Model\Post`
- ADR-0001: stickyPosts 的 `Model\Post` 包装教训
