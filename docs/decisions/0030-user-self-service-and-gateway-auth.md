# ADR-0030: 用户自助区集成（资料编辑 + 评论管理）与网关鉴权

## 状态

已接受

## 日期

2026-08-20

## 背景

当前架构：Astro 7 + React 前端、WordPress 后端（headless）、Authentik OIDC 统一登录。用户登录后：
- 评论以登录用户身份发布（wp_token → WPGraphQL createComment）
- 用户可查看"我的评论"（`/user/comments`，只读列表）
- **没有资料编辑页**；`graphql-proxy.ts` 的 `BLOCKED_PATTERNS` 拦截了 `updateUser` 等所有内容/用户 mutation

用户诉求：**普通用户的基本资料编辑 + 评论管理集成到前端**；WP 后台保留（文章/媒体/全站管理）；graphql 网关设置鉴权（未登录拦截 mutation）。

**决策前提**（grill 确认）：
1. 用户资料真相源 = **WordPress User**（评论作者资料天然一致，`websiteUrl` 原生字段）
2. 评论管理 = **仅自助自己的评论**（编辑/删除），不做管理员审核
3. 网关鉴权 = **所有 mutation 必须带 wp_token**，未登录 403；保留 BLOCKED_PATTERNS 作内容级二次防线

## 决策

### 1. 用户资料真相源：WordPress User

- 用户资料（显示名/网站链接/简介）存 **WP 用户表**，通过 WPGraphQL `updateUser` mutation 读写。
- WP `User` 类型字段（schema.graphql 已验证）：`displayName`/`nickname`/`email`/`websiteUrl`/`description`/`firstName`/`lastName` 等。
- **Authentik 保持纯认证角色**：登录入口 + 身份（sub/email/name），不存资料。职责边界 = Authentik 管"你是谁"，WP 管"你长什么样"。

### 2. 解锁 proxy 的 `updateUser` 拦截（精确放行）

`graphql-proxy.ts` 的 `BLOCKED_PATTERNS` 当前拦截 `updateUser`。改为**精确放行"自助资料更新"**：
- 从 BLOCKED_PATTERNS 移除 `updateUser`
- 在 proxy 增加白名单校验：仅允许登录用户对**自身**资料调用 `updateUser`（`input.id` 必须等于 wp_token 解码出的 `data.user.id`）
- 其他用户级 mutation（`createUser`/`deleteUser`/`registerUser`/`resetUserPassword`）**保持拦截**

### 3. 用户评论管理页：仅自助 + 编辑/删除

- `/user/comments`（UserComments.tsx）从只读列表扩展：
  - **编辑**：复用现有 `updateComment` mutation（评论区已有），`isOwn` 校验（`author.node.databaseId === wpUserId`）
  - **删除**：复用现有 `deleteComment` mutation，同样 `isOwn`
- 不做管理员审核（approve/trash）——保持 WP 后台处理全站审核。

### 4. 网关鉴权：所有 mutation 需登录

`graphql-proxy.ts` 增加统一鉴权：
- **任何 mutation 必须携带 `Authorization: Bearer <wp_token>`**
- 无 token → `403 { error: "请先登录" }`
- 保留 BLOCKED_PATTERNS（内容级拦截）作为二次防线——已登录用户也不能创建文章/改设置等
- 影响面：评论 mutation（create/update/delete）已有 wp_token 校验（API 层），proxy 层补上兜底；`updateUser` 解锁后同样走此鉴权

### 5. 新增：用户资料编辑页

- 新页面 `/user/profile`（或并入现有用户区）：显示名、网站链接（websiteUrl）、简介（description）
- 调 `updateUser` mutation（经 proxy，带 wp_token）
- 头像保持 Gravatar（WP 自动基于 email），不提供上传

## 影响

- 修改：`graphql-proxy.ts`（解锁 updateUser + mutation 鉴权）、`UserComments.tsx`（编辑/删除按钮）
- 新增：`src/pages/user/profile.astro` + 资料编辑组件
- 安全：mutation 鉴权统一到 proxy 层，未登录无法发起任何写操作
- 不改变：文章/媒体/全站管理仍在 WP 后台；评论审核仍在 WP 后台

## 备选方案

- **Authentik 存资料**：需配自定义 claim + 评论侧同步，两端数据一致性风险高，弃。
- **管理员审核集成前端**：需引入 role 检查 + 解锁更多 mutation，范围扩大，本期不做。
- **仅特定 mutation 加鉴权**：保护不全面，mutation 面会随功能增长，统一拦截更稳。

## 参考文献

- ADR-0011（Authentik 登录流程）、ADR-0012（WP token 刷新队列）
- `src/pages/api/graphql-proxy.ts`（BLOCKED_PATTERNS）
- WPGraphQL `User`/`UpdateUserInput` schema（displayName/websiteUrl/description）
- `src/components/UserComments.tsx`（现有只读列表）
