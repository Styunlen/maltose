# 部署指南

Maltose 是 Headless WordPress + Astro 7（SSR, Node adapter）博客。本文介绍如何把 Astro 前端部署起来并与 WordPress 打通，含常见拓扑（直连、Docker nginx、frp 内网穿透）。

> 完整 CI/CD（GitHub Actions 双环境 + 受限 SSH key）见 [deploy/README.md](../deploy/README.md)（ADR-0033）。本文聚焦「拓扑 + 关键配置」。

## 架构总览

```
访客
 └─HTTPS─▶ 反向代理（nginx / frp / 云负载均衡）
            └─HTTP─▶ Astro SSR（pm2, standalone, dist/server/entry.mjs）
                       ├─ /api/graphql-proxy（签名转发）─▶ WordPress WPGraphQL
                       └─ 静态资源（dist/client, staticHeaders 自服）
```

- **Astro 用 Node standalone 模式**：同时 serve SSR 页面 + `dist/client` 静态资源，nginx 无需知道部署目录（见 `deploy/nginx.conf` 注释）。
- **WordPress 主题**（`wordpress-theme/`）提供自定义 GraphQL 字段（评论 geo、阅读量、置顶等），通过 `functions.php` + `includes/*.php` 注册。
- 前后端解耦：Astro 只通过 `/api/graphql-proxy` 与 WP 通信，签名校验（`WP_GRAPHQL_SECRET_KEY`）。

## 一、Astro 应用部署

### 1. 构建

```bash
pnpm install --frozen-lockfile
pnpm build   # 产出 dist/client + dist/server
```

### 2. 运行（pm2）

用 `ecosystem.config.cjs`（已声明 `maltose-production` / `maltose-staging` 两个 app）：

```bash
pm2 start ecosystem.config.cjs --only maltose-production
```

- 端口：`.env` 的 `PORT`（默认 8080 production / 8081 staging）。
- 监听地址：`HOST=0.0.0.0` —— 若反向代理跑在 Docker 里经 host-gateway 访问，必须设，否则容器访问不到 `::1` 的 pm2 → 502。
- 环境变量：pm2 用 `node_args: "--env-file=.env"` 在部署目录加载 `.env`（ADR-0034），改 `.env` + `pm2 restart` 即生效，无需重建。

### 3. `.env` 关键项

```bash
PORT=8080
HOST=0.0.0.0
WORDPRESS_API_URL=https://styunlen.cn/graphql          # 服务端专用，绝不暴露给浏览器
WP_GRAPHQL_SECRET_KEY=change-me                          # 与 WP 主题签名一致
APP_SECRET=…                                             # session cookie 签名
APP_URL=https://styunlen.cn
BLOG_OWNER_USER_IDS=1                                    # 博主徽章用户 ID（多账号逗号分隔）
```

完整模板见 [.env.example](../../.env.example)。

## 二、反向代理配置

### 直连 nginx（最简单）

推荐配置见 `deploy/nginx.conf`（纯反代到 pm2 `127.0.0.1:8080`，静态资源仍由 Astro 自服）：

```nginx
server {
    listen 80;
    server_name styunlen.cn www.styunlen.cn;
    location / {
        proxy_pass http://maltose;                        # upstream: 127.0.0.1:8080
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_http_version 1.1;
        client_max_body_size 20m;
    }
}
```

启用：`sudo cp deploy/nginx.conf /etc/nginx/sites-available/maltose && sudo ln -s … /etc/nginx/sites-enabled/`，改 `server_name`/端口/SSL 后 `sudo nginx -t && sudo systemctl reload nginx`。

### Docker 化 nginx（本项目生产实际形态）

若 nginx 跑在 Docker 容器里，额外注意三点（已在生产验证）：

1. **端口映射**：compose 必须显式 `80:80`、`443:443`，否则外部流量进不了容器。
2. **访问宿主机 app**：容器内 `127.0.0.1:4321` **不是**宿主机——用 `host.docker.internal`（compose 加 `extra_hosts: - "host.docker.internal:host-gateway"`），配置写 `proxy_pass http://host.docker.internal:4321;`。
3. **app 监听地址**：pm2 必须 `HOST=0.0.0.0`（见上文），否则容器经 host-gateway 访问 → 502。

### frp 内网穿透（无公网 IP 场景）

内网机器跑 frpc 把流量转发到公网 frps，链路为：

```
访客 ──▶ frps（公网服务器）──隧道──▶ frpc（内网）
                                        └─TCP─▶ nginx（内网, Docker）
```

`frpc.toml` 关键配置（**要让评论 geo 拿到真实 IP，必须加 PROXY protocol**）：

```toml
[[proxies]]
name = "maltose"
type = "tcp"
localIP = "<nginx内网IP>"
localPort = 443
remotePort = 443
transport.proxyProtocolVersion = "v2"   # ← 向 nginx 注入 PROXY 头，透传真实访客 IP（v1/v2 均可，推荐 v2）
```

对应 nginx：

