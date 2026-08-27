# FAQ：评论 IP 地理位置链路

评论的 `commentGeo`（国家/省份）依赖一条**多跳 IP 透传链路**。任一环配置不对，IP 就会退化成内网/容器地址，`country/province` 解析为空。

## 完整链路

```
访客浏览器
  └─(HTTPS)─▶ frps（公网服务器）
              └─(隧道)─▶ frpc（内网, 注入 PROXY protocol v1 头）
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
transport.proxyProtocolVersion = "v1"   # ← 关键：frp 向 nginx 注入 PROXY 头
```

> `transport.proxyProtocolVersion = "v1"` 是 frp 0.52+ 的正确写法（旧版 `haproxyProtocol` 已废弃）。v1/v2 均可，nginx `proxy_protocol` 自动识别；v1 文本格式便于 `tcpdump` 抓包调试。

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
3. **nginx 收到的 PROXY 头内容**：在 frpc 机器抓包：

   ```bash
   tcpdump -i any -A -s0 "tcp and host <nginx内网IP> and port 443" | grep PROXY
   ```
   正常应看到 `PROXY TCP4 <真实公网IP> <目的IP> <port> 443`。
4. **frpc 是否在跑且配置已加载**：`ps aux | grep frpc`、`frpc -c frpc.toml` 启动后日志确认隧道 `[maltose] start proxy success`。

## 常见误区

- **看 nginx access.log 判断 IP 会误导**：默认 `log_format` 用的是 `$remote_addr`（TCP 连接源，即 frpc/容器 IP），**不是** `$proxy_protocol_addr`。要看真实透传 IP，得用 `log_format ... '$proxy_protocol_addr …'` 或上面的诊断 location。
- **`server.allowedHosts` 不是信任 XFF 的开关**：那是 dev-server 的 Host 白名单。生产信任 XFF 靠 `security.allowedDomains`。
- **Docker 端口映射不影响 PROXY 头**：端口映射只改 TCP 层源地址，PROXY 头作为 payload 原样透传；`extra_hosts: host.docker.internal:host-gateway` 只影响 nginx→宿主机方向，与 frp→nginx 无关。
