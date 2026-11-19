# 术语表 (Glossary) — 首页欢迎横幅（WelcomeBanner）

## WelcomeBanner（欢迎横幅）

首页第一屏的全屏品牌横幅（`src/components/Hero.astro` 中带 `data-maltose-home-hero` 的 `.brand-hero` 区块 + 其后的固定 backdrop）。没有点击门槛；文档从 y=0 开始就在横幅上。横幅高度 H 以一个视口为基准（`100dvh`），页面纵向滚动始终由文档持有。

## 首屏区（banner zone）

滚动位置的开区间 (0, H)：慢速手势可以自由停在任意位置；静止点只有 0（横幅）与 ≥H（内容）。容差 ±16px（`SNAP_EPS`）用于识别两个静止端。

## 速度阈值切页（speed-threshold page switch）

滚轮手势在**首屏区开始**时，按最近约 250ms 的速度窗口判断（至少 2 个事件、80ms 最小时间跨度）：速度 ≥ `1200px/s`（默认，`?snapvelocity=` 可调）就整屏切页——向下 → H，向上 → 0；低于阈值则完全自由滚动，可停在半路。从内容区开始的手势永不切页。触屏暂不接管（移动端将重做 WebApp）。纯决策在 `switchTarget()`（`src/lib/banner-snap.ts`），事件驱动在 `src/scripts/banner-snap.ts`（无轮询）。

## 到顶后再滑（absorb-at-top）

深内容（originY > H + 16）向上的手势在内容顶 H 处被吸收：动量不得穿透进横幅，目标被钳制在 H。到顶后需要**一次新的**向上快速手势（起点在 H 附近）才整屏切回横幅。

## 切页动画（switch completion）

有 Lenis 时 `lenis.scrollTo(target)`：时长按剩余距离缩放（0.3–1.2s）、缓动为「起点速度 = 松手瞬间的 Lenis 速度、终点速度 = 0」的 Hermite 曲线；`prefers-reduced-motion`（无 Lenis）时即时跳转。动画进行中：同向输入被吞掉，反向输入取消并反向；键盘 PgUp/PgDn/Space/箭头仍触发整屏/步进（小步 0.35s）。`?snapfeel=current|ease|fixed` 为临时对比开关。

## 背景轮播（backdrop carousel）

横幅固定 backdrop 内的图片轮播层：**优先**读取运行时 `public/banner-urls.json`（http(s) URL 数组；支持 `{url}`；去重、上限 40；按文件 mtime 缓存，改文件即生效、无需重启/重建；`BANNER_URLS_FILE` 可覆盖路径），为空或不可读时回退到 `src/assets/banner/` 的构建期占位图。每个请求随机打乱顺序、全部轮播，每张约 5.5s、1.2s 交叉淡化（仅 opacity）；图片由访客浏览器直连远程 CDN（`referrerpolicy="no-referrer"`），服务器不转发图片；加载失败的图标记挑过；页签隐藏或横幅滚出视口时暂停；reduced-motion 下保持单张静态图。图片层（z-index -2）上方叠品牌渐变遮罩 veil（z-index -1，~0.68 透明度），效果层在最上。`scripts/bing-wallpapers.mjs` 可从必应 `HPImageArchive` 生成该 JSON。图片层不接收指针事件且 `aria-hidden`。

## Lenis（全站平滑滚动）

参考站同款平滑滚动库（`src/scripts/smooth-scroll.ts`）：全站桌面滚轮平滑（duration 1.2s、默认 easing），触摸保持原生（`syncTouch: false`），`prefers-reduced-motion` 下完全不初始化；实例暴露为 `window.__lenis`，并在 ClientRouter 导航前后 stop/start/resize。内滚容器标注 `data-lenis-prevent`（纵向）或 `data-lenis-prevent-horizontal`（横向）；程序化滚动走 `src/lib/scroll.ts`（优先 `lenis.scrollTo`）。见 ADR-0041。
