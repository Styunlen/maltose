"use client";

import * as React from "react";
import { IdleAnimation, SkinViewer, SwimAnimation } from "skinview3d";
import { Minus } from "lucide-react";

// MC 皮肤 3D 看板娘（见 ADR-0027）。
// 使用 skinview3d（bs-community，three.js 驱动）——相比早期用的
// minecraft-skin-viewer，skinview3d 公开暴露 playerObject.skin.head 等
// 部件级 BodyPart，眼睛跟随可直接只转头（更自然），且全类型安全（无 hack）。
// 完全无壳：纯 canvas 悬浮在右下角，无边框/背景/圆角。
// 交互层（拖拽把手条 + 收起钮）默认透明，hover 时淡入。
const SKIN_URL = "/skins/styunlen.png";

// 拖拽位移阈值：低于该值视为「点击」，高于则视为拖拽
const DRAG_THRESHOLD = 4;

// 眼睛跟随激活半径（px）：鼠标在以看板娘中心为圆心的半径内时，头部转向
// 鼠标方向；离开半径后缓缓回正。区域实时读取 canvas 位置，因此拖拽移动
// 看板娘后，激活区域随看板娘一起移动。
const FOLLOW_RADIUS = 350;
// 头部最大转向角（弧度）——只转头，头部转动幅度可比整身大
const MAX_YAW = 0.5; // ~28.6°
const MAX_PITCH = 0.3; // ~17.2°
// 回正缓动速度（每帧逼近比例）
const SNAP = 0.08;

// ── idle 呼吸动画 ──────────────────────────────────────────────────────────
// skinview3d 的 IdleAnimation 只做手臂摆动 + 披风微动（无胸腔呼吸），
// 因此通过 IdleAnimation.addAnimation() 叠加自定义呼吸：player 轻微上下
// 浮动 + 缩放模拟胸腔，由库统一驱动进度/速度/暂停（见初始化 effect）。
// 呼吸正弦波：振幅 BREATHE_AMP（position.y）、缩放 1±BREATHE_SCALE。
const BREATHE_SPEED = 2.4; // 呼吸角频率 rad/s（约 0.38Hz，自然节奏）
const BREATHE_AMP = 0.22; // 上下浮动幅度（世界单位）
const BREATHE_SCALE = 0.012; // 缩放幅度（1±1.2%）
// 跟随中呼吸减弱系数：鼠标在激活区（眼睛跟随中）时呼吸幅度/缩放乘以该值
const BREATHE_FOLLOW_FACTOR = 0.5;

// ── 随机游动 ──────────────────────────────────────────────────────────────
// 看板娘有概率随机朝 360° 任一方向游动一段距离（SwimAnimation 划水 + 屏幕位移）。
// 实现：容器 transform 平移（swimOffset），让整个看板娘在屏幕上移动——而非
// 操作模型世界坐标（会破坏相机视角）。游泳方向与模型朝向同步：playerObject
// 用 YXZ Euler 顺序，yaw 扫过长轴朝向（侧身朝游泳方向），tilt 随垂直分量俯仰。
// 游动是「永久位移」：终点累加到 offset（刷新页面才恢复右下角默认位置），
// 且带视口边界碰撞反弹（simulateSwimPath 预计算轨迹），拖拽同样限界。
const SWIM_MIN_INTERVAL = 6000; // 触发判定最小间隔（ms）
const SWIM_MAX_INTERVAL = 12000; // 触发判定最大间隔（ms）
const SWIM_PROB_IDLE = 0.2; // 空闲时游动概率
const SWIM_PROB_FOLLOWING = 0.55; // 眼睛跟随中游动概率（更活跃）
const SWIM_DIST_MIN_RATIO = 0.25; // 游动距离下限（屏幕对角线比例）
const SWIM_DIST_MAX_RATIO = 1.0; // 游动距离上限（屏幕对角线比例）
const SWIM_SPEED = 0.2; // 游动速度（px/ms = 200px/s ≈ 1.2 倍自身高度/秒，从容自然）
const SWIM_STROKES = 3; // 游动期间划水轮数（固定，用于同步 animation.speed）
const SWIM_STROKE_PERIOD = 1.3; // SwimAnimation 一轮划水周期（秒，源码 period）
const TURN_MS = 600; // 转身到侧面耗时
const RETURN_MS = 900; // 游动结束回正耗时（平滑泳回 + 模型归位）
const SWIM_COOLDOWN_MS = 8000; // 一次游动后的冷却
const ROT_SNAP = 0.06; // 模型旋转缓动（转身/朝向跟随更顺滑）

