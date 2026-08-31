# ADR-0033: Git Flow 双环境 CI/CD（GitHub Actions + rsync + 受限 SSH）

## 状态

已接受

## 日期

2026-08-25

## 背景

项目已用 Git Flow 分支结构（`main` / `develop` / `feature/*`），但**没有任何 CI/CD**。需建立自动化部署：

- `main` 更新 → 部署**生产环境**
- `develop` 更新 → 部署**开发环境**
- 两环境是**不同服务器**（或同服务器不同项目目录/端口），部署地址**可手动配置**
- SSH 秘钥通过 **GitHub Secrets** 添加
- 关注 SSH 权限过高风险，需最小权限模型

**决策前提**（grill 确认）：
1. 文件部署用 **rsync 增量**（非 scp 全量）
2. SSH 安全等级：**受限非 root 用户 + authorized_keys 命令白名单**
3. 开发环境 = **完整独立部署**（非仅 CI 验证）
4. workflow 结构：**双 workflow + 分支条件**
5. 生产是否人工批准：**可手动配置**（GitHub environment 机制）
6. SSH 用户策略：**单部署用户 + 双目录**（开发/生产不同目标目录）
7. 服务器端：**deploy.sh 脚本**（authorized_keys 白名单调用，CI 只传文件）
8. **部署目录以 GitHub secret 为准**（方案 2）：workflow 把 `PRODUCTION_PATH`/`STAGING_PATH` 作为参数传给服务器 deploy 命令，服务器在**该精确目录**执行（非服务器硬编码目录）

## 决策

### 1. 双 workflow + 分支条件

`.github/workflows/`：
- `deploy-production.yml`：`on: push → main` → 生产
- `deploy-staging.yml`：`on: push → develop` → 开发

每个 workflow 内部两阶段：
1. **CI**：`pnpm install → pnpm test → pnpm build`（失败即阻断，不部署）
2. **CD**：rsync 上传 `dist/` + `ecosystem.config.cjs` + `package.json` + `pnpm-lock.yaml` → SSH 触发服务器 `deploy.sh`

### 2. rsync 增量部署（替代 scp）

使用 `easingthemes/ssh-deploy@v5`（封装 rsync-over-SSH）：
- 只传输变更文件（Astro `dist/` 增量），比 scp 全量快一个数量级
- 断点续传、原子性更好

### 3. SSH 最小权限模型

**单部署用户（`deploy`），非 root**，双环境共用：

`~/.ssh/authorized_keys`（命令白名单——**核心安全机制**）：
```
command="/home/deploy/bin/deploy-gate.sh",no-port-forwarding,no-agent-forwarding,no-X11-forwarding ssh-ed25519 AAAA...
```

`deploy-gate.sh` 校验环境 + 目标目录后调用对应 `deploy.sh`。**key 即使泄露也只能执行预定义部署流程，无法开 shell**。

#### 3.1 双 key 分环境（开发机 ≠ 生产机）

支持开发机/生产机为**不同机器**（`PRODUCTION_HOST` ≠ `STAGING_HOST`）：
- **两把独立 key**：`maltose-prod`（→ `PRODUCTION_SSH_KEY`）+ `maltose-dev`（→ `STAGING_SSH_KEY`）
- **环境级 secret**（非仓库级）：生产私钥只进 `production` 环境，开发私钥只进 `staging` 环境——**一台 key 泄露不影响另一台**
- setup.sh 生成两把 key，各自带 skip_or_cover；authorized_keys 按 key comment 精确替换（不误删用户其他 key）
- 每台机器跑一次 setup.sh（各自部署用户/脚本/key）
- workflow 用 `secrets.PRODUCTION_SSH_KEY` / `secrets.STAGING_SSH_KEY`

### 4. 服务器端 deploy.sh

服务器上 `/home/deploy/bin/deploy.sh`（由白名单调用），接收 `<env> <target-dir>`：
1. 校验目标目录存在（生产/开发分开，目录由 GitHub variable 决定）
2. `pnpm install --prod`
3. `pm2 reload <app-name>`（按环境选 app）
4. 健康检查

**pm2 双 app（审查修复）**：`ecosystem.config.cjs` 声明两个 app——
`maltose-production`（PORT 8080）+ `maltose-staging`（PORT 8081），deploy-gate 按
环境设 `APP_NAME="maltose-${ENV_NAME}"`，deploy.sh 启动对应 app：
- **同机部署**：两 app 各占端口，nginx 各配一个 server 块
- **分机部署**：每台只启动自己的 app

