# 术语表 (Glossary) — 段落评论与数据管理

## 段落评论（Paragraph Comment）

锚定到文章内**单个内容区块**（`CoreParagraph` / `CoreListItem`）的评论，而非仅文章底部全局评论区。交互参考知乎：悬停区块浮现评论入口，行内展开该区块的评论列表 + 输入框。数据上**不是独立评论流**——它就是普通评论，携带一个可选的 `blockReference`（comment_meta）。

## 区块引用（blockReference）

段落评论携带的锚定字段，结构为 `{ clientId, snippet }`：
- `clientId`：Gutenberg 编辑器持久化的每块 UUID（WPGraphQL `editorBlocks.clientId`，存在于块注释定界符 `<!-- wp:paragraph {"clientId":"…"} -->`）。在「块被编辑文本」时保持稳定，仅在「块被复制/粘贴/删除重加」时变化。
- `snippet`：锚定时段落文本的可读快照，`min(全文, 80 字符)`，不压缩。用于块被删除后，作者重绑时对照原文定位。

## 悬空评论（Orphan Comment）

其 `blockReference.clientId` 在当前文章的块集合中**已不存在**的段落评论（块的锚定块被作者删除/重构）。行为：仍完整保留在全局评论区，带「段落已删除」标记；评论作者可重新绑定到任意段落，博主（`BLOG_OWNER_USER_IDS`）可管理全部。

## 数据注册表（MaltoseDataRegistry）

主题内统一注册「额外数据定义」的类（`includes/class-data-registry.php`）：每个数据条目声明 `key → 存储介质 / 清理类别 / 导出类别`。导出、导入、卸载向导都遍历该注册表执行——未来新增功能（评论点赞、emoji 互动、段落收藏）只需注册新条目即自动纳入管理，避免散落 meta 失控。

## 数据卸载向导（Uninstall Wizard）

删除主题时的数据处置流程：导出 ZIP / 仅导出保留 / 直接清理 / 不清理 四选一，按数据注册表分级执行。**评论数据永不自动删除**（用户资产）；OTP 自动创建的账号单列展示并提示「无真实密码，建议删除」。

## OTP 账号（OTP Account）

通过无密码 OTP 登录自动创建的 WP 用户（`wp_create_user`，密码为机器生成）。打 `maltose_otp_user` user_meta 标记；用户自行设置真实密码后移除标记、视为正常用户。卸载向导仅列出仍带标记且密码为初始值的账号。

## 图片占位（Image Placeholder）

- **shimmer 骨架**：PostCard 封面加载时的脉动色块动画（`--muted` 底 + 浅灰扫光），与 `Skeleton` 组件视觉一致。
- **blur-up 渐显**：文章内大图（`LazyImage`）加载时的纯色块 + spinner + 加载完成淡入过渡。
