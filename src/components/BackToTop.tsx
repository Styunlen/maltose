"use client";

import * as React from "react";
import { ArrowUp } from "lucide-react";

// z-[70] 高于看板娘（z-[60]）；桌面端看板娘 h-44 + bottom-4 ≈196px，
// 按钮用 lg:bottom-52（208px）避开，移动端看板娘隐藏、按钮回到底部。
const SHOW_THRESHOLD = 400;

export default function BackToTop() {
  const [visible, setVisible] = React.useState(false);
  // 单例守卫：StrictMode 双调用 effect 时幂等
  const listenerRef = React.useRef<((e: Event) => void) | null>(null);

  React.useEffect(() => {
    if (listenerRef.current) return;
    const onScroll = () => {
      setVisible(window.scrollY > SHOW_THRESHOLD);
    };
    listenerRef.current = onScroll;
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => {
      if (listenerRef.current) {
        window.removeEventListener("scroll", listenerRef.current);
        listenerRef.current = null;
      }
    };
  }, []);

  const handleClick = () => {
    const reduced =
      window.matchMedia &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    window.scrollTo({ top: 0, behavior: reduced ? "auto" : "smooth" });
  };

  return (
    <button
      type="button"
      aria-label="回到顶部"
      onClick={handleClick}
      className={[
        "fixed right-4 bottom-4 z-[70] flex h-10 w-10 items-center justify-center",
        "rounded-full bg-(--primary) text-black",
        "transition-all duration-200 ease-out",
        "hover:-translate-y-0.5 hover:shadow-lg",
        "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none",
        "lg:bottom-52",
        visible
          ? "pointer-events-auto opacity-100"
          : "pointer-events-none opacity-0",
      ].join(" ")}
    >
      <ArrowUp className="size-5" />
    </button>
  );
}
