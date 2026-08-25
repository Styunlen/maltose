# ADR-0029: 文章内容缓存陈旧边界（30s TTL 之外仍显示旧正文）

## 状态

已接受

## 日期

2026-08-19

## 背景

「分页测试」页面（WP `<!--nextpage-->` 分页文章）在 WordPress 后台编辑正文后，等待超过 LruLink 的 30s TTL，页面正文仍显示旧内容。线上 WP 已多次修改（"缓存更新后" → "缓存更新后 2"），本地 dev 进程在 90 秒内每 5s 请求一次，页面始终显示旧一代内容，从未翻新。

**实测复现过程**（2026-08-19）：
1. 直连 WP（签名查询）：`content` 返回最新 "缓存更新后 2" ✅
2. 本地 `/api/graphql-proxy`（绕 LruLink）：返回最新 "缓存更新后 2" ✅
3. 本地 `/分页测试`（经 LruLink）：返回旧版 "缓存更新后" ❌
4. 独立进程（vitest，新 InMemoryCache）调 `getQuery(GetPost)`：全部最新 ✅
5. **重启 dev 进程（清空进程内缓存）后首次请求：立即最新 ✅**

**结论**：数据源（WP/proxy）始终最新；LruLink 算法正确；**陈旧源于 Apollo InMemoryCache 在 LruLink 之前短路了 GetPost/GetNodeByURI 请求**。

## 根因分析

### 数据链路

```
浏览器 → [CDN/代理] → Node SSR（单进程）
  ├─ [...uri].astro:22 → getNodeByURI → client.query(network-only) → Apollo InMemoryCache → LruLink(GetNodeByURI, TTL 30s)
  └─ Single.astro:68 → getQuery(GetPost) → client.query(network-only) → Apollo InMemoryCache → LruLink(GetPost, TTL 30s)
       └─ editorBlocks → SSR 烘焙全部 #page-N → 浏览器
```

### 根因（铁证）

**探针测试**（`getQuery(GetPost)` 连调 3 次，monkey-patch LruLink.request 记录调用）：

```
calls: ["GetPost:default"]   ← 3 次调用只有 1 次到达 LruLink，且 fetchPolicy="default"
```

1. `getQuery`（`api.ts:132-142`）显式传 `fetchPolicy: "network-only"`，**意图绕过 Apollo InMemoryCache 直达 LruLink**。
2. **但 `client` 构造时设了 `ssrMode: true`（`api.ts:122`）**——Apollo 据此设 `prioritizeCacheValues = true`（`ApolloClient` 构造器：`this.prioritizeCacheValues = ssrMode || ssrForceFetchDelay > 0`），该机制在 `QueryManager.fetchObservableWithInfo` 内把 **`network-only`/`cache-and-network` 静默降级为 `cache-first`**（官方源码注释："This will essentially turn a 'network-only' or 'cache-and-network' fetchPolicy into a 'cache-first' fetchPolicy"）。
3. 实测（vitest 探针，`ssrMode: true`）：无论 defaultOptions 是 `cache-first`、`no-cache`，还是显式传 `network-only`，**3 次相同查询都只有 1 次到达 LruLink**；唯一全部到达（3 次）的是 defaultOptions = `no-cache`。
4. 降级后：首次请求 InMemoryCache miss → LruLink miss → 网络 → 缓存写入（InMemoryCache + LruLink 各一份）；后续请求 **InMemoryCache cache-first 命中 → 直接返回，LruLink 完全不参与**。
5. InMemoryCache 是**进程内存，无 TTL、无 GetPost/GetNodeByURI 清理**（只有评论 mutation 清 `GetNodeByURI:` 前缀，且清的是 LruLink 不是 InMemoryCache）→ **文章数据被钉在进程生命周期内**。
6. 线上编辑后：**只要 Node 进程不重启，旧正文永远被返回**——LruLink 的 30s TTL 形同虚设（根本轮不到它执行）。

> **根因修正（2026-08-20）**：初稿将机制归因为"`defaultOptions` 的 `cache-first` 压过显式 `network-only`"——不准确。实验证明即使显式传 `network-only`、甚至 defaultOptions 设为 `network-only`，ssrMode 的缓存优先转换都会静默降级。真正根因是 **`ssrMode: true` → `prioritizeCacheValues` 转换**，且转换名单只含 `network-only`/`cache-and-network`，**不含 `no-cache`**——这解释了为何 `no-cache` 是唯一有效解。

### 为什么此前探针"看起来正常"

