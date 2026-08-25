# Maltose CI/CD 部署与 SSH 安全指南

本文档说明如何为 GitHub Actions 双环境部署（ADR-0033）配置服务器端。

## 0. 反向代理（nginx）— 手动配置参考

使用 `deploy/nginx.conf`（**参考配置，非自动化**——每台服务器环境不同，请手动调整后使用）：
- **纯反向代理**到 pm2（`127.0.0.1:8080`），静态资源由 Astro Node 服务端 serve
  （`staticHeaders: true` 已启用——`/_astro/` hash 资源自动 `immutable` 1 年缓存）
- nginx **不需要知道部署目录**（`PRODUCTION_PATH` 变化无需改 nginx）——这是方案 A 的设计
- 可选：注释块提供 nginx 直服静态（更高性能，但需硬编码 client 目录）
- 含安全头、gzip、WebSocket upgrade 兜底、`client_max_body_size 20m`

**手动启用**（请按你的服务器环境调整 server_name/端口/SSL）：
```bash
sudo cp deploy/nginx.conf /etc/nginx/sites-available/maltose
sudo ln -s /etc/nginx/sites-available/maltose /etc/nginx/sites-enabled/
# 先编辑 server_name 和上游端口，再：
sudo nginx -t && sudo systemctl reload nginx
```

### Docker 化 nginx 的关键点（容器内反代）

若 nginx 跑在 Docker 容器里，需额外处理三点（已在本项目实际部署中验证）：

1. **端口映射**：`docker-compose.yml` 必须显式映射 `80:80` 和 `443:443`，
   否则外部流量进不了容器（bridge 网络默认不暴露端口）。
2. **访问宿主机 app**：容器内 `127.0.0.1:4321` **不是**宿主机——要用
   `host.docker.internal`（需在 compose 加 `extra_hosts: - "host.docker.internal:host-gateway"`），
   nginx 配置写 `proxy_pass http://host.docker.internal:4321;`。
3. **app 监听地址**：pm2 进程默认只绑 `localhost`（IPv6 `::1`），Docker 容器经
   host-gateway（IPv4 `172.17.0.1`）访问不到。**必须**在 `.env` 设 `HOST=0.0.0.0`，
   否则 nginx 报 502 Bad Gateway。

```caddyfile
# nginx.conf 中 dev 站点示例（443 SSL 反代到容器外宿主机上的 pm2）
server {
    listen       443 ssl;
    server_name  dev.styunlen.cn;
    ssl_certificate      /usr/share/nginx/certs/dev.styunlen.cn.crt;
    ssl_certificate_key  /usr/share/nginx/certs/dev.styunlen.cn.key;
    location / {
        proxy_set_header Host $http_host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto https;
        proxy_http_version 1.1;
        proxy_pass http://host.docker.internal:4321;
    }
}
```

> ⚠️ 改端口映射后需 **recreate 容器**（`docker compose up -d`），不是 `nginx -s reload`
> ——reload 只重载配置，不应用端口映射变更。

## 1. 一键配置（推荐）

服务器上运行交互式脚本，自动完成以下全部步骤：

```bash
# 从仓库拷贝 setup.sh 到服务器后运行
bash deploy/setup.sh
```

脚本会交互式引导你：
1. **选择本机角色**（production / staging / both）——决定创建哪些目录和 SSH key
2. 检测发行版并安装 Node 22 + pnpm + pm2 + rsync
   （支持 apt / dnf / pacman / apk；**未知发行版提示手动安装后继续**）
3. 创建受限部署用户 + 目标目录（**自动检测跨用户 home 的 700 权限风险**）
4. 安装 deploy.sh / deploy-gate.sh 到服务器
5. 按角色生成受限 SSH key（authorized_keys 命令白名单）
6. 打印 GitHub secrets/environments 配置清单

> **机器角色**：生产机和开发机分离时，每台机器选自己的角色——
> 生产机选 `production`（只建 prod 目录 + 生成 prod key），开发机选 `staging`
> （只建 dev 目录 + 生成 dev key）；若生产开发同机，选 `both`（全部创建）。

> 以下为手动配置的详细说明（setup.sh 的内部实现），供排查/定制用。

## 1. 服务器一次性配置（手动）

### 1.1 创建受限部署用户（非 root）

```bash
sudo useradd -m -s /bin/bash deploy
# 目录由 GitHub secret（PRODUCTION_PATH/STAGING_PATH）决定 — 先按示例创建，
# 若改 secret 则在此创建对应目录并授权。
sudo -u deploy mkdir -p /var/www/maltose/prod /var/www/maltose/dev
sudo -u deploy mkdir -p /home/deploy/.local/bin/maltose-deploy
```

### 1.2 部署脚本

将仓库 `deploy/` 目录上传到 `~/.local/bin/maltose-deploy/`（XDG 规范 + 子目录隔离）：

```bash
sudo -u deploy cp deploy/env.sh deploy/deploy.sh deploy/deploy-gate.sh /home/deploy/.local/bin/maltose-deploy/
sudo -u deploy chmod +x /home/deploy/.local/bin/maltose-deploy/deploy.sh /home/deploy/.local/bin/maltose-deploy/deploy-gate.sh
```

