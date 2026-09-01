# ADR-0031: 邮箱 OTP 登录、用户自助（改用户名/资料页）与登出语义

## 状态

已接受

## 日期

2026-08-24

## 背景

当前登录体系：Authentik OIDC（`provider: "authentik"`）+ WP 密码登录（`provider: "wp"`）。本次新增**邮箱 OTP 免密登录**（`verifyEmailOtp` mutation）并修复其一系列问题。同时用户提出四项自助增强：

1. **A 方案**：首次登录才跳 `/user/profile`——当前 `needsProfile` 硬编码 `true`，老用户每次 OTP 登录都被强推资料页
2. **改用户名**：WP 核心默认禁止改 `user_login`（登录账号），用户希望所有登录用户可改
3. **资料页入口**：`/user/profile` 未出现在用户菜单
4. **登出分流**：当前 logout 无条件跳 Authentik end-session；且登出不撤销 WP refreshToken（1 年期 token 泄露后长期有效）

**技术调查结论**（wp-graphql v2.20.0 + WP core 源码）：
- WPGraphQL `updateUser` 的输入类型 `UpdateUserInput` **没有 `username` 字段**；`prepare_user_object` 虽有 `username → user_login` 映射但为死代码
- WP core `wp_insert_user()` 在 **update** 路径主动丢弃 `user_login`（`$data = $data + compact('user_login')` 仅 `!$update` 时执行）——即使用 `wp_update_user` 改 login 也会被静默忽略
- 唯一官方途径：`wp_pre_insert_user_data` filter（写库前最后一环）注入 `user_login`
- 权限：`current_user_can('edit_user', self)` 对任何登录用户成立（map_meta_cap 自我编辑返回空 caps）
- JWT 按 user ID 认证，改 `user_login` 不影响现有 token
- 唯一性：core 仅在**创建**时查重（`username_exists`），update 需自校验

## 决策

### 1. 邮箱 OTP 登录（verifyEmailOtp）

- `sendEmailOtp(email)`：生成 6 位码存 transient（`maltose_otp_sha256(email)`，10 分钟有效），`wp_mail` 发送；60 秒重发限流
- `verifyEmailOtp(email, code)`：校验 transient → find-or-create WP 用户 → 签发**插件标准 JWT 对**（authToken + refreshToken）
- **Token 签发必须 `wp_set_current_user($user->ID)`**（镜像插件 `Auth::login()` L79 / `RefreshToken` L99）：
  - 缺省时 `get_refresh_token()` 返回 null（`issue_new_user_secret` 的 `enforce_auth_cap` 默认 true 需 `edit_users`，匿名请求无权限）
  - `Model\User` 保持 private（fields 永不初始化 → `array_key_exists(null)` TypeError）→ `user.databaseId` 500
- `user` 输出字段 resolve 包装为 `new \WPGraphQL\Model\User($p['user'])`（镜像插件 `Login.php` L88-90）
- 调试日志：WP_DEBUG 禁用时 `error_log` 不可见 → 写 `wp-content/uploads/maltose-otp.log` + GraphQL `debugError` 字段

**安全加固（代码审查修复）**：
- **verifyEmailOtp 失败计数**：WP 侧加 `fail_` transient，**5 次错误尝试即作废该验证码**
  （6 位码 10^6 组合，原实现无失败限制可被暴力破解）；成功后清计数
- **sendEmailOtp per-IP 限流**：proxy 对 `sendEmailOtp` 加 per-IP 限流（5 次/小时，429）
  ——WP 侧只有 per-email 60s 节流，bot 可对不同邮箱批量轰炸
- **proxy hasAuth 加固**：从"任意 Authorization 头存在"改为校验 `Bearer \S+` 格式
  （粗粒度闸门，真正鉴权仍由 WP 端 JWT 校验兜底）

### 2. A 方案：首次登录才跳资料页

- `verifyEmailOtp` 输出 `needsProfile: Boolean`，按 **profile 完整性**动态判定：
  `display_name 非空 && display_name !== email && (description 或 websiteUrl 非空)`
- 老用户（profile 已完善）`needsProfile=false` → OTP 登录直接进首页，不再被强推 `/user/profile`
- `otp-verify.ts` 返回真实值替代硬编码 `true`

