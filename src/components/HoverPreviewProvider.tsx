"use client";

// 内链悬浮预览卡（ADR-0025）。文档级事件委托（与 ExternalLinkGuard 同款模式），
// 覆盖正文中 dangerouslySetInnerHTML 渲染的链接；仅在具备悬停能力的指针设备上
// （(hover: hover) and (pointer: fine)）生效。静默加载：数据到手才淡入，鼠标已
// 移开或请求失败则什么都不出现。卡片可点击，从链接滑入卡片不会收起。
import * as React from "react";
import { createPortal } from "react-dom";

interface PreviewConfig {
  enabled: boolean;
  delay: number;
  excerptLen: number;
  wpm: number;
  cacheTtl: number;
  recent: number;
}

interface RecentPost {
  title: string;
  uri: string;
  date?: string;
}

interface PreviewData {
  type: "post" | "page" | "term";
  uri: string;
  title?: string;
  excerpt?: string;
  date?: string;
  commentCount?: number;
  wordCount?: number;
  readingTime?: number;
  thumbnail?: string | null;
  name?: string;
  taxonomyName?: string;
  description?: string;
  count?: number;
  recentPosts?: RecentPost[];
}

const DEFAULT_CONFIG: PreviewConfig = {
  enabled: true,
  delay: 300,
  excerptLen: 120,
  wpm: 400,
  cacheTtl: 300,
  recent: 3,
};

// 触屏等不具备悬停能力的环境无需加载组件逻辑
const useIsomorphicLayoutEffect =
  typeof window !== "undefined" ? React.useLayoutEffect : React.useEffect;

// 只对本站链接（相对路径或同 host）触发，外链交给 ExternalLinkGuard 处理
function isPreviewable(href: string): boolean {
  if (!href || href.startsWith("#")) return false;
  if (/^(mailto|tel|javascript|data):/i.test(href)) return false;
  try {
    const url = new URL(href, window.location.href);
    return url.hostname === window.location.hostname;
  } catch {
    return false;
  }
}

