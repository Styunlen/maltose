"use client";

import * as React from "react";
import MinecraftSkinViewer from "minecraft-skin-viewer";
import { Box, Minus } from "lucide-react";

// MC 皮肤 3D 看板娘（见 ADR-0027）
// 用 minecraft-skin-viewer（内部封装 three.js）把 MC 皮肤贴图渲染成方块人，
// 固定浮动在页面右下角，可拖拽、可收起。仅桌面端展示（lg 及以上断点）。
// 皮肤是仓库内静态资源 public/skins/styunlen.png，无运行时外部请求。
const SKIN_URL = "/skins/styunlen.png";

// 拖拽位移阈值：低于该值视为「点击」（收起/展开按钮），高于则视为拖拽
const DRAG_THRESHOLD = 4;

export default function Live2DAvatar() {
  const canvasRef = React.useRef<HTMLCanvasElement>(null);
  const viewerRef = React.useRef<MinecraftSkinViewer | null>(null);
  // 是否展开显示 3D 看板娘（收起时只剩一个小方块按钮）
  const [expanded, setExpanded] = React.useState(true);
  // 相对锚点（right-4 bottom-4）的拖拽偏移量，通过 transform: translate 应用
  const [offset, setOffset] = React.useState({ x: 0, y: 0 });
  const dragRef = React.useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    baseX: number;
    baseY: number;
  } | null>(null);
  // 最近一次按下是否发生了实际拖拽（用于区分 FAB 的点击与拖拽）
  const movedRef = React.useRef(false);

  // 初始化 minecraft-skin-viewer：仅在客户端执行（client:load island）。
  // 收起时卸载 canvas → effect 清理调用 dispose()，释放 WebGL 并停止动画循环。
  React.useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !expanded) return;
    const viewer = new MinecraftSkinViewer({
      canvas,
      skin: SKIN_URL, // 静态资源，浏览器会缓存，收起再展开时命中缓存
      model: "classic",
    });
    viewerRef.current = viewer;
    return () => {
      viewer.dispose();
      viewerRef.current = null;
    };
  }, [expanded]);

  // 开始拖拽：记录按下时的指针坐标与基准偏移
  const beginDrag = (e: React.PointerEvent) => {
    movedRef.current = false;
    dragRef.current = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      baseX: offset.x,
      baseY: offset.y,
    };
    // 指针捕获：拖出元素范围仍能持续收到 move/up 事件
    e.currentTarget.setPointerCapture(e.pointerId);
    e.preventDefault();
  };

  // 展开态头部把手拖拽：排除内部按钮（收起按钮），canvas 按下不经过这里，留给模型旋转
  const onHeaderPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest("button")) return;
    beginDrag(e);
  };

  // 收起态 FAB 拖拽：整块按钮即拖拽把手
  const onFabPointerDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    beginDrag(e);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const drag = dragRef.current;
    if (!drag) return;
    const dx = e.clientX - drag.startX;
    const dy = e.clientY - drag.startY;
    if (Math.abs(dx) > DRAG_THRESHOLD || Math.abs(dy) > DRAG_THRESHOLD) {
      movedRef.current = true;
    }
    // 屏幕 y 轴向下，translate y 需取反以保持「跟随鼠标」
    setOffset({ x: drag.baseX + dx, y: drag.baseY - dy });
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
      className="fixed bottom-4 right-4 z-40 hidden lg:block"
      style={{ transform: `translate(${offset.x}px, ${offset.y}px)` }}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
    >
      {expanded ? (
        <div className="w-44 overflow-hidden rounded-xl border border-border/50 bg-background/80 shadow-xl backdrop-blur transition-all duration-200 hover:border-primary/40">
          {/* 头部：拖拽把手 + 收起按钮 */}
          <div
            className="flex h-8 cursor-grab touch-none select-none items-center justify-between border-b border-border/30 bg-primary/5 px-2 active:cursor-grabbing"
            onPointerDown={onHeaderPointerDown}
          >
            <span className="flex items-center gap-1 text-xs font-semibold tracking-wide text-primary">
              <Box className="size-3.5" />
              MC 看板娘
            </span>
            <button
              onClick={() => setExpanded(false)}
              className="flex size-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-primary/15 hover:text-primary"
              title="收起看板娘"
            >
              <Minus className="size-4" />
            </button>
          </div>
          {/* 3D 方块人画布（canvas 内拖拽 = 旋转模型，由 OrbitControls 接管） */}
          <div className="p-1.5">
            <canvas
              ref={canvasRef}
              className="h-40 w-full cursor-grab rounded-lg bg-transparent active:cursor-grabbing"
            />
          </div>
        </div>
      ) : (
        <button
          onPointerDown={onFabPointerDown}
          onClick={onFabClick}
          className="group flex size-12 cursor-grab touch-none select-none items-center justify-center rounded-xl border border-primary/30 bg-background/80 shadow-lg backdrop-blur transition-all duration-200 active:cursor-grabbing hover:scale-105 hover:border-primary/60 hover:bg-primary/10"
          title="展开 MC 看板娘"
        >
          <Box className="size-6 text-primary transition-transform duration-300 group-hover:rotate-12" />
        </button>
      )}
    </div>
  );
}
