import * as React from "react";
import { LAZY_PLACEHOLDER } from "@/lib/lazy";

interface LazyImageProps
  extends Omit<
    React.ImgHTMLAttributes<HTMLImageElement>,
    "src" | "srcSet" | "loading" | "className"
  > {
  src: string;
  srcSet?: string;
  className?: string;
}

// React 内自建懒加载：SSR 输出与服务端完全一致的占位 img（src=占位 SVG、
// data-src=真实图），客户端用 IntersectionObserver 在进入视口时替换 src。
// 为什么自建：vanilla-lazyload 会在 React hydration 前修改 img 的
// src/class/data-ll-status，导致 hydration mismatch（见 ADR/记录）。React
// 组件自己管理 DOM 就能保证 SSR/客户端 HTML 一致。
export default function LazyImage({
  src,
  srcSet,
  className,
  alt = "",
  ...rest
}: LazyImageProps) {
  const ref = React.useRef<HTMLImageElement>(null);
  const [loaded, setLoaded] = React.useState(false);

  React.useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === "undefined") {
      setLoaded(true);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setLoaded(true);
            observer.disconnect();
            break;
          }
        }
      },
      { rootMargin: "200px 0px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <img
      ref={ref}
      src={loaded ? src : LAZY_PLACEHOLDER}
      srcSet={loaded ? srcSet : undefined}
      data-src={src}
      alt={alt}
      className={className}
      loading="lazy"
      {...rest}
    />
  );
}
