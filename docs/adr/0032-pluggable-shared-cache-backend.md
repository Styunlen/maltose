# ADR-0032: 可插拔共享缓存后端（memory / redis / lmdb）

## 状态

已接受

## 日期

2026-08-24

## 背景

ADR-0024 实现了进程内 LRU 缓存（`LruLink`，SWR 策略），并明确记录了 pm2 cluster 下的限制：

> 进程内 LRU 每进程独立——pm2 cluster 模式下各进程缓存互不相通，缓存命中率随进程数下降，且失效广播不跨进程。可选方案：短 TTL、HTTP webhook、`process.send` 广播，或迁移外部缓存（Redis/Upstash）。

ADR-0024 当时**否决了 Redis 外部缓存**（"引入外部依赖，与'不写磁盘、单进程'约束冲突"）。

现状：站点将启用 pm2 cluster（多进程），需要**跨进程缓存一致性**——进程 A 发评论失效 `GetNodeByURI`，进程 B 必须同步感知。同时要求**通用方案**：有 Redis 和无 Redis 的部署都能实现缓存共享，后端可通过配置切换。

**决策前提**（grill 确认）：
1. **数据也共享**（真·共享缓存），不是只同步失效信号
2. **显式三选一配置**：`GRAPHQL_CACHE_DRIVER=memory|redis|lmdb`
3. **无 Redis 也要同步失效**——引入 LMDB（嵌入式 KV，mmap 多进程共享）作为无服务器依赖的共享后端
4. **抽象 driver 层**：CacheStore 接口，预留未来扩展（如 SQLite）
5. 故障降级 fail-open：后端不可用 → 退回 memory + 定期重试

**技术调查**：
- `LruLink.request()` 必须同步返回 Observable（Apollo Client 4.1.9 + rxjs 7.8.2）；executor 内可异步，但 executor 本身不能声明 async（rxjs 在 teardown 时对 Promise 返回抛 `UnsubscriptionError`）
- LMDB 提供 `getSync`（mmap 同步读共享文件）→ **真·跨进程数据共享**，无需本地镜像
- Redis 客户端无同步读 API → RedisStore 用「同步本地镜像 + 异步 Redis 写/失效」
- 有 Redis 部署跨进程失效靠共享存储 + SCAN 删前缀；无 Redis 靠 LMDB 共享文件天然一致

## 决策

### 1. CacheStore 接口（可插拔后端）

`src/lib/cache/types.ts`：
```ts
export interface CacheStore {
  get(key: string): CacheEntry | undefined | Promise<CacheEntry | undefined>;
  set(key: string, entry: CacheEntry): Promise<void>;
  delete(key: string): Promise<void>;
  deleteByPrefix(prefix: string): Promise<void>;   // 按 operationName 前缀族失效
  cleanup(maxAgeMs: number): Promise<number>;      // 清理过期项，返回数量
  clear(): Promise<void>;
  size(): Promise<number>;
  close(): Promise<void>;
}
```
`CacheEntry = { data, storedAt }` —— SWR 的 TTL/age 判定由 `LruLink` 依据 `storedAt` 计算，共享后端原样序列化即可保证跨进程一致。

**`get` 双返回类型（关键设计）**：memory/lmdb 同步返回（`CacheEntry | undefined`），redis 返回 Promise。LruLink 用 `instanceof Promise` 区分——同步 store 的热命中在**同一 JS 栈**完成（零微任务），异步 store（redis）await 读共享。这是性能与真共享的平衡点（详见"架构修正"）。

### 2. 三种实现

| Driver | 文件 | 共享性 | 说明 |
|---|---|---|---|
| memory | `memory-store.ts` | 无（进程内）| 默认；LRUCache 封装，`maxEntries` 限内存；`get` 同步 |
| redis | `redis-store.ts` | **真·数据共享** | 直接 await Redis 读写（无本地镜像）；`SCAN` 删前缀 |
| lmdb | `lmdb-store.ts` | **真·数据共享** | mmap 多进程共享；`getSync` 同步读共享文件；`getRange` 范围删 |

LMDB 配置：路径 `GRAPHQL_CACHE_PATH`（默认 `.cache/graphql`）、mapSize 默认 64MB、子库 `graphql-cache` 隔离。

### 3. 配置与接线