// 计算眼睛跟随的目标旋转角（纯函数，便于单测/验证）：
// 返回 [yaw, pitch]，鼠标在激活半径内按比例映射，半径外为 [0,0]。
// dx/dy 为鼠标相对看板娘中心的偏移（屏幕像素），dist 为偏移距离。
// 作用于 head 的 rotation（只转头）：yaw 绕 Y 水平转向，pitch 绕 X 抬头/低头。
export function computeFollowAngles(
  dx: number,
  dy: number,
  radius = FOLLOW_RADIUS,
): [number, number] {
  const dist = Math.hypot(dx, dy);
  if (dist > radius || dist === 0) return [0, 0];
  const ratio = dist / radius;
  const yaw = Math.sign(dx) * ratio * MAX_YAW;
  const pitch = Math.sign(dy) * ratio * MAX_PITCH;
  return [yaw, pitch];
}

// ── 视口边界与反弹轨迹（纯函数，便于单测）──────────────────────────────────
// 容器 fixed bottom-4 right-4（margin=16px）+ translate(tx, ty)：
//   right = clientWidth − 16 + tx, left = right − w → tx ∈ [16+w−vw, 16]
//   bottom = clientHeight − 16 + ty → ty ∈ [16+h−vh, 16]
export interface Bounds {
  minTx: number;
  maxTx: number;
  minTy: number;
  maxTy: number;
}
export interface Vec {
  x: number;
  y: number;
}

export function getBounds(
  vw: number,
  vh: number,
  w: number,
  h: number,
  margin = 16,
): Bounds {
  return {
    minTx: margin + w - vw,
    maxTx: margin,
    minTy: margin + h - vh,
    maxTy: margin,
  };
}

export function clampToBounds(p: Vec, b: Bounds): Vec {
  return {
    x: Math.min(Math.max(p.x, b.minTx), b.maxTx),
    y: Math.min(Math.max(p.y, b.minTy), b.maxTy),
  };
}

// 预计算游泳反弹轨迹：从 start（translate 空间）沿 angle 方向走 distance 路径
// 长度，越界时按轴反弹。返回相对 start 的折线路径（每 step px 一个采样点）。
// 总路径长度恒等于 distance（像弹球），最终位移精确可累加。
export function simulateSwimPath(
  start: Vec,
  angle: number,
  distance: number,
  b: Bounds,
  step = 1,
): { points: Vec[]; final: Vec } {
  let vx = Math.cos(angle);
  let vy = Math.sin(angle);
  let tx = start.x;
  let ty = start.y;
  const points: Vec[] = [{ x: 0, y: 0 }];
  let remaining = distance;
  while (remaining > 1e-6) {
    const ds = Math.min(step, remaining);
    tx += vx * ds;
    ty += vy * ds;
    if (tx < b.minTx) {
      tx = b.minTx;
      vx = -vx;
    } else if (tx > b.maxTx) {
      tx = b.maxTx;
      vx = -vx;
    }
    if (ty < b.minTy) {
      ty = b.minTy;
      vy = -vy;
    } else if (ty > b.maxTy) {
      ty = b.maxTy;
      vy = -vy;
    }
    points.push({ x: tx - start.x, y: ty - start.y });
    remaining -= ds;
  }
  return { points, final: points[points.length - 1] };
}

