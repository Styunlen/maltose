# 术语表 (Glossary) — 段落评论与数据管理

## 段落评论（Paragraph Comment）

锚定到文章内**单个内容区块**（`CoreParagraph` / `CoreListItem` / 块级锚定的 `CoreQuote`、`CoreHtml`、`CoreTable`、`CoreCode`、`CorePreformatted`）的评论，而非仅文章底部全局评论区。交互参考知乎：悬停区块浮现评论入口，行内展开该区块的评论列表 + 输入框。数据上**不是独立评论流**——它就是普通评论，携带一个可选的 `blockReference`（comment_meta）。段落弹窗（`ParagraphComments.tsx`）与底部评论区（`CommentSection.tsx`）共享同一套气泡组件（`src/components/comment/`），交互能力一致。

## 区块引用（blockReference）

段落评论携带的锚定字段，结构为 `{ clientId, snippet }`：
- `clientId`：稳定块锚点。`wp-graphql-content-blocks` 插件**默认每次请求用 `uniqid()` 重写** `clientId`（且从 `$block['clientId']` 而非 `$block['attrs']['clientId']` 读取），所以不能直接信任插件输出。主题过滤器（`wpgraphql_content_blocks_resolve_blocks`）按优先级重建：`attrs.clientId`（`content_save_pre` 钩子写入 post_content 的持久 UUID）→ 内容 hash + 出现序号回退。
- `snippet`：锚定时段落文本的可读快照，`min(全文, 80 字符)`，不压缩。用于块被删除后，作者重绑时对照原文定位。

## 块树重建（parentClientId）

前端用 `editorBlocks` 扁平数组 + `parentClientId` 指针重建块树。插件在**过滤器运行前**已把树拍平，因此主题过滤器必须三遍处理扁平数组：分配稳定 `clientId` → 收集「旧→新」映射 → 重写每个块的 `parentClientId`。否则父子关系断裂（columns 空壳、list/quote 内容脱离父容器、嵌套段落失去锚点）。

## 悬空评论（Orphan Comment）

其 `blockReference.clientId` 在当前文章的块集合中**已不存在**的段落评论（块的锚定块被作者删除/重构）。行为：仍完整保留在全局评论区，带「段落已删除」标记；**重绑按钮仅评论作者或博主可见**（`canRebind` = 严格 databaseId 匹配 + `currentUserIsOwner` = 当前用户是博主）；无权限用户只看到提示。段落弹窗与评论区共享同一孤儿/重绑 UI。

## 数据注册表（MaltoseDataRegistry）

主题内统一注册「额外数据定义」的类（`includes/class-data-registry.php`）：每个数据条目声明 `key → 存储介质 / 清理类别 / 导出类别`。导出、导入、卸载向导都遍历该注册表执行——未来新增功能（评论点赞、emoji 互动、段落收藏）只需注册新条目即自动纳入管理，避免散落 meta 失控。

## 数据卸载向导（Uninstall Wizard）

删除主题时的数据处置流程：导出 ZIP / 仅导出保留 / 直接清理 / 不清理 四选一，按数据注册表分级执行。**评论数据永不自动删除**（用户资产）；OTP 自动创建的账号单列展示并提示「无真实密码，建议删除」。

## OTP 账号（OTP Account）

通过无密码 OTP 登录自动创建的 WP 用户（`wp_create_user`，密码为机器生成）。打 `maltose_otp_user` user_meta 标记；用户自行设置真实密码后移除标记、视为正常用户。卸载向导仅列出仍带标记且密码为初始值的账号。

## 图片占位（Image Placeholder）

- **shimmer 骨架**：PostCard 封面加载时的脉动色块动画（`--muted` 底 + 浅灰扫光），与 `Skeleton` 组件视觉一致。
- **blur-up 渐显**：文章内大图（`LazyImage`）加载时的纯色块 + spinner + 加载完成淡入过渡。
