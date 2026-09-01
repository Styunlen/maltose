# 术语表 (Glossary) — 认证

## Authentik

自托管的开源身份提供商（OIDC/OAuth2），本项目的统一登录入口。`api.styunlen.cn` 承载其服务。项目中有两个 Authentik client：主站 client（`AUTHENTIK_CLIENT_ID`，登录 Astro 站）和 WordPress client（`AUTHENTIK_WP_CLIENT_ID`，用于 wp-graphql-headless-login）。

## prompt 参数（OIDC Authorization Request）

OIDC 授权请求的可选参数，控制授权服务器是否显示交互界面：
- `prompt=none`：强制静默——用户未认证时返回 `login_required` 错误（不带 code）。
- `prompt=login`：强制重新认证。
- 无 prompt：有会话则静默放行，无会话则显示登录页。

## 两段式登录（Two-Phase Login Fallback）

WordPress 登录的降级策略（ADR-0011）：先以 `prompt=none` 静默尝试获取授权码；若 Authentik 返回认证类错误（`login_required`/`interaction_required`/`account_selection_required`），自动降级重定向到**无 prompt** 的交互式授权 URL，用户完成认证后返回 code 继续流程。**注意**：降级 URL 不能带 `prompt=login`——Authentik 存在上游 bug（issue #12182/#18507），`prompt=login` 会在刚认证后强制重认证，导致第三方登录（Google/GitHub）无限循环跳回登录页。

## wp_auth_state cookie

`wp-init.ts` 设置的 WordPress OAuth 状态 cookie（含随机 `state` + `returnTo`，300s 过期，httpOnly）。用于回调时校验 `state` 防 CSRF。每次 wp-init 重新生成，回调成功后删除。

## wp_token / wp_refresh cookie

WordPress JWT 认证 token（wp-graphql-headless-login 签发）及其刷新 token。`wp-callback.ts` 在 login mutation 成功后设置，用于后续评论/认证的 WP GraphQL 请求（`Authorization: Bearer`）。authToken 有效期仅 5 分钟。

## 无感刷新队列（Token Refresh Queue）

SSR 中间件的 token 刷新去重机制（ADR-0012）。参考 vue-pure-admin 的 `isRefreshing` + `requests` 队列原理：以 **refresh token 的 sha256 哈希为键**，模块级 Map 缓存"进行中的 refresh Promise"——同一用户并发请求共享一次 refresh，其余请求 await 同一 Promise 拿新 token；不同用户（不同 refresh token）天然隔离。`expiringSoon` 阈值从 1 小时收紧到 30 秒，避免 5 分钟有效期的 WP token 导致每次请求都刷新。