- `GRAPHQL_CACHE_DRIVER=memory|redis|lmdb`（默认 memory）
- `GRAPHQL_CACHE_PATH`、`GRAPHQL_CACHE_MAP_SIZE`（lmdb）
- `GRAPHQL_CACHE_CLEANUP_MS`（定时清理周期，0=禁用）
- `REDIS_URL` / `REDIS_PASSWORD`（redis，沿用现有 rate limiter 配置）
- `api.ts` 用 `createCacheStoreSync` 同步创建 store 传给 `LruLink`；redis 懒连接由 `startCacheRedis` 异步驱动（`setClient` 激活）

### 4. 故障降级（fail-open + 定期重试）

- 后端初始化失败 → `console.warn` + 退回 MemoryStore（服务不中断）
- 每 `retryIntervalMs`（默认 60s）重试连接；`CacheStoreConfig.onReconnect` 回调
  把重连成功的 store **真正换回**（`LruLink.setStore`）——避免"日志说重试但永远用 memory"的死代码
- `startCleanupTimer`：周期调 `store.cleanup()`，异常吞掉不崩进程
- **Redis 键 TTL 兜底**：`set` 带 `EX: 1800`（30 分钟硬上限），即使 cleanup 定时器关闭也不会无限累积（SWR 的 stale 由本地镜像兜底）

### 5. 跨进程失效语义

- **redis**：`deleteByPrefix` 清本地镜像 + Redis `SCAN` 前缀删 → 所有进程共享存储中该族 key 全清；各自镜像下次 miss 重新填充
- **lmdb**：`deleteByPrefix` 用有序 B+Tree `getRange` 范围删 → 共享文件直接删，所有进程下一次 `getSync` 即 miss
- **memory**：单进程，无跨进程语义（文档说明局限）

## 影响

- 修改：`lru-link.ts`（store 可插拔）、`api.ts`（driver 接线）、`graphql-proxy.ts` 不受影响
- 新增：`src/lib/cache/*`（types/memory/redis/lmdb/index + 单测）、`.env.example`、`ecosystem.config.cjs`（pm2 示例）
- 依赖：新增 `lmdb`（原生模块，有 prebuilt）
- 安全：LMDB 文件是本机共享存储，权限与部署环境一致；Redis 沿用现有凭据体系
- 不改变：SWR 策略、TTL_CONFIG、STRONG_CONSISTENCY、mutation 失效调用点

## 架构修正（2026-08-25）

初始实现受"`request()` 必须同步读缓存"的假设约束，Redis 用了「同步本地镜像 + 异步写」混合方案。经 Apollo 官方文档 + 源码 + 实证验证后修正：

**Apollo Link 异步能力实证结论**：
- `request()` 必须**同步返回 rxjs Observable**（Apollo 核心对返回值调 `.pipe()`，async request 返回 Promise 会运行时崩溃）
- **但 Observable executor 内可异步**（官方 `SetContextLink`/`BaseHttpLink` 均用此模式）；executor 本身不能声明 async（rxjs 7.8.2 对 Promise 返回在 teardown 时抛 `UnsubscriptionError`）
- 正解：executor 内 async IIFE + 同步返回 teardown

**修正**：LruLink 把 hit/miss 决策移入 executor，`await store.get(key)`；`CacheStore.get` 支持同步值（memory/lmdb 零微任务热命中）或 Promise（redis 直接 await 真共享）。**Redis 删除本地镜像**——所有 driver 都是真·数据共享。

## 备选方案

- **pm2 IPC 广播**（`process.send`）：实时但**仅限 pm2 cluster**，非 pm2 部署（Docker/裸 Node）不适用；弃
- **文件标记 + 短 TTL**：零依赖但只同步失效不共享数据，且失效滞后；弃
- **SQLite WAL**：Node 22+ 内置零依赖，多进程可共享；但写是单写者锁、无同步读 API、`deleteByPrefix` 需 SQL 事务；作为未来扩展（CacheStore 接口已预留）
- **本地镜像混合**（初版方案）：为绕开"同步读"约束而引入；修正后不需要（executor 内 await 即可真共享），弃
- **异步 request()**：不可行——Apollo 核心对 request 返回值调 `.pipe()`，Promise 会运行时崩溃（已实证）

## 参考文献

- ADR-0024（进程内 LRU）、ADR-0029（stale content boundaries）
- `src/lib/lru-link.ts`（SWR 实现）、`src/lib/cache/*`（本决策实现）
- Apollo Client 4.1.9：`request` 必须同步返回 rxjs Observable（`ApolloLink.d.ts`）；executor 可异步但不能 async（rxjs 7.8.2 teardown 对 Promise 抛错）
- LMDB：mmap 多进程共享、`getSync` 同步读、`getRange` 有序范围删
- node-redis v5：`SCAN` 前缀删、无同步读 API
