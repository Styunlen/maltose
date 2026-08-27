# ADR-0026: 站点数据看板（Site Statistics Dashboard）

## 状态

已接受

## 日期

2026-08-16

## 背景

需要一个「关于本站」数据页，展示博客成长概况。参考 lifengdi.com/wang-zhan-tong-ji 的数据维度：已运行天数、文章总数、累计字数、评论总数、平均更新间隔、近 N 天发布节奏、年度产出、分类占比、最勤评论者、评论者地域分布（省份/国家）。

**关键约束**：WPGraphQL 的 `Comment.authorIp` 字段是**私有的**（未登录用户不可见）。地理位置榜需要评论 IP，不能通过常规 GraphQL 查询获得。

## 决策

### 1. 页面与数据来源

新增 `/stats` 页面（Astro）。数据分两类：

- **文章维度**（文章数/字数/评论数/发布节奏/年度产出/分类占比）：复用现有 `getTimelineStats()`（全量文章，TTL 300s，LruLink 缓存）+ 现有分类/评论查询。
- **评论者榜**：`author` 字段公开可用，从评论查询聚合。
- **地理位置榜**：WP 服务端聚合（见下）。

### 2. 地理位置：WP 服务端聚合 + ip2region 离线库

新增 WP 主题 GraphQL 字段（如 `RootQuery.commentGeoStats`），在 WP 服务端直接聚合（不经过 GraphQL 权限层），返回省份/国家榜：

- 一条 SQL 按 `comment_author_IP` 分组聚合评论数（只对唯一 IP 解析，非逐条）。
- IP → 省份/国家用 **ip2region 离线库**（参考 kratos-plus：`inc/ip2region/Searcher.class.php` + 数据文件更新器），零外部 API。
- 聚合结果写 transient（默认 12h），评论增删改/审核状态变化时失效（`comment_post` / `wp_set_comment_status` / `deleted_comment` hooks）。
- 省份榜只收中国大陆/港澳台省级行政区；海外统一按国家计（避免粒度混杂）。

### 3. 缓存

- `/stats` 页面走 SSR，数据经 LruLink（文章维度）+ WP transient（地理位置），双层缓存。
- 页面本身可设 `Cache-Control: max-age=600`（无实时数据，可缓存）。

### 4. 建站天数

- 优先取主题选项 `site_birthday`（新增选项），未填则回落到首篇发布时间（`getTimelineStats` 首条）。

### 5. 展示形态

- 纯 CSS 柱状图/进度条（参照 kratos-plus 的 `kdb-chart`/`kdb-bar`，不引图表库）。
- 复用 timeline 页已有的 StatsCards/GitHubCalendar 视觉语言，保持站点风格统一。

## 影响

- 新增：`src/pages/stats.astro`、`src/components/stats/*`（看板组件）、`wordpress-theme/includes/class-comment-geo.php`（ip2region 封装 + GraphQL 字段）、`wordpress-theme/inc/ip2region/*`（离线库）。
- 修改：`functions.php`（注册新类）、`class-admin-settings.php`（`site_birthday` 等选项）、`src/api/api.ts`（commentGeoStats 查询 + TTL）。
- 依赖：无新增（ip2region 是 PHP 类 + 数据文件，随主题分发）。

## 备选方案

- 通过 GraphQL 读 `authorIp`：私有字段，未登录不可见，弃。
- 外部 IP API（ipapi/ipinfo）：引入外部依赖 + 限流风险，弃。
- 前端直连 WP 统计接口：跨域 + 无缓存，弃。

## 参考文献

- kratos-plus `inc/theme-site-dashboard.php`、`inc/theme-comment-geo.php`、`inc/ip2region/`
- ADR-0016/0017/0018（时间轴与统计演进）
- ADR-0024（LruLink 缓存）
