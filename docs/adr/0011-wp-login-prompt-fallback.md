# ADR-0011: WordPress 登录两段式降级（prompt=none → 交互式）

## 状态

已接受

## 日期

2026-08-07

## 背景

用户报告：点击"连接 WordPress"时弹窗提示"WordPress 未收到授权码"。

### 流程还原

1. 主站 Authentik 登录成功 → `callback.ts:69` `redirect('/api/auth/wp-init')` 自动触发 WP 登录。
2. `wp-init.ts` 生成随机 state → 存 `wp_auth_state` cookie（300s）→ 跳 Authentik。
3. `authentik.ts:82-92` 的 `getWpAuthorizationUrl` 构造授权 URL，带 **`prompt: "none"`**。
4. Authentik 处理 `prompt=none`：**若用户未认证，返回 `error=login_required` 到 redirect_uri，不带 code**（Authentik 源码 `authorize.py`：`if PROMPT_NONE in self.params.prompt and not self.request.user.is_authenticated: raise login_required`）。
5. `wp-callback.ts:18-20` 的 `if (!code)` → "未收到授权码"。

### 为什么"之前正常"

`prompt=none` 是**条件性**失败——用户 Authentik 会话有效时静默放行返回 code；**会话过期/被清除后失败**（Authentik session 过期、浏览器清 cookie、服务重启等）。用户之前成功是因为当时 Authentik 会话有效。

## 需求

- 用户 Authentik 会话有效时：静默获取 code（`prompt=none`），无感知完成 WP 登录。
- 会话失效时：**自动降级**到交互式登录（显示 Authentik 登录页），而非直接报错"未收到授权码"。
- 降级仅针对可恢复的认证类错误；其他 OAuth 错误（如 invalid_request）直接提示。

## 决策

### 1. 两段式授权流程

**第一段（静默）**：保留 `prompt=none` 的授权 URL（authentik.ts 现有 `getWpAuthorizationUrl`）。

**第二段（降级）**：`wp-callback.ts` 在收到 `error` 参数且为**认证类错误**时，自动重定向到**无 prompt** 的交互式授权 URL：

```
error=login_required | interaction_required | account_selection_required
  → 重新生成 state + 重设 wp_auth_state cookie
  → 重定向到无 prompt 的 Authentik 授权 URL（用户看到登录页）
```

其他 error（invalid_request、unauthorized_client 等）→ 直接报错提示（现有 errorRedirect）。

### 2. authentik.ts 新增无 prompt 的授权 URL 生成函数

```ts
export function getWpAuthorizationUrlInteractive(state: string): string {
  const params = new URLSearchParams({
    client_id: getWpClientId(),
    redirect_uri: `${getAppUrl()}/api/auth/wp-callback`,
    response_type: "code",
    scope: "openid profile email",
    state,
    // 无 prompt：Authentik 无会话时显示登录页，有会话时静默放行
  });
  return `${AUTH_ENDPOINT}?${params.toString()}`;
}
```

> **2026-08-07 修订：不能使用 `prompt=login`**。Authentik 的 `prompt=login` 存在上游 bug（goauthentik issues [#12182](https://github.com/goauthentik/authentik/issues/12182) / [#18507](https://github.com/goauthentik/authentik/issues/18507)）：`authorize.py` 中 `prompt=login` 会在**刚完成认证后**再次要求重新认证（`SESSION_KEY_LAST_LOGIN_UID` 匹配判断），导致重定向循环。**第三方登录（Google/GitHub Source）场景尤甚**——第三方认证后回到 authorize 仍带 `prompt=login` → 又被要求登录 → 无限跳回登录界面。用户名/密码登录因 login_uid 变化时序恰好绕过。因此降级 URL **移除 `prompt` 参数**（无 prompt：有会话静默放行、无会话显示登录页，认证后不再强制重认证）。

### 3. wp-callback.ts 降级逻辑

```ts
const error = url.searchParams.get("error");
if (!code) {
  const recoverable = ["login_required", "interaction_required", "account_selection_required"];
  if (error && recoverable.includes(error)) {
    // 重新生成 state 并跳转交互式登录
    const state = randomBytes(16).toString("hex");
    cookies.set("wp_auth_state", JSON.stringify({ state, returnTo: "/" }), {...});
    return redirect(getWpAuthorizationUrlInteractive(state));
  }
  return redirect(errorRedirect("WP 登录失败", "未收到授权码"));
}
```

- `randomBytes` 从 `node:crypto` import（wp-init.ts 已用）。
- 降级后 state 全新，cookie 重设（首次回调已删除旧 cookie）。

## 数据流

```
用户点击"连接 WordPress" / 主站登录后自动触发
  → wp-init: 生成 state → wp_auth_state cookie → 跳 Authentik (prompt=none)
  → Authentik:
      有会话 → 返回 code → wp-callback → login mutation → 成功设 wp_token
      无会话 → error=login_required (无 code)
  → wp-callback 检测 error=login_required（认证类）
      → 重新生成 state + 重设 cookie
      → 跳转交互式授权 URL（无 prompt）
      → Authentik 显示登录页 → 用户认证 → 返回 code → wp-callback → 成功
```

## 备选方案

| 方案 | 说明 | 未采纳原因 |
|---|---|---|
| 移除 prompt | 直接交互式，无静默段 | 会话有效时也强制显示登录页，体验差（静默段保留，仅降级段无 prompt） |
| prompt=login 降级 | 降级段强制重认证 | **Authentik 上游 bug**（#12182/#18507）：认证后仍强制重认证，第三方登录无限循环 |
| 仅提示不自动降级 | 报错让用户手动重试 | 体验割裂，用户困惑 |
| 前端二次跳转 | JS 处理降级 | 多一跳，后端可直接处理 |

## 影响

### 前端
- `src/lib/auth/authentik.ts`：新增 `getWpAuthorizationUrlInteractive(state)`。
- `src/pages/api/auth/wp-callback.ts`：`!code` 分支检测认证类 error 并自动降级重定向。

### 风险与注意
- ~~降级重定向是无限循环风险~~：已确认不能靠 `prompt=login` 防循环（它有 Authentik 上游 bug），改用无 prompt——无会话显示登录页、有会话静默放行，认证后不再强制重认证，自然终止。
- `wp_auth_state` cookie 的 300s 过期：交互式登录页面停留超过 5 分钟会失效（可接受，用户重试即可）。
- **第三方登录（Google/GitHub）**：修复前因 `prompt=login` 循环无法完成；修复后无 prompt 的 authorize 在第三方认证建立会话后静默放行，第三方登录可正常完成。

## 参考文献

- Authentik `authorize.py`：`prompt=none` + 未认证 → `login_required`
- OIDC Core 3.1.2.6：prompt=none 的认证错误码定义
- `src/lib/auth/authentik.ts`、`src/pages/api/auth/wp-callback.ts`、`src/pages/api/auth/wp-init.ts`