每次 `vitest run` 都是**新进程**（InMemoryCache 为空），所以 t0/t5/t25/t40 全部返回最新——但这只是"新进程 + 单次调用"场景，掩盖了**长生命周期进程中 InMemoryCache 短路**的问题。

## 决策

### 修复（按优先级）

1. **`getQuery` 改 `fetchPolicy: "no-cache"`**（`api.ts:139`）：`no-cache` 不在 ssrMode 缓存优先转换名单内（`prioritizeCacheValues` 只转 `network-only`/`cache-and-network`），是唯一在 `ssrMode: true` 下能真正到达 LruLink 的策略。
   - 注意：`no-cache` 实测（探针）确实每次走到 LruLink；`network-only` 则被 ssrMode 静默降级为 `cache-first`（即使显式传或设为默认），因此**不可用**。
2. **`getNodeByURI` 同改**（`api.ts:606`）：GetNodeByURI 是文章标题/日期/评论/元信息源，同样被 ssrMode 降级 + InMemoryCache 短路。
3. **`defaultOptions.query.fetchPolicy` 改为 `no-cache`**（`api.ts:123-128`）：根治所有查询被 InMemoryCache 钉死的问题。注意**不能移除**（Apollo 默认仍是 cache-first 会继续短路）——必须显式设为 no-cache，让 LruLink 成为唯一跨请求缓存层（ADR-0024 原设计意图）。
4. **附带**：`homePagePostsQuery`（HomePosts）与 `getRandomPosts`（RandomPosts）从 `network-only` 改 `no-cache`——它们同样被 ssrMode 降级吞掉，TTL 一直是死代码；改为 no-cache 后 SWR TTL 恢复生效。

### 验证

- [x] 重启 dev 后首次请求即最新（已实测）
- [x] 独立进程 GetPost 正常（已实测）
- [x] 修复后 `getQuery` 连调 3 次全部到达 LruLink（vitest 探针：修复前仅 1 次，修复后 3 次，`calls: ["GetPost","GetPost","GetPost"]`）
- [x] SWR 行为正常：miss → hit → hit+revalidate 序列（vitest 探针）
- [x] 29 单测全绿 + 构建通过
- [ ] 生产环境长进程：线上修改后 ≤30s 自动翻新（需真实 updatePage 写操作验证，受限于认证未做）

## 影响

- 修改文件：`src/api/api.ts`（`getQuery`、`getNodeByURI` 的 fetchPolicy；`defaultOptions`）。
- 无新增依赖。
- 性能影响：文章查询从"InMemoryCache 内存直读"变为"走 LruLink（进程内存 + SWR）"——命中时 TTFB 相当（两者都是内存读），但 LruLink 会按 TTL 刷新，带来正确的陈旧边界。

## 备选方案

- **给 InMemoryCache 加 TTL**：Apollo 无原生 TTL，需自定义 eviction，复杂。
- **注释掉 `defaultOptions.query.fetchPolicy`**：等价于移除 cache-first，但 `getQuery` 仍显式 network-only，需同时改（见决策 1/2）。
- **`transition:persist`/CDN 层**：与根因无关（数据根本没到网络层），弃。

## 参考文献

- ADR-0024（LruLink SWR 缓存）
- ADR-0015（GraphQL 分层缓存；line 120 声明 WP 侧缓存为域外风险——本次确认非 WP 侧问题）
- Apollo Client `fetchPolicy` 语义（[官方文档：supported fetch policies](https://www.apollographql.com/docs/react/data/queries/#supported-fetch-policies)——`cache-first` 短路 link 链；`network-only`/`no-cache` 绕过 InMemoryCache）
- Apollo Client `ssrMode` / `prioritizeCacheValues` 机制（[官方文档：server-side-rendering](https://www.apollographql.com/docs/react/performance/server-side-rendering/#initializing-apollo-client)："ssrMode … tells the client to prioritize cache values over network requests"；ApolloClient 构造器 `this.prioritizeCacheValues = ssrMode || ssrForceFetchDelay > 0`；QueryManager 内将 `network-only`/`cache-and-network` 降级为 `cache-first`）
- Apollo SSR 官方文档：每请求新建实例建议（[server-side-rendering](https://www.apollographql.com/docs/react/performance/server-side-rendering/#initializing-apollo-client)；本项目用单例 + no-cache + LruLink 隔离规避）
- `src/api/api.ts`、`src/lib/lru-link.ts`、`src/pages/[...uri].astro`、`src/components/wp-templates/Single.astro`