### 1.3 安装运行时

```bash
# Node 22 + pnpm + pm2（以 deploy 用户安装）
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt-get install -y nodejs
sudo -u deploy npm install -g pnpm pm2
```

### 1.4 受限 SSH key（核心安全机制）

生成**专用**部署 key（与个人 SSH key 完全隔离）：

```bash
ssh-keygen -t ed25519 -C "maltose-ci-deploy" -f ~/.ssh/maltose_deploy
```

将**公钥**安装到 deploy 用户的 `authorized_keys`，**加上 `command=` 白名单**：

```bash
sudo -u deploy mkdir -p ~deploy/.ssh
cat ~/.ssh/maltose_deploy.pub | sudo tee -a ~deploy/.ssh/authorized_keys
```

然后在 `authorized_keys` 这一行前加上限制前缀：

```
command="/home/deploy/.local/bin/maltose-deploy/deploy-gate.sh",no-port-forwarding,no-agent-forwarding,no-X11-forwarding ssh-ed25519 AAAA... maltose-ci-deploy
```

**效果**：这个 key 无论客户端发什么命令，OpenSSH 都强制运行 `deploy-gate.sh`——它只接受
`rsync ...`（放行 CI 文件上传）和 `deploy <env> <target-dir>`（触发部署）两个白名单操作。
**即使 key 泄露，攻击者也无法打开 shell、无法执行任意命令。**

> **部署目录配置**：目录**以 GitHub secret 为准**（方案 2，ADR-0033）。workflow 的
> rsync 目标 = `PRODUCTION_PATH`/`STAGING_PATH` secret，并把同一路径传给服务器
> `deploy <env> <path>`。服务器脚本在**该精确目录**执行 `pnpm install` + `pm2 reload`。
> **改 GitHub variable 即可切换部署目录**，无需碰服务器。deploy-gate 校验路径为绝对路径
> 且无 `..` 穿越；目录由 deploy 用户权限（非 root）兜底。

## 2. GitHub 配置

### 2.1 GitHub 配置分类（Environment secrets vs variables）

**Secret（敏感值，加密存储、日志脱敏）**：
| Environment | Secret | 值 |
|---|---|---|
| `production` | `PRODUCTION_SSH_KEY` | 生产 key 的**私钥**（setup.sh 打印的第一把）|
| `staging` | `STAGING_SSH_KEY` | 开发 key 的**私钥**（setup.sh 打印的第二把）|

**Variable（非敏感配置，明文可见、可随时核对）**：
| Environment | Variable | 示例 |
|---|---|---|
| `production` | `PRODUCTION_HOST` | `prod.styunlen.cn` |
| `production` | `PRODUCTION_SSH_PORT` | `22`（非默认端口时改为实际值，如 `2222`）|
| `production` | `PRODUCTION_USER` | `deploy` |
| `production` | `PRODUCTION_PATH` | `/var/www/maltose/prod` |
| `staging` | `STAGING_HOST` | `dev.styunlen.cn` |
| `staging` | `STAGING_SSH_PORT` | `22`（非默认端口时改为实际值）|
| `staging` | `STAGING_USER` | `deploy` |
| `staging` | `STAGING_PATH` | `/var/www/maltose/dev` |

> **非默认 SSH 端口**：若生产/开发机的 SSH 端口不是 22（如 `2222`、`22022`），
> 在对应环境的 **variable** `PRODUCTION_SSH_PORT` / `STAGING_SSH_PORT` 设置实际端口，
> workflow 自动使用（默认 22）。

> **开发机 ≠ 生产机**：两台机器各自跑一次 `setup.sh`（各自生成/安装 key 到各自
> 的 authorized_keys）。私钥分别存入对应环境的 **secret**（隔离互不影响）；
> host/path/user 存对应环境的 **variable**（非敏感，便于核对）。

### 2.2 Environment secrets（环境级，可配置部署地址）

**Settings → Environments** 创建 `production` 和 `staging` 两个环境：

| Environment | Secret | 示例 |
|---|---|---|
| `staging` | `STAGING_HOST` | `dev.styunlen.cn` |
| `staging` | `STAGING_PATH` | `/home/deploy/maltose/staging` |
| `staging` | `STAGING_USER` | `deploy` |
| `production` | `PRODUCTION_HOST` | `styunlen.cn` |
| `production` | `PRODUCTION_PATH` | `/home/deploy/maltose/production` |
| `production` | `PRODUCTION_USER` | `deploy` |

**改环境 secret 即可切换部署目标**（不同服务器/不同目录）。

### 2.3 生产人工批准（可选）

Settings → Environments → `production` → **Deployment branches**（限制 `main`）
+ **Required reviewers**（勾选需要批准的人）。开启后 main push 会暂停，需人工批准才部署。

## 3. SSH 风险与缓解（回答"权限过高"问题）