CI 的 rsync 只负责**传文件**，服务器脚本负责**安装 + 重启 + 校验**——SSH 命令面最小。

### 5. 可配置部署地址（Environment secrets + variables）

**配置分类原则**：SSH key 是**敏感值 → secret**（加密存储、日志脱敏）；host/path/user
是**非敏感配置 → variable**（明文可见、便于核对）。改配置即可切换服务器：

**Secret（环境级）**：
| Secret | 用途 |
|---|---|
| `PRODUCTION_SSH_KEY` | 生产 key 私钥（CI 专用，受限）|
| `STAGING_SSH_KEY` | 开发 key 私钥（CI 专用，受限）|

**Variable（环境级）**：
| Variable | 用途 |
|---|---|
| `PRODUCTION_HOST` / `STAGING_HOST` | 服务器地址 |
| `PRODUCTION_SSH_PORT` / `STAGING_SSH_PORT` | SSH 端口（默认 22；非默认如 2222 时设置）|
| `PRODUCTION_PATH` / `STAGING_PATH` | 目标目录（同用户双目录）|
| `PRODUCTION_USER` / `STAGING_USER` | 部署用户（默认 deploy）|

生产 workflow 使用 GitHub **environment**（`production`），`environment:` 触发 protection rules——可在 GitHub 设置里手动开启 **required reviewers**（人工批准）或保持自动。

#### 5.1 部署目录可配置性（方案 2：以 GitHub variable 为准）

**目录的唯一事实源 = GitHub environment variable**。配置链：

```
GitHub variable (PRODUCTION_PATH / STAGING_PATH)
  → workflow rsync TARGET 用同一值上传
  → SCRIPT 传 "deploy <env> <path>" 给服务器
  → deploy-gate.sh 解析 + 校验（绝对路径 + 防 `..` 穿越）
  → deploy.sh <env> <path> cd 到该目录执行
```

- **改 GitHub variable 即可切换部署目录**，无需碰服务器
- deploy-gate 路径校验：必须绝对路径、无 `..` 穿越；敏感路径（如 `/etc`）由 deploy 非 root 用户权限兜底
- 服务器需预创建目标目录（否则 deploy.sh 报 "target dir missing"）

#### 5.2 一键配置脚本 setup.sh（交互式确认，不静默）

`deploy/setup.sh` 将手动配置步骤封装为交互式一键脚本，避免用户手工执行大量命令：

**交互确认原则（关键设计）**：脚本**先逐个检查依赖存在性，缺失时提示确认才安装，绝不静默安装**：
1. 逐个检查 `node` / `pnpm` / `pm2` / `rsync`，报告各自 present/missing
2. 缺 `rsync` 或 `node` → 提示 `Install Node.js + rsync via <pkg-mgr> (needs sudo)?`，确认才装
3. 缺 `pnpm`/`pm2` 且 node 已装 → 提示 `Install pnpm + pm2 via npm (needs sudo)?`，确认才装
4. 所有安装操作（创建用户/目录/SSH key）均有 yesno 确认

**分层安装依据**：`rsync`/`node` 是发行版包（apt/dnf/pacman/apk），`pnpm`/`pm2` 是 npm 包——
用 `need_distro` 精确判断缺失项走对应安装路径（修复了"仅 rsync 缺失却重装 node"的 bug）。

**发行版支持**：apt（Debian/Ubuntu）、dnf（Fedora/RHEL）、pacman（Arch/Manjaro）、
apk（Alpine）；**未知发行版提示手动安装依赖后继续**（不硬编码、不静默）。

**机器角色选择（生产机/开发机分离或同机）**：脚本先问 `This machine serves —
production, staging, or both?`，按角色只创建/生成对应项：

| 角色 | 目录 | SSH key |
|---|---|---|
| `production` | 仅 prod | 仅 `maltose_prod` |
| `staging` | 仅 dev | 仅 `maltose_dev` |
| `both` | prod + dev | 两把 |

- **分离部署**：生产机选 `production`，开发机选 `staging`，各自只生成自己的 key
- **同机部署**：选 `both`，全部创建
- 兼容两种拓扑，且每台机器只生成它实际需要的 key（最小权限）

**脚本流程**：
```
选择机器角色 → 检测发行版 → 逐个检查依赖 → 提示安装缺失项 → 创建 deploy 用户
  → 按角色创建目标目录（自动检测跨用户 home 700 权限风险）
  → 安装 deploy.sh / deploy-gate.sh → 按角色生成受限 SSH key
  → 打印 GitHub secrets/environments 配置清单
```