function formatDate(date: string | undefined): string {
  if (!date) return "";
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("zh-CN", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function ContentCard({ data }: { data: PreviewData }) {
  const date = formatDate(data.date);
  return (
    <a href={data.uri} className="block w-80 max-w-full">
      <div className="flex gap-3">
        {data.thumbnail && (
          <img
            src={data.thumbnail}
            alt=""
            loading="lazy"
            className="h-16 w-24 flex-shrink-0 rounded-md bg-muted object-cover"
          />
        )}
        <div className="min-w-0 flex-1">
          <h4 className="line-clamp-2 text-sm font-semibold leading-snug text-foreground hover:text-primary">
            {data.title}
          </h4>
          {data.excerpt && (
            <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-muted-foreground">
              {data.excerpt}
            </p>
          )}
        </div>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[0.7rem] text-muted-foreground">
        {date && <span>{date}</span>}
        {typeof data.wordCount === "number" && <span>{data.wordCount} 字</span>}
        {typeof data.readingTime === "number" && (
          <span>约 {data.readingTime} 分钟</span>
        )}
        {typeof data.commentCount === "number" && (
          <span>{data.commentCount} 条评论</span>
        )}
      </div>
    </a>
  );
}

function TermCard({ data }: { data: PreviewData }) {
  const badge =
    data.taxonomyName === "category"
      ? "分类"
      : data.taxonomyName === "post_tag"
        ? "标签"
        : data.taxonomyName || "归档";
  const recent = data.recentPosts || [];
  return (
    <div className="w-72 max-w-full">
      <div className="flex items-center gap-2">
        <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[0.65rem] font-semibold text-primary">
          {badge}
        </span>
        <a
          href={data.uri}
          className="min-w-0 truncate text-sm font-semibold text-foreground hover:text-primary"
        >
          {data.name}
        </a>
      </div>
      {data.description && (
        <p className="mt-1.5 line-clamp-2 text-xs leading-relaxed text-muted-foreground">
          {data.description}
        </p>
      )}
      <p className="mt-1.5 text-[0.7rem] text-muted-foreground">
        共 {data.count ?? 0} 篇文章
      </p>
      {recent.length > 0 && (
        <div className="mt-2 border-t border-border/60 pt-2">
          <p className="text-[0.65rem] font-semibold tracking-wider text-muted-foreground uppercase">
            最近文章
          </p>
          <ul className="mt-1 flex flex-col gap-1">
            {recent.map((p, i) => (
              <li key={i}>
                <a
                  href={p.uri}
                  className="block truncate text-xs text-foreground/80 hover:text-primary"
                >
                  {p.title}
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

export default function HoverPreviewProvider() {
  const [config, setConfig] = React.useState<PreviewConfig>(DEFAULT_CONFIG);
  const [configLoaded, setConfigLoaded] = React.useState(false);
  const [card, setCard] = React.useState<{
    data: PreviewData;
    rect: DOMRect;
  } | null>(null);
  const [pos, setPos] = React.useState<{ top: number; left: number } | null>(
    null,
  );
  const [visible, setVisible] = React.useState(false);
  const cardRef = React.useRef<HTMLDivElement>(null);
  const timerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const seqRef = React.useRef(0);
  const linkRectRef = React.useRef<DOMRect | null>(null);

  // 媒体查询门槛 + 拉取「阅读增强」配置（失败回退默认值，不影响可用性）
  React.useEffect(() => {
    if (typeof window === "undefined") return;
    if (!window.matchMedia("(hover: hover) and (pointer: fine)").matches) return;
    let cancelled = false;
    fetch("/api/preview-config")
      .then((r) => (r.ok ? r.json() : null))
      .then((cfg) => {
        if (cancelled || !cfg || typeof cfg !== "object") return;
        setConfig({ ...DEFAULT_CONFIG, ...cfg });
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setConfigLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // 数据到手后定位卡片：默认链接下方，放不下翻转上方，贴边时收进视口。
  // 外层容器带四周透明热区（悬停桥），保证从链接滑入卡片不触发收起。
  useIsomorphicLayoutEffect(() => {
    if (!card) return;
    const el = cardRef.current;
    const rect = card.rect;
    if (!el || !rect) return;
    const PAD = 10;
    const MARGIN = 8;
    const outerW = el.offsetWidth;
    const outerH = el.offsetHeight;
    let top = rect.bottom;
    if (top + outerH > window.innerHeight - MARGIN) {
      top = Math.max(MARGIN, rect.top - outerH);
    }
    let left = rect.left - PAD;
    if (left + outerW > window.innerWidth - MARGIN) {
      left = Math.max(MARGIN, window.innerWidth - outerW - MARGIN);
    }
    setPos({ top, left });
    const raf = requestAnimationFrame(() => setVisible(true));
    return () => cancelAnimationFrame(raf);
  }, [card]);

  // 文档级事件委托
  React.useEffect(() => {
    if (!configLoaded || !config.enabled) return;
    if (typeof window === "undefined") return;
    if (!window.matchMedia("(hover: hover) and (pointer: fine)").matches) return;

    const clearTimer = () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };

    const close = () => {
      clearTimer();
      seqRef.current += 1;
      setCard(null);
      setPos(null);
      setVisible(false);
    };

    const loadPreview = async (href: string, seq: number) => {
      try {
        const url = new URL(href, window.location.href);
        const params = new URLSearchParams({ uri: url.pathname + url.search });
        const res = await fetch(`/api/preview?${params.toString()}`);
        if (!res.ok) return;
        const data = await res.json();
        if (seq !== seqRef.current) return;
        const rect = linkRectRef.current;
        if (!rect) return;
        setCard({ data, rect });
      } catch {
        // 静默失败：什么都不出现
      }
    };

    const trigger = (href: string, anchor: HTMLAnchorElement) => {
      clearTimer();
      const seq = ++seqRef.current;
      linkRectRef.current = anchor.getBoundingClientRect();
      timerRef.current = setTimeout(() => {
        void loadPreview(href, seq);
      }, config.delay);
    };

    const onMouseOver = (e: MouseEvent) => {
      const anchor = (e.target as HTMLElement).closest?.("a[href]");
      if (!anchor) return;
      if (cardRef.current?.contains(anchor)) return;
      const href = anchor.getAttribute("href") || "";
      if (!isPreviewable(href)) return;
      trigger(href, anchor as HTMLAnchorElement);
    };

    const onMouseOut = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      const related = e.relatedTarget as Node | null;
      const cardEl = cardRef.current;
      if (cardEl) {
        const targetInCard = cardEl.contains(target);
        const relatedInCard = related ? cardEl.contains(related) : false;
        if (targetInCard && relatedInCard) return;
        if (targetInCard) {
          close();
          return;
        }
        if (relatedInCard) return;
      }
      // 鼠标在同一锚点的子元素间移动（如链接内的 <code>/<img>）不算离开链接——
      // 此时 target 与 related 都在同一个 a[href] 内，不应关闭卡片。
      const anchor = target.closest?.("a[href]");
      if (anchor) {
        const relatedAnchor =
          related && related instanceof Element ? related.closest("a[href]") : null;
        if (relatedAnchor === anchor) return;
        close();
      }
    };

    const onScroll = () => close();
    const onResize = () => close();

    document.addEventListener("mouseover", onMouseOver);
    document.addEventListener("mouseout", onMouseOut);
    document.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onResize);
    return () => {
      clearTimer();
      document.removeEventListener("mouseover", onMouseOver);
      document.removeEventListener("mouseout", onMouseOut);
      document.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onResize);
    };
  }, [configLoaded, config.enabled, config.delay]);

  if (!card || typeof document === "undefined") return null;

  return createPortal(
    <div
      ref={cardRef}
      style={{
        position: "fixed",
        top: pos?.top ?? -9999,
        left: pos?.left ?? -9999,
        zIndex: 9999,
        padding: 10,
        boxSizing: "border-box",
      }}
    >
      <div
        className="rounded-xl border border-border bg-card p-3.5 text-card-foreground shadow-xl"
        style={{
          opacity: visible ? 1 : 0,
          transition: "opacity 120ms ease",
        }}
      >
        {card.data.type === "term" ? (
          <TermCard data={card.data} />
        ) : (
          <ContentCard data={card.data} />
        )}
      </div>
    </div>,
    document.body,
  );
}
