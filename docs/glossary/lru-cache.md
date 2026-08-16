# 术语表 (Glossary)

## LruLink

进程内 LRU 缓存 ApolloLink（`src/lib/lru-link.ts`），位于 Apollo link 链首，实现 stale-while-revalidate（SWR）缓存策略。所有 GraphQL 查询（除 mutation）都流经它。见 ADR-0024。

## stale-while-revalidate (SWR)

一种缓存策略：缓存新鲜时直接返回；达到 revalidate 阈值（TTL×0.5）或过期时，**先返回缓存数据（stale）**，再后台异步刷新，不阻塞响应。相比"过期必须等网络"的方案，SWR 让 TTFB 始终保持缓存速度。

## STRONG_CONSISTENCY

LruLink 的白名单操作集合。这些查询**缓存过期时必须等网络返回最新数据**（不返回 stale）。用于写后读（read-after-write）场景：评论列表、文章正文——用户发表评论/编辑后刷新应看到新内容。当前名单：`GetNodeByURI`（文章+评论）、`GetPost`（正文块）。

## TTL_CONFIG

按 operationName 配置的缓存时长（秒）。缺省 60s。项目分级：

| operation | TTL | 策略 |
|---|---|---|
| LayoutQuery / MegaQuery / TimelinePosts / TimelineStats / PostsByMonth | 300s | SWR |
| RandomPosts | 180s | SWR |
| HomePosts | 60s | SWR |
| GetNodeByURI / GetPost | 30s | STRONG_CONSISTENCY |

## makeCacheKey

LruLink 的缓存 key 生成函数：`{operationName}:{sha256(稳定序列化 variables)}[:{userHash}]`。
- operationName 保留明文前缀，便于 mutation 后 `deleteByPrefix` 按查询族批量失效。
- 稳定序列化（字段排序）保证 variables 顺序变化不影响 key。
- 携带 `Authorization` 头的操作追加 `sha256(token)` 后缀，匿名/登录用户缓存隔离。

## __internalLruCache

本进程缓存操作接口（`src/api/api.ts` 导出）：`{ makeCacheKey, deleteKey, deleteByPrefix }`。mutation 成功后调用它主动失效相关缓存：
- 评论 create/update/delete → `deleteByPrefix("GetNodeByURI:")`（评论内嵌在文章响应里）
- 浏览数（recordPostView）→ 依赖 GetNodeByURI 的 30s TTL + STRONG_CONSISTENCY 自然更新，不主动失效（高频写，全量失效会破坏缓存收益）

## 进程内缓存 (In-process Cache)

缓存存活于 Node 进程内存（lru-cache）。pm2 多进程模式下**每进程独立**：各进程缓存互不相通、失效广播不跨进程。当前部署为单进程 standalone SSR，无此问题。
