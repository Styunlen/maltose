# 术语表 (Glossary) — 缓存陈旧边界（Stale Content）

## LruLink（进程内 LRU 缓存链）

Astro 侧 Apollo 链接链最前端的进程内缓存（`src/lib/lru-link.ts`，ADR-0024）。按 `{operationName}:{sha256(变量)}[:用户哈希]` 建 key，SWR 策略：新鲜命中直接返回；revalidate 窗口返回缓存+后台刷新；过期后非强一致返回 stale+后台刷新、**强一致（STRONG_CONSISTENCY）强制等网络**。文章查询（GetNodeByURI/GetPost）TTL 30s 且强一致。**LruLink 是跨请求缓存的唯一归属层**（ADR-0024/0029）。

## SWR（Stale-While-Revalidate）

过期后先返回旧数据、同时后台拉新数据的缓存策略。副作用：**revalidate 窗口内访问的请求必然拿到旧内容**（哪怕刚编辑过）——这是"TTL 内看到旧正文"的正常语义，不是 bug。**只要持续有流量（间隔 < TTL），后台刷新会不断把 `storedAt` 续期，缓存永远"新鲜"**，内容只更新到最近一次后台刷新拿到的数据。

## STRONG_CONSISTENCY（强一致性查询集）

`api.ts` 中标记的查询（当前 GetNodeByURI/GetPost）：**过期后不再返回 stale，而是阻塞等待网络回源**。设计意图是读后写场景（文章+评论）的即时一致性。但"强制网络"不等于"拿到新数据"——若网络另一端（WP）本身缓存，或网络请求失败（见"网络失败 fallback"），强一致也会返回旧/异常数据。

## InMemoryCache 短路（InMemoryCache Short-Circuit）【ADR-0029 根因】

Apollo Client 的 `InMemoryCache` 在**默认 `cache-first`** 下会在 link 链之前命中缓存并直接返回，**请求根本不经过 LruLink**。后果：

- 首次请求：InMemoryCache miss → LruLink miss → 网络 → 双份缓存。
- 后续请求：**InMemoryCache 命中 → LruLink 完全不参与**。
- InMemoryCache 是**进程内存，无 TTL** → 文章数据被钉在进程生命周期内，**线上编辑后只要进程不重启，旧正文永远被返回**——LruLink 的 30s TTL 形同虚设（轮不到它执行）。

**修复（ADR-0029）**：`client` 的 `defaultOptions.query.fetchPolicy` 从 `cache-first` 改为 `no-cache`——强制每个查询都经过 LruLink，让 LruLink 的 TTL/SWR 真正生效。**InMemoryCache 仅满足 ApolloClient 构造要求**（ADR-0024 原设计意图）。

## `network-only` vs `no-cache`（fetchPolicy 语义）

- `network-only`：绕过 InMemoryCache **读**，但**写回** InMemoryCache → 数据仍被钉住（下次 cache-first 命中）。
- `no-cache`：绕过 InMemoryCache **读且不写回** → 每次请求都到达 LruLink。
- 本项目修复后统一用 `no-cache`（文章查询 GetPost/GetNodeByURI、首页列表 HomePosts、推荐池 RandomPosts），并移除全局 `cache-first` 默认。

## 验证器（ETag / Last-Modified）

HTTP 条件请求（If-None-Match / If-Modified-Since）的依据。本项目全站未设置验证器。后果：`Cache-Control: no-cache, must-revalidate` 的 "revalidate" 对 CDN 无从执行——没有验证器就无法发条件请求，配置不当的代理会按默认 TTL 缓存整页 HTML。**本次「分页测试」陈旧问题排除该层**（本地无 CDN 干扰时仍陈旧），但作为生产环境的残余风险记录在案（ADR-0029 备选排查路径）。

## editorBlocks（正文渲染唯一数据源）

`GetPost` 查询返回的 `editorBlocks`（WP 块编辑器结构化块），`Single.astro` 据此 SSR 渲染正文并在 `CoreNextpage` 块处切分 `<!--nextpage-->` 分页。**注意：`GetNodeByURI` 返回的 `content` 字段不参与正文渲染**——排查正文陈旧时只查 GetPost 的缓存状态即可。

## 分页 SSR 烘焙（SSR-baked Pagination）

`Single.astro` 把分页测试的所有分页内容一次性渲染进 `#article-pages > #page-N` HTML，`ArticlePagination.tsx` 只做 DOM 显隐切换（不重新请求）。**分页视图不可能比所在 SSR 文档更新**——刷新分页内容只能靠刷新整个页面（或失效对应缓存条目）。

## 网络失败 fallback（LruLink Error Fallback）

`lru-link.ts`：网络请求出错（5xx/超时/429）时，**即使强一致查询也返回缓存中的旧数据**。这是"强一致 + 健康网络"之外第三个能突破 TTL 边界的机制，陈旧时长无上限（ADR-0029 排查路径之一，本次未命中）。