### 3. 修改用户名（user_login）——新增 mu-plugin

新增 `wordpress-theme/includes/class-change-username.php`（三件套）：
1. `register_graphql_field('UpdateUserInput', 'username')` 暴露输入字段
2. `graphql_user_insert_post_args` 校验：`sanitize_user` / 长度 ≤60 / `illegal_user_logins` / **唯一性**（`username_exists` 且非本人）
3. `wp_pre_insert_user_data` 注入 `user_login`（写库持久化）

前端：`/user/profile` 增加"登录账号"输入框，提交后提示下次用新账号登录。`profile.ts` mutation 加 `username` 字段。

### 4. 资料页入口 + last_login

- `SidebarRight.tsx` 用户菜单（我的评论下方）新增"个人资料"项 → `/user/profile`
- WP `User` 类型新增 `maltoseLastLogin` 字段（读 `maltose_last_login` user meta）；注册在 `class-email-otp.php`（认证相关职责，与 OTP 登录代码同文件部署）
- 所有登录路径记录 `maltose_last_login`：
  - OTP：`verifyEmailOtp` 内 `update_user_meta`
  - 密码 / Authentik：`wp_login` hook（functions.php）
- `profile.ts` 新增 GET handler（`viewer { username name description url maltoseLastLogin }`）供表单预填

### 5. 登出语义（分流 + 撤销）

- **refreshToken 有效期**：`graphql_login_refresh_token_validity` filter 从默认 1 年 → **30 天**
- **登出撤销**：`logout.ts` 调 `revokeUserSecret`（带 `Authorization: Bearer`），WP 侧 `is_user_secret_revoked` 生效 → 旧 refreshToken 立即失效
- **分流**：读 session cookie `provider`，仅 `provider === "authentik"` 时跳 Authentik end-session（销毁 OIDC 会话）；密码/OTP 用户无 Authentik 会话 → 直接跳 `/`
- proxy `BLOCKED_PATTERNS` 移除 `revokeUserSecret`（登出必需）；`refreshUserSecret`/`linkUserIdentity` 仍拦截

## 影响

- **WP 侧**（同步远程）：`class-email-otp.php`（needsProfile/last_login/日志）、`class-change-username.php`（新增）、`functions.php`（filter + wp_login hook + 加载）
- **Astro 侧**（部署）：`otp-verify.ts`、`logout.ts`、`profile.ts`、`ProfileForm.tsx`、`SidebarRight.tsx`、`graphql-proxy.ts`
- **安全**：refreshToken 泄露窗口 1 年 → 30 天；登出后服务端撤销，泄露 token 无法刷新；Authentik 登出保持彻底
- **行为变化**：老用户 OTP 登录不再被强推资料页；所有用户可改登录账号；登出跳转按来源分流

## 备选方案

- **改 nicename 而非 user_login**：`updateUser` 原生支持、零代码，但改的是显示昵称/URL 别名而非登录账号——用户明确要求改登录账号，弃
- **登出不撤销、只删 cookie**：无法挽救已泄露 token，30 天窗口内仍可被冒用，弃
- **首次判定用 `maltose_needs_profile` meta**：需 profile 保存后跨系统清除 meta，比 profile 完整性动态判定更脆弱，弃

## 参考文献

- ADR-0011（Authentik 登录）、ADR-0012（WP token 刷新队列）、ADR-0030（用户自服务 + 网关鉴权）
- wp-graphql v2.20.0：`UserUpdate.php`/`UserMutation.php`（无 username 输入）、`Model/User.php`
- WP core：`wp-includes/user.php`（`wp_insert_user` 丢 user_login / `wp_pre_insert_user_data` L2561）
- wp-graphql-headless-login：`Auth/Auth.php` L79、`Mutation/Login.php` L88-90、`Mutation/RefreshToken.php` L99、`Auth/TokenManager.php`
- 本次涉及文件：`class-email-otp.php`、`class-change-username.php`、`functions.php`、`otp-verify.ts`、`logout.ts`、`profile.ts`、`ProfileForm.tsx`、`SidebarRight.tsx`、`graphql-proxy.ts`