export default function Live2DAvatar() {
  const canvasRef = React.useRef<HTMLCanvasElement>(null);
  const rootRef = React.useRef<HTMLDivElement>(null);
  const viewerRef = React.useRef<SkinViewer | null>(null);
  // 是否展开显示 3D 看板娘（收起时只剩一个小方块按钮）
  const [expanded, setExpanded] = React.useState(true);
  // 相对锚点（right-4 bottom-4）的拖拽偏移量，通过 transform: translate 应用
  const [offset, setOffset] = React.useState({ x: 0, y: 0 });
  // offset 的 ref 镜像（游泳 rAF 循环内读，避免闭包过期）
  const offsetRef = React.useRef(offset);
  React.useEffect(() => {
    offsetRef.current = offset;
  }, [offset]);
  // 游动屏幕位移（px）：游动期间叠加到容器 transform，让整个看板娘在屏幕上移动
  const [swimOffset, setSwimOffset] = React.useState({ x: 0, y: 0 });
  const dragRef = React.useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    baseX: number;
    baseY: number;
    width: number;
    height: number;
  } | null>(null);
  const movedRef = React.useRef(false);
  // 眼睛跟随中标记：呼吸动画与 mousemove 共享，跟随中呼吸减弱
  const followingRef = React.useRef(false);
  // 游动状态机（ref，无需重渲染）：phase 推进由独立 rAF 驱动
  const swimRef = React.useRef<{
    phase: "idle" | "turn-in" | "swimming" | "return";
    angle: number; // 游泳方向角（屏幕空间，swimOffset 位移方向）
    dist: number; // 本次游动距离（px，随机）
    swimMs: number; // 本次游动时长（距离/速度）
    path: { points: Vec[]; final: Vec } | null; // 预计算反弹轨迹
    start: number; // 当前阶段开始时间（performance.now）
    cooldownUntil: number;
    idle: IdleAnimation | null; // 呼吸动画实例（游动时切走，返回时切回）
  }>({
    phase: "idle",
    angle: 0,
    dist: 0,
    swimMs: 2000,
    path: null,
    start: 0,
    cooldownUntil: 0,
    idle: null,
  });

  // 初始化 skinview3d：仅在客户端执行（client:load island）。
  // 收起时卸载 canvas → effect 清理调用 dispose()，释放 WebGL 并停止动画循环。
  React.useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !expanded) return;
    const viewer = new SkinViewer({
      canvas,
      skin: SKIN_URL, // 静态资源，浏览器会缓存，收起再展开时命中缓存
      width: 160,
      height: 160,
      pixelRatio: "match-device",
    });
    // 只转头（眼睛跟随），禁用拖拽旋转（OrbitControls）避免与看板娘移动冲突
    viewer.controls.enabled = false;
    // 游泳方向同步：把 playerObject 的 Euler 顺序改为 YXZ（tilt 先、yaw 后），
    // 这样 yaw 能扫过长轴（头-脚）朝向，使角色侧身朝游泳方向游（而非永远朝相机）。
    // 注：animation setter 的 rotation.set(0,0,0) 不重置 order，切换动画不受影响。
    viewer.playerObject.rotation.order = "YXZ";
    // idle 动画：IdleAnimation 提供手臂自然摆动 + 披风微动；叠加自定义呼吸
    // （position.y 浮动 + 缩放模拟胸腔），由库统一驱动进度/速度/暂停。
    // 跟随中（followingRef）呼吸幅度减半，避免转头+浮动叠加杂乱。
    const idle = new IdleAnimation();
    idle.addAnimation((player, progress) => {
      // progress 由库按秒推进（speed=1 时 progress≈elapsed 秒），
      // 用 BREATHE_SPEED 控制呼吸角频率（rad/s）：progress * BREATHE_SPEED 即相位。
      const t = progress * BREATHE_SPEED;
      const following = followingRef.current;
      const amp = following ? BREATHE_AMP * BREATHE_FOLLOW_FACTOR : BREATHE_AMP;
      const scale = following ? BREATHE_SCALE * BREATHE_FOLLOW_FACTOR : BREATHE_SCALE;
      player.position.y = Math.sin(t) * amp;
      player.scale.setScalar(1 + Math.sin(t) * scale);
    });
    viewer.animation = idle;
    // 保存 idle 实例供游动状态机切换（游动时切走、返回时切回）
    swimRef.current.idle = idle;
    viewerRef.current = viewer;
    return () => {
      viewer.dispose();
      viewerRef.current = null;
      swimRef.current.idle = null;
      swimRef.current.phase = "idle";
    };
  }, [expanded]);

  // 眼睛跟随：鼠标在「看板娘为中心、半径 FOLLOW_RADIUS」的圆内时，头部转向
  // 鼠标方向（skin.head.rotation），离开圆后缓缓回正。
  // 激活区域实时读取 canvas 的 getBoundingClientRect——拖拽移动看板娘后，
  // 区域随看板娘一起移动。呼吸动画由 IdleAnimation 驱动（见初始化 effect）。
  React.useEffect(() => {
    if (!expanded) return;
    // rAF 循环：持续逼近目标旋转角，实现平滑跟随与回正。
    let raf = 0;
    let targetYaw = 0;
    let targetPitch = 0;
    const step = () => {
      const viewer = viewerRef.current;
      if (!viewer) {
        raf = requestAnimationFrame(step);
        return;
      }
      const head = viewer.playerObject.skin.head;
      // 游动中（turn-in/swimming）头归位看向正前方，不被鼠标跟随覆盖
      // （SwimAnimation 自带低头姿态，跟随会破坏游泳观感）。
      if (swimRef.current.phase !== "idle") {
        head.rotation.y += (0 - head.rotation.y) * SNAP;
        head.rotation.x += (0 - head.rotation.x) * SNAP;
      } else {
        head.rotation.y += (targetYaw - head.rotation.y) * SNAP;
        head.rotation.x += (targetPitch - head.rotation.x) * SNAP;
        // 游动结束后 body 朝向缓缓回正（永久位移后仍正面朝前）
        const body = viewer.playerObject.rotation;
        if (Math.abs(body.y) > 0.001) {
          body.y += (0 - body.y) * ROT_SNAP;
        }
      }
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);

    const onMouseMove = (e: MouseEvent) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      // 看板娘中心（屏幕坐标）——含拖拽 transform 位移后的实际位置
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const dx = e.clientX - cx;
      const dy = e.clientY - cy;
      [targetYaw, targetPitch] = computeFollowAngles(dx, dy);
      // 同步跟随标记给呼吸动画（IdleAnimation 读取以减弱幅度）
      followingRef.current = Math.abs(targetYaw) > 0.01 || Math.abs(targetPitch) > 0.01;
    };
    window.addEventListener("mousemove", onMouseMove);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("mousemove", onMouseMove);
      followingRef.current = false;
    };
  }, [expanded]);

  // 随机游动：定时触发链（随机间隔掷骰子）+ rAF 状态机驱动相位推进。
  // 相位：idle → turn-in(转身到游泳方向) → swimming(沿方向位移) → return(回正)。
  // 动画槽：游泳时切到 fresh SwimAnimation（呼吸暂停），返回时切回 idle。
  React.useEffect(() => {
    if (!expanded) return;
    let raf = 0;
    let timer = 0;
    let lastT = performance.now();

    const startSwim = () => {
      const s = swimRef.current;
      if (s.phase !== "idle") return;
      // 随机 360° 屏幕游泳方向 + 预计算反弹轨迹（量容器尺寸 + 视口边界）
      const angle = Math.random() * Math.PI * 2;
      const root = rootRef.current;
      const vw = document.documentElement.clientWidth;
      const vh = document.documentElement.clientHeight;
      const rect = root?.getBoundingClientRect();
      const w = rect?.width ?? 160;
      const h = rect?.height ?? 160;
      const bounds = getBounds(vw, vh, w, h);
      s.angle = angle;
      // 随机游动距离：屏幕对角线长度的 25%-100%（随分辨率动态调整）
      const diagonal = Math.hypot(vw, vh);
      const ratio = SWIM_DIST_MIN_RATIO + Math.random() * (SWIM_DIST_MAX_RATIO - SWIM_DIST_MIN_RATIO);
      const dist = diagonal * ratio;
      s.dist = dist;
      // 速度恒定：时长 = 距离 / 速度
      s.swimMs = Math.round(dist / SWIM_SPEED);
      // 预计算反弹轨迹（含起点），rAF 循环只按进度采样
      s.path = simulateSwimPath({ x: offsetRef.current.x, y: offsetRef.current.y }, angle, dist, bounds);
      s.phase = "turn-in";
      s.start = performance.now();
      const viewer = viewerRef.current;
      if (!viewer) return;
      // 切到 SwimAnimation：自带下沉 + 前倾 + 划水 + 踢腿。
      // 划水调速：游动期间固定完成 SWIM_STROKES 轮划水，使划水节奏与
      // 容器移动时长同步（progress 增量 = 轮数×周期，speed 缩放之）。
      const swim = new SwimAnimation();
      swim.speed = (SWIM_STROKES * SWIM_STROKE_PERIOD) / (s.swimMs / 1000);
      viewer.animation = swim;
    };

    const step = (now: number) => {
      const dt = Math.min(0.05, (now - lastT) / 1000);
      lastT = now;
      const s = swimRef.current;
      const viewer = viewerRef.current;
      if (s.phase !== "idle" && viewer) {
        // 屏幕位移：驱动 swimOffset state → 容器 transform 平移（整个看板娘在
        // 屏幕上移动）。轨迹为预计算反弹路径（simulateSwimPath），按进度采样。
        const player = viewer.playerObject;
        const elapsed = now - s.start;
        switch (s.phase) {
          case "turn-in": {
            // 转身：ease yaw 到初始游泳方向的侧身朝向（±π/2）。
            // rotation.x 交给 SwimAnimation 的俯冲动画（进入阶段），不抢写。
            const yawTarget = Math.cos(s.angle) >= 0 ? Math.PI / 2 : -Math.PI / 2;
            player.rotation.y += (yawTarget - player.rotation.y) * ROT_SNAP;
            if (elapsed >= TURN_MS) {
              s.phase = "swimming";
              s.start = now;
            }
            break;
          }
          case "swimming": {
            const path = s.path;
            if (!path) {
              s.phase = "idle";
              break;
            }
            // 按 eased 进度采样反弹路径（线性插值相邻采样点）
            const p = Math.min(1, elapsed / s.swimMs);
            const eased = p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;
            const idx = eased * (path.points.length - 1);
            const i = Math.min(Math.floor(idx), path.points.length - 2);
            const frac = idx - i;
            const a = path.points[i];
            const b = path.points[i + 1];
            setSwimOffset({
              x: a.x + (b.x - a.x) * frac,
              y: a.y + (b.y - a.y) * frac,
            });
            // 方向同步（YXZ order）：用当前路径段速度 (vx, vy) 驱动模型朝向。
            // yaw = ±π/2（水平方向决定正负，侧身朝游泳方向），
            // tilt = acos(−vy_norm)（垂直分量 → 俯仰角，角色朝对角方向游）。
            // 反弹时速度方向连续变化，θ 自然跟随——无需 flipSign 手动翻转。
            const vx = b.x - a.x;
            const vy = b.y - a.y;
            const vlen = Math.hypot(vx, vy);
            if (vlen > 1e-6) {
              const vxn = vx / vlen;
              const vyn = vy / vlen;
              const yawTarget = vxn >= 0 ? Math.PI / 2 : -Math.PI / 2;
              const tiltTarget = Math.acos(Math.min(1, Math.max(-1, -vyn)));
              player.rotation.y += (yawTarget - player.rotation.y) * ROT_SNAP;
              player.rotation.x += (tiltTarget - player.rotation.x) * ROT_SNAP;
            }
            if (elapsed >= s.swimMs) {
              // 永久位移：反弹轨迹终点累加到 offset（刷新页面才恢复默认右下角）。
              // 容器定位到新 offset（swimOffset 从 final 归零 = 停终点，无瞬移）。
              setOffset((prev) => ({ x: prev.x + path.final.x, y: prev.y + path.final.y }));
              setSwimOffset({ x: 0, y: 0 });
              s.phase = "return";
              s.start = now;
            }
            break;
          }
          case "return": {
            // 平滑恢复视角：容器已停在新 offset，这里只把模型的侧身/俯仰
            // 姿态缓动归零（yaw/tilt → 0），自然过渡到正常正面视角。
            player.rotation.y += (0 - player.rotation.y) * ROT_SNAP;
            player.rotation.x += (0 - player.rotation.x) * ROT_SNAP;
            if (elapsed >= RETURN_MS) {
              player.rotation.y = 0;
              player.rotation.x = 0;
              s.phase = "idle";
              s.cooldownUntil = now + SWIM_COOLDOWN_MS;
              // 切回 idle：呼吸从 phase 0 恢复
              if (viewerRef.current) viewerRef.current.animation = s.idle;
            }
            break;
          }
        }
      }
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);

    // 触发链：随机间隔后掷骰子，概率取决于跟随/空闲状态
    const scheduleNext = () => {
      const s = swimRef.current;
      const interval = SWIM_MIN_INTERVAL + Math.random() * (SWIM_MAX_INTERVAL - SWIM_MIN_INTERVAL);
      timer = window.setTimeout(() => {
        const now = performance.now();
        // 仅在空闲 + 非拖拽 + 冷却结束 + 非隐藏标签页时判定
        if (
          s.phase === "idle" &&
          !dragRef.current &&
          now >= s.cooldownUntil &&
          !document.hidden
        ) {
          const prob = followingRef.current ? SWIM_PROB_FOLLOWING : SWIM_PROB_IDLE;
          if (Math.random() < prob) startSwim();
        }
        scheduleNext();
      }, interval);
    };
    scheduleNext();

    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(timer);
      // 复位屏幕位移 + 模型朝向，避免收起再展开时残留游动状态；切回 idle 动画
      setSwimOffset({ x: 0, y: 0 });
      const viewer = viewerRef.current;
      if (viewer && !viewer.disposed) {
        viewer.playerObject.rotation.y = 0;
        viewer.animation = swimRef.current.idle;
      }
      swimRef.current.phase = "idle";
    };
  }, [expanded]);

  // 窗口 resize 或展开/收起时，把 offset 重新 clamp 到当前视口边界
  // （容器尺寸随 expanded 变化，窗口缩小后看板娘可能越界）
  const clampOffset = React.useCallback(() => {
    const root = rootRef.current;
    const rect = root?.getBoundingClientRect();
    if (!rect) return;
    const bounds = getBounds(
      document.documentElement.clientWidth,
      document.documentElement.clientHeight,
      rect.width,
      rect.height,
    );
    setOffset((prev) => clampToBounds(prev, bounds));
  }, []);
  React.useEffect(() => {
    clampOffset();
  }, [clampOffset, expanded]);
  React.useEffect(() => {
    window.addEventListener("resize", clampOffset);
    return () => window.removeEventListener("resize", clampOffset);
  }, [clampOffset]);

  // 取消进行中的游动：把当前 swimOffset 提交进 offset，复位状态
  const cancelSwim = () => {
    const s = swimRef.current;
    if (s.phase === "idle") return;
    setOffset((prev) => ({
      x: prev.x + swimOffset.x,
      y: prev.y + swimOffset.y,
    }));
    setSwimOffset({ x: 0, y: 0 });
    s.phase = "idle";
    const viewer = viewerRef.current;
    if (viewer && !viewer.disposed) {
      viewer.playerObject.rotation.y = 0;
      viewer.playerObject.rotation.x = 0;
      viewer.animation = s.idle;
    }
  };

  // 开始拖拽：若在游动则先取消（避免双写 transform），记录基准 + 容器尺寸用于限界
  const beginDrag = (e: React.PointerEvent) => {
    cancelSwim();
    movedRef.current = false;
    const rect = rootRef.current?.getBoundingClientRect();
    dragRef.current = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      baseX: offset.x,
      baseY: offset.y,
      width: rect?.width ?? 160,
      height: rect?.height ?? 160,
    };
    e.currentTarget.setPointerCapture(e.pointerId);
    e.preventDefault();
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const drag = dragRef.current;
    if (!drag) return;
    const dx = e.clientX - drag.startX;
    const dy = e.clientY - drag.startY;
    if (Math.abs(dx) > DRAG_THRESHOLD || Math.abs(dy) > DRAG_THRESHOLD) {
      movedRef.current = true;
    }
    // transform: translate 的 y 正值向下（与屏幕坐标一致），
    // 因此鼠标移动量直接加到基准偏移即可，无需取反。
    // 拖拽限界：clamp 到视口内，避免把看板娘拖出窗口
    const bounds = getBounds(
      document.documentElement.clientWidth,
      document.documentElement.clientHeight,
      drag.width,
      drag.height,
    );
    const clamped = clampToBounds({ x: drag.baseX + dx, y: drag.baseY + dy }, bounds);
    setOffset(clamped);
  };

  const endDrag = () => {
    dragRef.current = null;
  };

  // 收起态 FAB：点击展开，拖拽不触发展开
  const onFabClick = () => {
    if (movedRef.current) return;
    setExpanded(true);
  };

  return (
    <div
      ref={rootRef}
      className="fixed bottom-4 right-4 z-[60] hidden lg:block"
      style={{
        transform: `translate(${offset.x + swimOffset.x}px, ${offset.y + swimOffset.y}px)`,
      }}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
    >
      {expanded ? (
        <div className="group relative">
          <canvas
            ref={canvasRef}
            className="h-40 w-40 cursor-grab rounded-lg bg-transparent active:cursor-grabbing"
          />
          {/* 透明交互层：hover 时淡入显示，平时不可见 */}
          <div className="pointer-events-none absolute inset-0 flex flex-col justify-between opacity-0 transition-opacity duration-200 group-hover:opacity-100">
            {/* 顶部拖拽把手条：透明，按下可移动整个看板娘。
                pointer-events-auto 覆盖父容器的 pointer-events-none，
                否则 hover 显示的把手条无法接收 pointerdown（拖拽失效）。 */}
            <div
              className="pointer-events-auto flex h-8 cursor-grab touch-none select-none items-center justify-end rounded-md bg-primary/10 px-1.5 backdrop-blur-sm"
              onPointerDown={beginDrag}
            >
              <button
                onClick={() => setExpanded(false)}
                className="pointer-events-auto flex size-6 items-center justify-center rounded-md text-primary transition-colors hover:bg-primary/20"
                title="收起看板娘"
              >
                <Minus className="size-4" />
              </button>
            </div>
          </div>
        </div>
      ) : (
        <button
          onPointerDown={beginDrag}
          onClick={onFabClick}
          className="group flex size-12 cursor-grab touch-none select-none items-center justify-center rounded-xl border border-primary/30 bg-background/80 shadow-lg backdrop-blur transition-all duration-200 active:cursor-grabbing hover:scale-105 hover:border-primary/60 hover:bg-primary/10"
          title="展开 MC 看板娘"
        >
          <span className="text-2xl">⛏️</span>
        </button>
      )}
    </div>
  );
}
