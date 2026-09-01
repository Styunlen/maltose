# 术语表 (Glossary) — 时间轴页面

## GitHub 贡献热力图（GitHub Contribution Heatmap）

仿 GitHub 提交热力图的绿格矩阵（53 列周 × 7 行星期）。本项目的热力图由**文章发布日期**聚合生成（每篇文章 = 一个"贡献点"），颜色深浅对应当天文章数（0 透明 / 1 浅绿 / 2+ 深绿），hover 显示日期与文章数。数据无外部依赖（不使用 GitHub API）。

## 基础统计（Stats Cards）

时间轴页面顶部的指标卡片：总文章数、总评论数、总浏览数、写作天数、活跃月份数、最长连续更新。从全量文章的轻字段（日期/浏览/评论）聚合。

## 时间轴文章列表（Timeline List）

按 年份 → 月份 折叠分组的文章列表（参考 lifengdi.com/timeline）。每条显示日期（MM-DD）+ 标题链接 + 浏览数 + 评论数。点击年份/月份标题展开收起，默认最新展开。

## 页码分页（Page Pagination）

时间轴文章的翻页方式（`/timeline?page=N`）。复用现有 `Pagination.astro` 组件的页码导航模式（上一页/下一页 + 可见页码），URL 参数化适配时间轴路由。

## timeline19 风格时间轴（Vertical Phase Timeline）

shadcnblocks 的垂直时间轴设计（Pro 块）：左侧连续线 + 每文章一个圆点节点（日期/标题/描述），muted 轨道线 + motion 驱动的进度线生长动画（进入视口时从 0 生长到当前进度）。ADR-0017 将时间轴从"年月折叠列表"重写为该风格，展示全部文章。

## 年份选择热力图（Year-selectable Heatmap）

GitHub 热力图的增强：从全量文章提取有文章的年份，**最近几年用按钮组**，**其余年份用 shadcn Select 下拉**切换任意年份的 53x7 热力图。默认显示最近一年。

## posts 连接上限（Connection Limit）

WPGraphQL 的 `posts` 连接**默认 `first` 上限 100**——即使传 `first: 200` 也只返回 100 条。ADR-0017 通过**分页拉全量**（offset 100 每批，循环到取完）突破该限制，确保统计与热力图基于完整数据。

## 年份大节点（Year Node）

timeline19 时间轴上的年份分组节点（ADR-0018）：**大圆点 + 年份大字 + 该年文章数**，点击展开/收起该年文章（默认展开）。子节点为**小圆点 + MM-DD 具体日期 + 标题 + 浏览/评论数**。年份大节点与文章小圆点视觉层级区分，融入时间轴轨道。

## 固定日期列对齐（Fixed Date Column）

timeline19 时间轴的圆点与轨道线对齐方案（ADR-0018）：固定宽度日期列（如 56px 放 MM-DD），轨道线居中于日期列右边缘（`left = DATE_COL - 1`），圆点中心与其重合（`left = TRACK_LEFT - DOT/2 + 1`）。**关键**：外层容器不设 `paddingLeft`，改用 item 行内 `marginLeft: DATE_COL` 撑开——轨道线（外层 absolute）与圆点（item absolute）同参考系，避免早期版本的 56px 偏移。

## 侧边栏分类/归档（Sidebar Categories & Archive）

首页右侧边栏的"文章目录"区块修复（ADR-0019）：原错放导航菜单，改为**分类列表**（分类名+文章数，按数排序，点击跳分类页）与**月度归档**（`YYYY年M月 (N)`，最新在前）两个独立区块。数据：megaQuery 扩展 categories 字段 + 全量 posts 日期聚合归档（buildArchive）。

## 分类可折叠树（Category Collapsible Tree）

侧边栏分类区块的层级展示（ADR-0020）：父分类为列表项（带折叠箭头，默认展开），子分类缩进显示。数据：megaQuery 的 allCategories 查 `parent`/`children` 字段，客户端按 parent 名建树，children 用于判断有无子项。

## 归档下拉框（Archive Select）

侧边栏归档区块改为 shadcn Select 下拉框（ADR-0020）：`选择月份` 占位，选项为月度归档（`YYYY年M月 (N)`），选中后跳转 `/?archive=YYYY-MM`。位置移到标签云（TagCloud）下方。