**nginx 不纳入**：见第 6 节（环境差异大，作为手动参考）。

### 6. nginx 反向代理（手动配置参考，非自动化）

`deploy/nginx.conf` 提供**推荐参考配置**，但**不纳入 setup.sh 自动化**——每台服务器
的部署环境不一致（发行版、nginx 版本、SSL 方式、端口习惯），自动化安装易造成困扰。

**方案 A（采用）：纯反向代理，静态资源由 Astro Node 服务端 serve**
- `astro.config.mjs` 启用 `node({ staticHeaders: true })`：`/_astro/` hash 资源
  自动 `Cache-Control: public, max-age=31536000, immutable`（1 年缓存）
- nginx **不需要知道部署目录**——`PRODUCTION_PATH` 变化无需改 nginx（与方案 2 契合）
- nginx 仅负责：安全头、gzip、WebSocket upgrade 兜底、`client_max_body_size`、TLS
- 配置含 `server_name`/端口/SSL 的可调项 + 注释块提供方案 B（nginx 直服静态）

**为什么 nginx 不自动化**：`setup.sh` 面向多发行版/多环境，nginx 部署差异大
（sites-available 路径、apt/dnf/pacman 包名、systemd/init 服务名均不同），
自动化安装会引入大量条件分支且无法覆盖用户的自定义拓扑；作为手动参考文档更稳妥。

## 影响

- 新增：`.github/workflows/deploy-production.yml`、`deploy-staging.yml`
- 新增：`deploy/` 目录（服务器脚本模板 + nginx 参考配置 + 安全说明）
- 修改：`astro.config.mjs`（`staticHeaders: true`——静态资源 immutable 缓存）
- 修改：`ecosystem.config.cjs`（双 app：`maltose-production`:8080 + `maltose-staging`:8081）
- 新增：`docs/adr/0033-...md`（本文档）
- 部署：CI 失败阻断、main 仅生产、develop 仅开发
- 安全：SSH key 命令白名单 + 非 root 用户 + 环境隔离 + sendEmailOtp per-IP 限流 + verifyEmailOtp 失败计数
- 不改变：应用代码

## 备选方案

- **scp 全量**：简单但全量传输慢；弃
- **服务器 git pull + 自建**：服务器需完整构建环境，CI 无法保证构建一致性；弃
- **部署目录以服务器配置为准**（方案 1）：目录定义在服务器 `deploy.conf`，改目录需 SSH 上服务器；与"部署地址手动配置在 GitHub"的需求不符，弃
- **完整 SSH 加固**（双 key 分环境 + IP 白名单）：更安全但配置复杂；单用户双目录 + 命令白名单已满足需求，作为后续演进
- **单 workflow matrix**：代码复用多但生产批准逻辑绕；双 workflow 更清晰

## Update 2026-08-31: Build-artifact cleanup

### Context

Each CI run uploaded a `dist` artifact that the deploy job downloaded but never
deleted. After repeated pushes the repository held 34 artifacts (~170 MB, all
`expired=false`); GitHub bills artifact storage at $0.25/GB-month above the free
quota, so the accumulation cost money indefinitely.

### Decisions

- **Upload with `retention-days: 1`** (both deploy workflows): an artifact is
  only a delivery vehicle between the CI and deploy jobs; one day of retention
  is a safety net, not a feature.
- **Delete after download**: the CI job exposes the uploaded `artifact-id` via
  job `outputs`; the deploy job calls the GitHub REST API
  (`DELETE /repos/{owner}/{repo}/actions/artifacts/{id}`) right after
  downloading, with `permissions: actions: write` on the deploy job.
  Official API — no third-party action.
- **Manual cleanup workflow** (`.github/workflows/cleanup-artifacts.yml`):
  `workflow_dispatch` (with a `keep` input, default 0 = delete all) plus a
  weekly `schedule` cron as a safety net. Uses `gh api --paginate` + `jq` to
  list newest-first and delete everything older than the newest `keep`.

### Consequence

- A successful deploy frees its artifact immediately; a failed delete still
  expires it within 24 h via retention-days. Storage stays near zero.
- The cleanup workflow can reclaim space manually or weekly without editing
  deploy configs.

## 参考文献

- ADR-0032（pm2 可插拔缓存后端，ecosystem.config.cjs 复用）
- GitHub Actions 官方文档（`push` 触发器、environment protection、secrets）
- easingthemes/ssh-deploy（rsync-over-SSH action）
- OpenSSH `authorized_keys` `command=` 选项（强制命令白名单）
