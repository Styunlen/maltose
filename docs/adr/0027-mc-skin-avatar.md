# ADR-0027: MC 皮肤 3D 看板娘（Minecraft Skin 3D Avatar）

## 状态

已接受

## 日期

2026-08-16

## 背景

需要一个网页右下角浮动「看板娘」，展示用户 Styunlen 的 Minecraft 皮肤 3D 立绘。

**关键澄清**：Minecraft 皮肤是 64×64 平面 PNG 贴图，不是 Live2D `.moc3` 模型。没有成熟的「MC 皮肤 → Live2D 模型」自动转换工具，手工建模成本高。经确认，预期效果是 **MC 皮肤 3D 方块立绘**（非会眨眼的 Live2D）——用 three.js 把皮肤贴图直接贴到方块人几何体上。

## 决策

### 1. 渲染：minecraft-skin-viewer 库

使用开源库 `minecraft-skin-viewer`（npm 包），封装了 MC 方块人 3D 渲染：
- 头（8×8×8）+ 身体/手臂/腿（BoxGeometry + 皮肤贴图 UV 映射）。
- 皮肤纹理直接可用，零格式转换。
- 内置旋转/呼吸浮动动画，支持鼠标交互。

### 2. 皮肤获取：静态资源入库

下载 Styunlen 的 MC 皮肤 PNG（Mojang API：`https://minotar.net/skin/Styunlen` 或 sessionserver），提交到仓库静态资源（如 `public/skins/styunlen.png`）。

- 优点：零运行时外部依赖（无跨域/限流/可用性风险），加载最快。
- 皮肤更新：手动重新下载替换（低频）。

### 3. 展示形态：右下角浮动看板娘

- 固定定位（右下角），可拖拽、可收起（点击隐藏/显示）。
- 挂载位置：LayoutShell（与 ExternalLinkGuard 并列的全局组件）。
- 仅桌面端展示（窄屏隐藏，避免遮挡内容）。

### 4. 组件结构

- `Live2DAvatar.tsx`（React 或 Vue island，`client:load`）——初始化 minecraft-skin-viewer，管理拖拽/收起状态。
- 皮肤资源从 `/skins/styunlen.png` 加载。
- 样式：半透明底、悬停微动，与站点 primary 绿色主题协调。

### 5. 配置

- 简单开关（`maltose_avatar_enabled`，默认开启）可放入主题选项「阅读增强」section（与 ADR-0025 共享），或 Astro 侧常量。倾向后者（看板娘属展示层，非内容功能）。

## 影响

- 新增：`src/components/Live2DAvatar.tsx`（或 .vue）、`public/skins/styunlen.png`。
- 修改：`src/layouts/LayoutShell.tsx`（挂载组件）、`package.json`（+ minecraft-skin-viewer、three）。
- 依赖：`minecraft-skin-viewer`（内含 three.js）。

## 备选方案

- **oh-my-live2d + .moc3 模型**：真正的 Live2D（眨眼/说话），但 Styunlen 皮肤无法直接转 .moc3，只能近似风格模型，弃。
- **PIXI.Live2D**：渲染器更底层，模型格式问题相同，弃。
- **手写 three.js**：完全可控但需处理 MC 皮肤左右臂/腿翻转等细节，工作量大于用库，弃。
- **前端直连 minotar.net**：跨域/可用性风险，弃。

## 参考文献

- minecraft-skin-viewer（npm）
- Mojang Skin API（minotar.net / sessionserver）
- ADR-0022（LayoutShell 全局组件挂载先例）