| 风险 | 缓解（本方案） |
|---|---|
| key 泄露 → 任意命令 | `command=` 白名单，只能执行 deploy-gate.sh |
| key 泄露 → 开 shell | `no-agent-forwarding` + 无 TTY + command 替换，无法交互 |
| 权限过大 | 专用 `deploy` 非 root 用户，仅项目目录可写 |
| 生产误部署 | GitHub environment + 可选 required reviewers |
| 横向移动 | 部署用户无 sudo，home 受限 |

**残余风险**：rsync 路径由客户端驱动（deploy-gate 放行 `rsync*` 后无法完全限制写目录）——靠 deploy 用户 home 权限兜底；若需更强，可后续加 `rrsync`（rsync 专用沙箱）或 `restricted rsync` wrapper。

## 4. 手动验证

```bash
# 测试白名单：任何命令都被替换
ssh -i ~/.ssh/maltose_deploy deploy@styunlen.cn "rm -rf /"   # 应被拒绝，只执行 gate

# 触发部署（目录必须与 GitHub secret 一致）
ssh -i ~/.ssh/maltose_deploy deploy@styunlen.cn deploy production /var/www/maltose/prod
```

> 服务器上必须先创建目标目录（`sudo -u deploy mkdir -p <PRODUCTION_PATH>`），
> 否则 deploy.sh 会报 "target dir missing"。

## 5. 部署到其他用户目录（如 /home/styunlen/...）

**可以，但不推荐**（建议 `/var/www/maltose` 这类独立目录）。若要部署到
`/home/styunlen/docker/nginx/html` 这类其他用户 home 下的路径，需处理两个权限障碍：

1. **父目录 700**：`/home/styunlen` 默认 `drwx------`，deploy 用户无法穿越。
   放行进入（不给列表权限）：
   ```bash
   sudo chmod 711 /home/styunlen
   ```
2. **目录属主**：目标目录需 deploy 用户可写：
   ```bash
   sudo chown -R deploy:deploy /home/styunlen/docker/nginx/html
   # 若 nginx 需读取：加 www-data 组读权限
   sudo chmod -R 775 /home/styunlen/docker/nginx/html
   sudo usermod -aG www-data deploy   # 可选
   ```

`setup.sh` 会自动检测此类跨用户路径并提示这些操作。

## 6. 工具链 PATH 引导（nvm / fnm / volta / asdf / 系统级）

SSH `authorized_keys` 的 `command=` 触发的是**非交互 shell**——PATH 是系统默认，
**不会加载** `.bashrc` / `.zshrc` / `.profile`。因此用 nvm 等版本管理器安装的
node/pm2 在部署时可能报 `pm2: command not found`（exit 127）。

`deploy/env.sh`（随脚本一起部署）自动解决：它在运行 `pnpm`/`pm2` 前**探测常见
工具链位置**并加入 PATH：

```bash
# nvm 多版本选择顺序：
#   1. ~/.nvm/alias/default 存在 → 遵循用户 default 别名
#      （内容为 vX.Y.Z / 部分版本如 18 / 隐式别名 node / system）
#   2. 无 default → 按版本号取最新已装（v26 优先于 v18，非字典序）
# 其他工具链探测顺序（第一个含 node 的目录生效）：
#   ~/.local/bin                 # XDG 用户可执行目录
#   ~/.local/share/pnpm/bin      # pnpm 全局 bin（pnpm add -g 装的 pm2 在这!）
#   ~/.volta/bin                 # volta
#   ~/.fnm                       # fnm
#   ~/.asdf/shims                # asdf
#   /usr/local/bin               # 系统级
# 之后按 pnpm 官方默认值推导全局 bin（pnpm 11: <home>/bin, home 依次取
#   $PNPM_HOME → $XDG_DATA_HOME/pnpm → ~/.local/share/pnpm）
```

> **pm2 用 `pnpm add -g` 安装的服务器**：pm2 的 shim 在 pnpm 全局 bin 目录
> （pnpm 10 为 `~/.local/share/pnpm`，pnpm 11 为 `~/.local/share/pnpm/bin`），
> **不在** node 的 bin 目录里。env.sh 按 pnpm 官方默认值自动推导该位置
> （显式设置了 `global-bin-dir` 时优先用配置值）。

- **零配置**：上述任一工具链安装方式都能自动找到；nvm 多版本自动取 default 或最新
- **强制覆盖**：设置环境变量 `DEPLOY_TOOLCHAIN_PATH=/path/to/bin` 可跳过探测
  （校验该路径下有可执行 `node`；若路径无效，打印警告并自动回退到探测）
- **不修改任何 shell 配置**：`.bashrc`/`.zshrc`/`.profile` 均无需改动
- **调试**：设置 `DEPLOY_DEBUG=1`（可写在 `authorized_keys` 的 `command=` 前缀）时，
  env.sh 在 stderr 打印 node/pnpm/pm2 的解析结果与最终 PATH，并追加
  `env-debug.log` 到部署脚本同目录——部署失败时把这个文件发给我们即可定位

> 若你的 node/pm2 安装在上述列表之外的路径，设置 `DEPLOY_TOOLCHAIN_PATH`
> 或在服务器上把该路径加入 `authorized_keys` 的 `command=` 前缀。
