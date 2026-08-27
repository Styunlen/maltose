# FAQ：评论 IP 地理位置链路

评论的 `commentGeo`（国家/省份）依赖一条**多跳 IP 透传链路**。任一环配置不对，IP 就会退化成内网/容器地址，`country/province` 解析为空。

本文覆盖三种常见拓扑，均以「nginx → Astro → WordPress」为共同后半段：

1. **frp 内网穿透**（默认场景，见 [完整链路](#完整链路) + [各环节必需配置](#各环节必需配置)）
2. **正常公网服务器直连**（nginx 直接对外，无 PROXY 头，见 [场景二：正常服务器直连](#场景二正常服务器直连)）
3. **套 CDN（EdgeOne 等）**（见 [场景三：套 CDN](#场景三套-cdn))

## 完整链路

```
访客浏览器
  └─(HTTPS)─▶ frps（公网服务器）
              └─(隧道)─▶ frpc（内网, 注入 PROXY protocol 头, v1/v2 均可）
                          └─(TCP 443)─▶ nginx（listen ... proxy_protocol, 解析出真实 IP）
                                          └─(HTTP, host.docker.internal:4321)─▶ Astro SSR
                                                                                └─(/api/graphql-proxy)─▶ WordPress（pre_comment_user_ip 信任 XFF）
```

## 各环节必需配置

### 1. frpc 隧道（内网穿透侧）— `frpc.toml`

```toml
[[proxies]]
name = "maltose"
type = "tcp"
localIP = "<nginx内网IP>"
localPort = 443
remotePort = 443
transport.proxyProtocolVersion = "v2"   # ← 关键：frp 向 nginx 注入 PROXY 头（推荐 v2）
```

> `transport.proxyProtocolVersion` 是 frp 0.52+ 的正确写法（旧版 `haproxyProtocol` 已废弃）。取值 `"v1"` / `"v2"` / `""`（留空默认按 **v2** 处理）。nginx 的 `listen ... proxy_protocol` 自动识别 v1/v2，无需按版本改 nginx 配置。

> **v1 vs v2 区别与推荐**：
> - **v1（文本格式）**：形如 `PROXY TCP4 <源IP> <目的IP> <源端口> <目的端口>\r\n`，人类可读，`tcpdump` 抓包一眼可辨——适合排障。缺点：每连接多约 50 字节开销，无法携带额外元数据。
> - **v2（二进制格式）**：紧凑二进制头，开销更小、解析更快，且支持携带 TLS 信息等扩展字段。**frp 默认值即 v2，也是当前推荐版本**。
> - **推荐**：生产环境用 `"v2"`（或直接留空走默认）；仅当需要抓包肉眼排查 PROXY 头时才临时改 `"v1"`。两者对 nginx/Astro/WP 链路无感知差异。

### 2. nginx 反代 — 必须同时满足三点

```nginx
server {
    listen       443 ssl proxy_protocol;          # ① 接收并解析 PROXY 头
    server_name  dev.styunlen.cn;                 # 示例域名，替换为你自己的

    location / {
        proxy_set_header Host                $http_host;
        proxy_set_header X-Forwarded-Proto   https;
        proxy_set_header X-Forwarded-Host    $http_host;   # ② Astro 信任 XFF 的依据（见下节）
        proxy_set_header X-Real-IP           $proxy_protocol_addr;      # ③ 用 PROXY 头里的真实 IP
        proxy_set_header X-Forwarded-For     $proxy_protocol_addr;
        proxy_pass http://host.docker.internal:4321;
    }
}
```

### 3. Astro — `astro.config.mjs`

```js
security: {
  allowedDomains: [
    { hostname: "dev.styunlen.cn", protocol: "https" },
    { hostname: "styunlen.cn", protocol: "https" },
    { hostname: "localhost", protocol: "http" },
  ],
},
```

> 这是 `security.allowedDomains`（Node adapter 的 `createRequest` 用它决定是否信任 XFF）。
> `server.allowedHosts` 只是 dev-server 的 Host 白名单，**与此无关**，别混淆。

### 4. WordPress 主题 — `wordpress-theme/functions.php`

```php
// 信任反向代理设置的 X-Forwarded-For，使 comment_author_IP 记录真实访客 IP
add_filter('pre_comment_user_ip', static function ($ip) {
    $forwarded = isset($_SERVER['HTTP_X_FORWARDED_FOR'])
        ? trim(explode(',', $_SERVER['HTTP_X_FORWARDED_FOR'])[0])
        : '';
    if ($forwarded && filter_var($forwarded, FILTER_VALIDATE_IP)) {
        return $forwarded;
    }
    return $ip;
});
```

## 场景二：正常服务器直连

无 frp、无 CDN，访客直接连到 nginx。此时 nginx 的 `$remote_addr` 就是真实访客 IP，**不需要** PROXY protocol，但**仍需**设置 `X-Forwarded-Host`（Astro 信任 XFF 的依据）与 `X-Forwarded-For`：

```nginx
server {
    listen       443 ssl;
    server_name  styunlen.cn;                     # 示例域名，替换为你自己的

    location / {
        proxy_set_header Host                $http_host;
        proxy_set_header X-Forwarded-Proto   https;
        proxy_set_header X-Forwarded-Host    $http_host;   # Astro 信任 XFF 的依据（见下节）
        proxy_set_header X-Real-IP           $remote_addr;
        proxy_set_header X-Forwarded-For     $proxy_add_x_forwarded_for;
        proxy_pass http://127.0.0.1:8080;               # pm2 Astro
    }
}
```

> 与 frp 场景的唯一差异：**没有 `listen ... proxy_protocol`**（nginx 直接面对真实连接），且 `X-Forwarded-For` 用 `$proxy_add_x_forwarded_for` 保留真实 IP。其余（Astro `allowedDomains`、WP `pre_comment_user_ip`）完全相同。

## 场景三：套 CDN

站点前面套了 CDN（如腾讯云 EdgeOne）时，访客先到 CDN 边缘节点，**CDN 再回源到你的服务器**。此时 nginx 看到的 `$remote_addr` 是 **CDN 节点 IP**，真实访客 IP 由 CDN 放在请求头里回源。

### EdgeOne 回源头

EdgeOne 回源时**默认携带 `EO-Connecting-IP` 头**，值为与 EdgeOne 边缘节点建连的客户端真实 IP（官方文档：`EO-Connecting-IP` 记录与 EdgeOne 建立连接的客户端 IP）。若请求经过代理，则为前序代理 IP。

### nginx 配置（http 块）

用 `realip` 模块把 `$remote_addr` 替换成 `EO-Connecting-IP` 里的真实 IP。**必须用 `set_real_ip_from` 限定只信任来自 EdgeOne 节点的请求**，否则任何人都能伪造该头：

```nginx
# http 块内：EdgeOne 节点 IP 段 + real_ip 规则（建议单独文件 include）
include /etc/nginx/edgeone;
```

`/etc/nginx/edgeone` 内容：

```nginx
#EdgeOne IP addresses（由脚本从官方 API 自动生成，见下）
set_real_ip_from <EdgeOne节点IPv4段1>;
set_real_ip_from <EdgeOne节点IPv4段2>;
# …IPv4 全段…

set_real_ip_from <EdgeOne节点IPv6段1>;
# …IPv6 全段…

real_ip_header EO-Connecting-IP;
```

> **`real_ip_header EO-Connecting-IP;` 是 EdgeOne 场景的关键**：它告诉 nginx 从该请求头取真实客户端 IP 覆盖 `$remote_addr`。有了它，后面的 `X-Forwarded-For` 就会带上真实 IP（`$remote_addr` 已被替换）。

### EdgeOne 节点 IP 自动同步

EdgeOne 的节点 IP 段会变化，官方提供公开 API 拉取，建议用 cron 每日同步并 reload nginx：

```bash
#!/bin/bash
# edgeone-sync-ips.sh — 生成 /etc/nginx/edgeone 并 reload
EDGEONE_FILE_PATH=${1:-/etc/nginx/edgeone}
echo "#EdgeOne" > "$EDGEONE_FILE_PATH"; echo "" >> "$EDGEONE_FILE_PATH";
echo "# - IPv4" >> "$EDGEONE_FILE_PATH";
for i in $(curl -s -L https://api.edgeone.ai/ips?version=v4); do
    echo "set_real_ip_from $i;" >> "$EDGEONE_FILE_PATH";
done
echo "" >> "$EDGEONE_FILE_PATH";
echo "# - IPv6" >> "$EDGEONE_FILE_PATH";
for i in $(curl -s -L https://api.edgeone.ai/ips?version=v6); do
    echo "set_real_ip_from $i;" >> "$EDGEONE_FILE_PATH";
done
echo "" >> "$EDGEONE_FILE_PATH";
echo "real_ip_header EO-Connecting-IP;" >> "$EDGEONE_FILE_PATH";
nginx -t && systemctl reload nginx
```

```cron
# 每日 02:30 同步 EdgeOne IP 段并 reload nginx
30 2 * * * /opt/scripts/edgeone-sync-ips.sh >/dev/null 2>&1
```

### 与 frp 组合

若同时套 CDN **且** 用 frp 内网穿透（CDN → frps → frpc → nginx），两套机制叠加：

- frp 注入的 PROXY 头里的「源 IP」是 **CDN 节点 IP**（frps 看到的是 CDN 回源连接）；
- nginx 先 `listen ... proxy_protocol` 解析 PROXY 头得 CDN 节点 IP；
- 再配 `real_ip_header EO-Connecting-IP` + `set_real_ip_from` 覆盖成真实访客 IP。

```nginx
server {
    listen       443 ssl proxy_protocol;          # 解析 frp PROXY 头 → CDN 节点 IP
    server_name  styunlen.cn;
    real_ip_header EO-Connecting-IP;              # 再取真实访客 IP
    set_real_ip_from <EdgeOne节点IP段>;            # 只信任 EdgeOne 来源
    location / {
        proxy_set_header Host                $http_host;
        proxy_set_header X-Forwarded-Proto   https;
        proxy_set_header X-Forwarded-Host    $http_host;
        proxy_set_header X-Real-IP           $remote_addr;      # 已被 realip 覆盖为真实 IP
        proxy_set_header X-Forwarded-For     $remote_addr;
        proxy_pass http://host.docker.internal:4321;
    }
}
```

> 其他 CDN（Cloudflare `CF-Connecting-IP`、阿里云 CDN `Ali-CDN-Real-IP`、又拍云 `X-Real-IP` 等）原理相同：把 `real_ip_header` 换成对应厂商的回源头即可，`set_real_ip_from` 换成该厂商节点 IP 段。

## 最常见坑：nginx 漏了 `X-Forwarded-Host`

**现象**：frp 和 nginx 的 PROXY protocol 都已配置、`$proxy_protocol_addr` 正确，但新评论 `commentGeo` 仍为 null。

**根因**：Astro Node adapter 的 `createRequest` 计算 `clientAddress` 时，只有满足以下之一才信任 `X-Forwarded-For`：

```js
// dist/server/entry.mjs（Astro 内部逻辑）
const validatedHostname = validateHost(hostHeader, protocol, allowedDomains);           // 用 socket.encrypted 判定协议（nginx→Astro 是明文 http，与 https 条目不匹配 → undefined）
const validatedForwardedHost = validateForwardedHeaders(…, xForwardedHostHeader, …);   // 读 X-Forwarded-Host 头，默认按 https 匹配 allowedDomains
const clientIp = (validatedHostname !== undefined || validatedForwardedHost !== undefined
  ? first(X-Forwarded-For)                                                              // 只有这里才信任 XFF
  : undefined) || req.socket.remoteAddress;                                             // 否则回退 socket 源地址（nginx 容器 IP）
```

- `validatedHostname`：按 `socket.encrypted` 判断协议。nginx→Astro 是**明文 HTTP**，拿到的协议是 `http`，与 `allowedDomains` 里的 `https` 条目**不匹配** → 无效。
- `validatedForwardedHost`：读 **`X-Forwarded-Host`** 头，按默认 `https` 匹配。**nginx 若不转发这个头 → 无效**。

两个都无效时，`clientAddress` 回退到 `req.socket.remoteAddress`——即 nginx 容器的 IP（如 `172.20.x.x` 这类 Docker 内网地址），WP 记录的就是这个内网地址，geo 自然解析为空。

**修复**：在 nginx 的 `location /` 加一行：

```nginx
proxy_set_header X-Forwarded-Host $http_host;
```

改完 `nginx -s reload` 即可，无需动 Astro/WP。

## 排障步骤（从后往前验证）

1. **WP 端实际记录的 IP 是什么**：用 WPGraphQL 查一条新评论的原始 IP。若为内网/容器 IP（如 `172.20.x.x` 这类 Docker 内网地址）→ 链路在后半段断了；若已是公网 IP 但 geo 为空 → 是 `MaltoseIpResolver` 的 CIDR 表未命中。
2. **nginx 是否解析出真实 PROXY 头**：临时加一个诊断 location 输出 `$remote_addr` / `$proxy_protocol_addr`：

   ```nginx
   location /proxydiag {
       default_type text/plain;
       return 200 "remote=$remote_addr proxy_protocol=$proxy_protocol_addr\n";
   }
   ```
   再用 `curl --resolve dev.styunlen.cn:443:127.0.0.1 -k https://dev.styunlen.cn/proxydiag` 或 Python 裸 TCP 发 PROXY 头验证。
3. **nginx 收到的 PROXY 头内容**：在 frpc 机器（或 nginx 与 frpc 之间的链路节点）抓包。按配置的版本，调试方法不同：

   **v1（文本格式）——可直接 grep**：

   ```bash
   tcpdump -i any -A -s0 "tcp and host <nginx内网IP> and port 443" | grep PROXY
   ```

   正常应看到一行文本头：

   ```
   PROXY TCP4 <真实公网IP> <目的IP> <源端口> 443
   ```

   `PROXY TCP4` 后面的第一个 IP 就是 frps 透传下来的真实访客 IP。因为 v1 是明文文本，`-A`（ASCII 打印）即可直接读出，这也是 v1 适合排障的原因。

   **v2（二进制格式）——需用 `-X` 看十六进制**：

   ```bash
   tcpdump -i any -X -s0 "tcp and host <nginx内网IP> and port 443"
   ```

   v2 头以固定 12 字节魔数开头，ASCII 打印是乱码，要看 hex。v2 头结构：12 字节签名（`\x0D\x0A\x0D\x0A\x00\x0D\x0A\x51\x55\x49\x54\x0A`）→ 1 字节版本命令（`\x21`）→ 1 字节协议族 → 2 字节长度 → 紧随的地址块。TCP over IPv4（`0x11`）时地址块为 12 字节：前 4 字节**源 IP**、后 4 字节目的 IP、再 4 字节源/目的端口。抓包看到 `0d 0a 0d 0a 00 0d 0a 51 55 49 54 0a 21` 开头的字节流即为 v2 头，从 `21` 后的地址块读源 IP。

   **不确定版本时**：两种都试，或直接用 nginx 诊断 location（第 2 步）确认 `$proxy_protocol_addr`，不必纠结抓包格式。
4. **frpc 是否在跑且配置已加载**：`ps aux | grep frpc`、`frpc -c frpc.toml` 启动后日志确认隧道 `[maltose] start proxy success`。

## 常见误区

- **看 nginx access.log 判断 IP 会误导**：默认 `log_format` 用的是 `$remote_addr`（TCP 连接源，即 frpc/容器/CDN 节点 IP），**不是** `$proxy_protocol_addr` 或 realip 覆盖后的值。要看真实透传 IP，得用 `log_format ... '$remote_addr …'`（套 CDN 且 realip 生效后 `$remote_addr` 已是真实 IP）或诊断 location。
- **`server.allowedHosts` 不是信任 XFF 的开关**：那是 dev-server 的 Host 白名单。生产信任 XFF 靠 `security.allowedDomains`。
- **Docker 端口映射不影响 PROXY 头**：端口映射只改 TCP 层源地址，PROXY 头作为 payload 原样透传；`extra_hosts: host.docker.internal:host-gateway` 只影响 nginx→宿主机方向，与 frp→nginx 无关。
- **套 CDN 时不能直接用 `X-Forwarded-For` 覆盖 `$remote_addr`**：那是标准 `real_ip` 的做法（`real_ip_header X-Forwarded-For`），但 CDN 厂商各有专用回源头（EdgeOne 用 `EO-Connecting-IP`），且**必须配合 `set_real_ip_from` 白名单**，否则访客可伪造该头。
- **`real_ip_header` 不设 `set_real_ip_from` 就是裸奔**：任何人直接连源站都能伪造 `EO-Connecting-IP` 头冒充任意 IP。要么用 EdgeOne 官方 IP 列表，要么至少限制为 `set_real_ip_from 0.0.0.0/0` 之外的更小范围。