```nginx
server {
    listen       443 ssl proxy_protocol;            # 解析 frp 注入的 PROXY 头
    server_name  dev.styunlen.cn;
    location / {
        proxy_set_header Host                $http_host;
        proxy_set_header X-Forwarded-Proto   https;
        proxy_set_header X-Forwarded-Host    $http_host;              # 评论 geo 必需（见 FAQ）
        proxy_set_header X-Real-IP           $proxy_protocol_addr;
        proxy_set_header X-Forwarded-For     $proxy_protocol_addr;
        proxy_pass http://host.docker.internal:4321;
    }
}
```

> **排障**：新评论 geo 为空、IP 显示内网/容器地址 → 逐跳核对链路，详见 [FAQ 评论 IP 链路](./faq/comment-ip-chain.md)。

### 套 CDN（EdgeOne 等）

站点前面套 CDN 时，nginx 看到的 `$remote_addr` 是 CDN 节点 IP，真实访客 IP 在 CDN 的回源头里（EdgeOne 用 `EO-Connecting-IP`）。用 nginx `realip` 模块取真实 IP：

```nginx
# http 块（建议单独文件 include，内容由脚本从 EdgeOne 官方 API 同步）
set_real_ip_from <EdgeOne节点IPv4段>;
# …IPv4/v6 全段…
real_ip_header EO-Connecting-IP;         # EdgeOne 场景的关键指令
```

- **必须配 `set_real_ip_from`** 限定只信任 EdgeOne 节点 IP，否则任何人都能伪造 `EO-Connecting-IP` 头。
- EdgeOne 节点 IP 段每日变化，官方提供公开 API（`https://api.edgeone.ai/ips?version=v4|v6`）拉取，建议 cron 每日同步 + reload nginx（脚本见 [FAQ 场景三](./faq/comment-ip-chain.md#场景三套-cdn)）。
- 其他 CDN 原理相同，换对应回源头即可（Cloudflare `CF-Connecting-IP`、阿里云 `Ali-CDN-Real-IP` 等）。

## 三、Astro 信任转发头

`astro.config.mjs` 的 `security.allowedDomains` 决定 Node adapter 是否信任 `X-Forwarded-For`/`X-Forwarded-Host`（从而让 `Astro.clientAddress` 返回真实访客 IP，用于评论 geo、OTP 限流等）：

```js
security: {
  allowedDomains: [
    { hostname: "dev.styunlen.cn", protocol: "https" },
    { hostname: "styunlen.cn", protocol: "https" },
    { hostname: "localhost", protocol: "http" },
  ],
},
```

- 必须包含所有访问域名（`https`）和本地开发（`http`）。
- 别用 `server.allowedHosts` 替代——那是 dev-server 的 Host 白名单，与生产 XFF 信任无关。

## 四、WordPress 主题

`wordpress-theme/` 是独立 WP 主题（「纯函数」式扩展），**不随 Astro CI 部署**，需手动同步到 WP 服务器（`wp-content/themes/` 下）。

要点：
- `functions.php`：`pre_comment_user_ip` 信任 `X-Forwarded-For`（评论真实 IP 必需）；注册各自定义字段。
- `includes/class-comment-geo-field.php`：`Comment.commentGeo` 字段，服务端用 `MaltoseIpResolver` 把 `comment_author_IP` 解析成 country/province（只暴露国家/省份，不暴露原始 IP）。
- `includes/class-signature-verifier.php`：校验 Astro `/api/graphql-proxy` 的请求签名（`WP_GRAPHQL_SECRET_KEY`）。

## 五、CI/CD（GitHub Actions）

push 触发自动部署（ADR-0033），见 `.github/workflows/deploy-{production,staging}.yml`：
- `develop` → staging（自动）；`main` → production（可在 GitHub environment 配人工批准）。
- 流程：`pnpm test` → `pnpm build` → rsync 到服务器（受限 SSH key）→ 服务器 `deploy.sh` 执行 `pnpm install --prod` + `pm2 reload`。
- 服务器一次性配置（受限部署用户、authorized_keys `command=` 白名单、GitHub secrets/variables）详见 [deploy/README.md](../deploy/README.md)。

## 常见坑速查

| 现象 | 原因 | 修复 |
|---|---|---|
| 502 Bad Gateway | pm2 只绑 `::1`，Docker nginx 经 host-gateway 访问不到 | `.env` 设 `HOST=0.0.0.0` |
| 评论 geo 全空 / IP 是容器内网地址 | nginx 缺 `X-Forwarded-Host`，Astro 不信任 XFF | nginx 加 `proxy_set_header X-Forwarded-Host $http_host;` |
| frp 场景 IP 仍是内网 | frpc 隧道没开 PROXY protocol | 加 `transport.proxyProtocolVersion = "v1"` + nginx `listen … proxy_protocol` |
| 套 CDN 后 IP 是 CDN 节点 IP | nginx 没配 realip 模块解析 CDN 回源头 | 加 `real_ip_header EO-Connecting-IP;` + `set_real_ip_from <CDN节点段>` |
| 套 CDN 后 IP 可被伪造 | 没限制 `set_real_ip_from` 白名单 | 用 EdgeOne 官方 IP 列表（API 每日同步） |
| 改了 compose 端口映射不生效 | `nginx -s reload` 不重载端口映射 | `docker compose up -d` recreate 容器 |
