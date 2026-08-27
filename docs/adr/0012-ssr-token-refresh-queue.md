# ADR-0012: SSR 中间件 token 无感刷新队列化

## 状态

已接受

## 日期

2026-08-07

## 背景

页面加载慢（TTFB 秒级），性能诊断发现两大根因：

### 根因 1：middleware 每次请求都触发 token refresh

`src/middleware.ts` 的 `expiringSoon` 条件是 `expMs - now < 3600 * 1000`（**1 小时内过期就刷新**）。而 WP 签发的 authToken **有效期仅 5 分钟**（300s，实测确认）——**几乎所有时间都处于 expiringSoon** → **每个页面请求都先串行执行一次 refresh 网络请求**（约 1s），阻塞页面渲染。

实测日志（登录用户）：
```
[TOKEN] expired: false expMs: 17:58:22 now: 17:53:27  ← 还剩 5 分钟，仍触发 refresh
[TOKEN] attempting refresh
[TOKEN] refresh response status: 200 hasNewToken: true
```

### 根因 2：并发请求各自刷新

SSR 页面会发出多个 GraphQL 查询（首页 6 个、文章页 3 个），但 **middleware 的 onRequest 对每个请求独立执行**——如果页面渲染前有多个中间件/查询，理论上各请求独立判断 refresh，无去重。

参考 vue-pure-admin 的无感刷新原理（`isRefreshing` + `requests` 队列）：第一个请求触发 refresh，后续请求排队复用新 token，避免并发多次 refresh。

## 需求

- 多个并发请求（同一用户）只触发**一次** refresh，其余排队等待新 token。
- **多用户隔离**：不同用户的 refresh 队列互不干扰（SSR 多用户并发是常态）。
- 调整 expiringSoon 阈值，减少无谓刷新。

## 决策

### 1. 模块级单例 + refresh-token-hash 队列

`src/middleware.ts` 模块作用域维护：

```ts
// 按 refresh token hash 缓存"正在进行的 refresh Promise"，实现并发去重 + 多用户隔离
const refreshInFlight = new Map<string, Promise<string | null>>();

function hashToken(t: string): string {
  return createHash("sha256").update(t).digest("hex");
}

async function refreshTokenFor(refreshToken: string): Promise<string | null> {
  const key = hashToken(refreshToken);
  // 同一用户并发：复用进行中的 refresh，避免重复请求
  const inFlight = refreshInFlight.get(key);
  if (inFlight) return inFlight;

  const p = (async () => {
    try {
      const res = await fetch(getProxyUrl(), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query: `mutation RefreshAuthToken($input: RefreshTokenInput!) {
            refreshToken(input: $input) { authToken authTokenExpiration }
          }`,
          variables: { input: { refreshToken } },
        }),
      });
      const data = await res.json();
      return data?.data?.refreshToken?.authToken ?? null;
    } catch {
      return null;
    } finally {
      refreshInFlight.delete(key);  // 完成后清理，下次过期重新刷新
    }
  })();

  refreshInFlight.set(key, p);
  return p;
}
```

- **键**：`sha256(refreshToken)`——每个用户的 refresh token 唯一，天然隔离。
- **并发去重**：同一用户并发请求命中同一 Promise，只发一次 refresh。
- **失败清理**：`finally` 删除 Map 项，避免永久缓存失败状态。

### 2. 阈值调整为 30s

```ts
const expiringSoon = !expired && expMs - now < 30 * 1000;
```

- 仅**即将过期（<30s）或已过期**才触发 refresh。
- WP token 5 分钟有效期：用户活跃会话中约 5 分钟刷新一次（而非每次请求），且并发只发一次。
- 阈值 30s 足够覆盖一次页面加载（TTFB 秒级内不会跨过 30s 边界）。

### 3. 新 token 分发

- 触发 refresh 的请求：拿到新 token 后 `cookies.set("wp_token", ...)` 写回当前响应。
- **队列中等待的其他请求**：它们与触发者是**同一用户**（同 refresh token hash），在 `await refreshTokenFor()` 拿到同一新 token 后，各自 `cookies.set` 到自己的响应——Astro 的每请求 cookie 对象独立，天然正确。

### 4. 保留兜底

- refresh 失败（返回 null / 网络错误）→ 删除旧 token（现有逻辑），请求继续无认证。
- 白名单等价物：refresh 请求本身不再走 middleware 的 refresh 分支（fetch 直连 proxy，不经 onRequest 递归）。

## 数据流

```
并发 3 个请求（同一用户，token 将过期）
  ├─ 请求A: refreshTokenFor() 创建 Promise → 发起 refresh → isRefreshing(共享)
  ├─ 请求B: refreshTokenFor() 命中同一 Promise → await（不发起新 refresh）
  └─ 请求C: 同上
  └─ refresh 完成: Promise resolve 新 token
      ├─ A: cookies.set(wp_token) → 继续渲染
      ├─ B: cookies.set(wp_token) → 继续渲染
      └─ C: cookies.set(wp_token) → 继续渲染
```

## 备选方案

| 方案 | 说明 | 未采纳原因 |
|---|---|---|
| 重定向重试 | 刷新后 302 让客户端重试 | 体验差，SSR 场景不适用 |
| 无隔离的全局队列 | 单一 isRefreshing | 多用户并发会串 token（A 的 refresh 给 B 用） |
| 保留 1h 阈值 | 仍频繁刷新 | 5 分钟 token 几乎永远触发，浪费 |

## 影响

### 前端
- `src/middleware.ts`：新增 `refreshInFlight` Map + `refreshTokenFor()`，`expiringSoon` 阈值 1h → 30s，refresh 逻辑复用队列函数。

### 风险与注意
- **多用户隔离**：refresh token hash 作键，理论上不同用户 token 可能碰撞（sha256 碰撞概率可忽略）；极端情况下同 hash 复用是安全的（同一 token 刷新结果相同）。
- 模块级 Map 在 SSR 常驻进程中跨请求存活——正确（这正是复用 refresh 的目的）；需确保失败后 `finally` 清理。
- 阈值 30s：若页面渲染本身 >30s（不会），可能边界刷新；实际 TTFB 秒级，安全。

## 参考文献

- vue-pure-admin 无感刷新：`src/utils/http/index.ts`（`isRefreshing` + `requests` 队列 + `retryOriginalRequest`）
- ADR-0011（WP 登录两段式降级）：`docs/adr/0011-wp-login-prompt-fallback.md`
- `src/middleware.ts` 现有 token 刷新逻辑
