"use client";

import * as React from "react";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
} from "@/components/animate-ui/radix/sidebar";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/animate-ui/radix/dropdown-menu";
import {
  BadgeCheck,
  Bell,
  ChevronsUpDown,
  CreditCard,
  LogOut,
  MessageSquare,
  Sparkles,
  UserRound,
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { emitter } from "@/lib/mitt";
import dayjs from "dayjs";

interface SidebarRightProps {
  menu?: {
    menuItems: {
      nodes: Array<{ uri: string; url: string; order: number; label: string }>;
    };
  };
  generalSettings?: { title: string; url: string; description: string };
  sidebarData?: {
    posts?: any[];
    tags?: any[];
    comments?: any[];
    categories?: { name: string; uri: string; count: number }[];
    archivePosts?: { date: string }[];
    totalPosts?: number;
    totalComments?: number;
  } | null;
}

import { useAuth } from "@/components/AuthProvider";

function getPageType(pathname?: string): "home" | "article" | "other" | "" {
  // SSR can't see window.location, so the pathname comes from Astro props.
  // Falling back to "" made SSR render the skeleton while the client picked a
  // real sidebar — a hydration mismatch (ul vs div) every page load.
  const path = pathname ?? (typeof window !== "undefined" ? window.location.pathname : "");
  if (!path) return "";
  if (/^(\/?$|\/index\.html$|\/archives\/post-tag\/)/.test(path)) return "home";
  if (path.match(/^\/[^/]+\/[^/]+/)) return "article";
  return "other";
}

/* ─── NavUser ─── */
function NavUser() {
  const { user, loading, login, logout } = useAuth();
  const [isMobile, setIsMobile] = React.useState(false);
  const [wpConnected, setWpConnected] = React.useState<boolean | null>(null);
  const [wpChecking, setWpChecking] = React.useState(true);

  React.useEffect(() => {
    setIsMobile(window.innerWidth < 768);
  }, []);

  React.useEffect(() => {
    fetch("/api/auth/wp-status")
      .then((r) => r.json())
      .then((d) => {
        setWpConnected(d.connected);
        setWpChecking(false);
      })
      .catch(() => {
        setWpConnected(false);
        setWpChecking(false);
      });
  }, []);

  if (loading) {
    return (
      <SidebarMenu>
        <SidebarMenuItem>
          <SidebarMenuButton size="lg" disabled>
            <Skeleton className="size-8 rounded-lg" />
            <div className="grid flex-1 gap-1">
              <Skeleton className="h-3 w-20 rounded" />
              <Skeleton className="h-2.5 w-28 rounded" />
            </div>
          </SidebarMenuButton>
        </SidebarMenuItem>
      </SidebarMenu>
    );
  }

  if (!user) {
    return (
      <SidebarMenu>
        <SidebarMenuItem>
          <SidebarMenuButton
            size="lg"
            onClick={() => login()}
            className="hover:bg-primary/10 hover:text-primary transition-all duration-200 cursor-pointer"
          >
            <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-muted text-muted-foreground">
              <svg
                className="size-4"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
                <circle cx="12" cy="7" r="4" />
              </svg>
            </div>
            <div className="grid flex-1 text-left text-sm leading-tight">
              <span className="truncate font-semibold text-foreground">
                登录
              </span>
              <span className="truncate text-xs text-muted-foreground">
                点击登录你的账号
              </span>
            </div>
          </SidebarMenuButton>
        </SidebarMenuItem>
        <SidebarMenuItem>
          <SidebarMenuButton
            size="sm"
            onClick={() => login()}
            className="justify-center text-xs text-muted-foreground hover:text-primary transition-all duration-200 cursor-pointer"
          >
            还没有账号？注册
          </SidebarMenuButton>
        </SidebarMenuItem>
      </SidebarMenu>
    );
  }

  const userId = user.preferred_username || user.sub;
  const userName = user.name || "";
  const displayEmail = user.email || "";
  const fallback = userId ? userId.charAt(0).toUpperCase() : "U";

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu modal={false}>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton
              size="lg"
              className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
            >
              <Avatar className="h-8 w-8 rounded-lg">
                <AvatarFallback className="rounded-lg bg-primary text-primary-foreground text-sm font-bold">
                  {fallback}
                </AvatarFallback>
              </Avatar>
              <div className="grid flex-1 text-left text-sm leading-tight">
                <span className="truncate font-medium">{userId}</span>
              </div>
              <ChevronsUpDown className="ml-auto size-4" />
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            className="w-(--radix-dropdown-menu-trigger-width) min-w-56 rounded-lg"
            side={isMobile ? "bottom" : "right"}
            align="start"
            sideOffset={4}
          >
            <DropdownMenuLabel className="p-0 font-normal">
              <div className="flex items-center gap-2 px-1 py-1.5 text-left text-sm">
                <Avatar className="h-8 w-8 rounded-lg">
                  <AvatarFallback className="rounded-lg bg-primary text-primary-foreground text-sm font-bold">
                    {fallback}
                  </AvatarFallback>
                </Avatar>
                <div className="grid flex-1 text-left text-sm leading-tight">
                  <span className="truncate font-medium">{userId}</span>
                  {userName && (
                    <span className="truncate text-xs text-muted-foreground">
                      {userName}
                    </span>
                  )}
                  {displayEmail && (
                    <span className="truncate text-xs text-muted-foreground">
                      {displayEmail}
                    </span>
                  )}
                </div>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={() => {
                window.location.href = "/user/comments";
              }}
              className="cursor-pointer"
            >
              <MessageSquare className="size-4" />
              我的评论
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => {
                window.location.href = "/user/profile";
              }}
              className="cursor-pointer"
            >
              <UserRound className="size-4" />
              个人资料
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => {
                window.location.href =
                  "/api/auth/wp-init?returnTo=" +
                  encodeURIComponent(window.location.pathname);
              }}
              className="cursor-pointer"
            >
              <svg
                className="size-4"
                viewBox="0 0 24 24"
                fill="none"
                stroke={wpConnected ? "var(--primary)" : "currentColor"}
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M12 2a10 10 0 1 0 10 10h-2a8 8 0 1 1-8-8V2z" />
                <path d="M12 2v7l3-3-3-3z" />
              </svg>
              {wpChecking
                ? "检查中…"
                : wpConnected
                  ? "✓ WordPress 已连接"
                  : "连接 WordPress 账号"}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={logout} className="cursor-pointer">
              <LogOut />
              退出登录
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}

/* ─── CalendarWidget ─── */
function CalendarWidget() {
  const [today] = React.useState(() => new Date());
  const [currentMonth, setCurrentMonth] = React.useState(
    new Date(today.getFullYear(), today.getMonth(), 1),
  );

  const year = currentMonth.getFullYear();
  const month = currentMonth.getMonth();
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const monthNames = [
    "一月",
    "二月",
    "三月",
    "四月",
    "五月",
    "六月",
    "七月",
    "八月",
    "九月",
    "十月",
    "十一月",
    "十二月",
  ];

  const days: (number | null)[] = [];
  for (let i = 0; i < firstDay; i++) days.push(null);
  for (let d = 1; d <= daysInMonth; d++) days.push(d);

  const isToday = (d: number) =>
    d === today.getDate() &&
    month === today.getMonth() &&
    year === today.getFullYear();

  return (
    <SidebarGroup>
      <SidebarGroupLabel className="font-bold tracking-wider uppercase text-[0.65rem] text-sidebar-foreground/60">
        日历
      </SidebarGroupLabel>
      <div className="px-2">
        <div className="flex items-center justify-between mb-2">
          <button
            type="button"
            onClick={() => setCurrentMonth(new Date(year, month - 1, 1))}
            className="text-primary hover:text-primary/70 text-xs font-bold px-1 cursor-pointer transition-colors duration-200"
          >
            ◀
          </button>
          <span className="text-[0.75rem] font-bold text-sidebar-foreground">
            {year}年 {monthNames[month]}
          </span>
          <button
            type="button"
            onClick={() => setCurrentMonth(new Date(year, month + 1, 1))}
            className="text-primary hover:text-primary/70 text-xs font-bold px-1 cursor-pointer transition-colors duration-200"
          >
            ▶
          </button>
        </div>
        <div className="grid grid-cols-7 gap-0.5 mb-1">
          {["日", "一", "二", "三", "四", "五", "六"].map((d) => (
            <div
              key={d}
              className="text-center text-[0.55rem] font-bold text-sidebar-foreground/40"
            >
              {d}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-0.5">
          {days.map((d, i) =>
            d === null ? (
              <div key={`empty-${i}`} />
            ) : (
              <div
                key={d}
                className={`text-center text-[0.7rem] py-0.5 rounded-sm transition-all duration-200 cursor-default ${
                  isToday(d)
                    ? "bg-primary text-primary-foreground font-bold rounded-md"
                    : "text-sidebar-foreground/70 hover:bg-sidebar-accent"
                }`}
              >
                {d}
              </div>
            ),
          )}
        </div>
      </div>
    </SidebarGroup>
  );
}

function TabsSection({ posts, comments }: { posts: any[]; comments: any[] }) {
  const [activeTab, setActiveTab] = React.useState<"posts" | "comments">(
    "posts",
  );

  return (
    <SidebarGroup>
      <SidebarGroupLabel className="font-bold tracking-wider uppercase text-[0.65rem] text-sidebar-foreground/60">
        动态
      </SidebarGroupLabel>
      <div className="flex gap-0.5 px-2 mb-2">
        <button
          type="button"
          onClick={() => setActiveTab("posts")}
          className={`flex-1 text-[0.7rem] font-bold py-1.5 rounded-md transition-all duration-200 cursor-pointer ${
            activeTab === "posts"
              ? "bg-primary text-primary-foreground"
              : "text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-sidebar-accent"
          }`}
        >
          最新文章
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("comments")}
          className={`flex-1 text-[0.7rem] font-bold py-1.5 rounded-md transition-all duration-200 cursor-pointer ${
            activeTab === "comments"
              ? "bg-primary text-primary-foreground"
              : "text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-sidebar-accent"
          }`}
        >
          最新评论
        </button>
      </div>
      <div className="px-2">
        {activeTab === "posts" && (
          <SidebarMenu>
            {posts.map((post, i) => (
              <SidebarMenuItem key={i}>
                <SidebarMenuButton
                  asChild
                  size="sm"
                  className="text-[0.7rem] font-medium h-auto flex-col py-1 px-2 text-sidebar-foreground/70 hover:text-primary"
                >
                  <a href={post.uri}>
                    <p className="w-full truncate text-left text-primary-foreground text-[0.68rem] mt-0.5">
                      {post.title}
                    </p>
                    <div className="flex items-center gap-1.5 w-full">
                      <span className="text-[0.6rem] text-sidebar-foreground/60">
                        {dayjs(post.date).format("YYYY-MM-DD")}
                      </span>
                    </div>
                  </a>
                </SidebarMenuButton>
              </SidebarMenuItem>
            ))}
          </SidebarMenu>
        )}
        {activeTab === "comments" && (
          <SidebarMenu>
            {comments.map((c, i) => (
              <SidebarMenuItem key={i}>
                <SidebarMenuButton
                  asChild
                  size="sm"
                  className="h-auto py-1.5 px-2 flex-col items-start gap-0.5"
                >
                  <a
                    href={`${c.commentedOn?.node?.uri ?? ""}#chat-comment-${c?.databaseId}`}
                    className="w-full"
                  >
                    <div className="flex items-center gap-1.5 w-full">
                      <span className="font-bold text-sidebar-foreground text-[0.68rem]">
                        {c.author.node.name}
                      </span>
                      <span className="text-[0.6rem] text-sidebar-foreground/60">
                        {c.date}
                      </span>
                    </div>
                    <p className="w-full truncate text-left text-sidebar-foreground/60 text-[0.68rem] mt-0.5">
                      {c.content.replace(/<[^>]*>/g, "")}
                    </p>
                  </a>
                </SidebarMenuButton>
              </SidebarMenuItem>
            ))}
          </SidebarMenu>
        )}
      </div>
    </SidebarGroup>
  );
}

function CategoryList({
  categories,
}: {
  categories: {
    name: string;
    uri: string;
    count: number;
    parent?: { node?: { name?: string } };
    children?: { nodes?: { name: string }[] };
  }[];
}) {
  const [collapsed, setCollapsed] = React.useState<Set<string>>(new Set());
  if (!categories.length) return null;

  const parentMap = new Map<string, typeof categories>();
  const all = new Map<string, (typeof categories)[number]>();
  for (const c of categories) {
    all.set(c.name, c);
    const parentName = c.parent?.node?.name;
    if (parentName) {
      if (!parentMap.has(parentName)) parentMap.set(parentName, []);
      parentMap.get(parentName)!.push(c);
    }
  }
  // Parent categories (those that have children in the data)
  const parents = categories.filter((c) => (c.children?.nodes?.length ?? 0) > 0);
  // Top-level categories without children (leaf roots)
  const roots = categories.filter(
    (c) => !c.parent?.node?.name && (c.children?.nodes?.length ?? 0) === 0,
  );

  const toggle = (name: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  const renderItem = (c: (typeof categories)[number]) => (
    <SidebarMenuItem key={c.name}>
      <SidebarMenuButton asChild tooltip={c.name} size="sm">
        <a href={c.uri || "/"}>
          <span className="text-[0.7rem] flex-1">{c.name}</span>
          <span className="text-[0.65rem] text-sidebar-foreground/40">
            {c.count}
          </span>
        </a>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );

  const sortedParents = parents.sort((a, b) => b.count - a.count);

  return (
    <SidebarGroup>
      <SidebarGroupLabel className="font-bold tracking-wider uppercase text-[0.65rem] text-sidebar-foreground/60">
        文章分类
      </SidebarGroupLabel>
      <SidebarMenu>
        {sortedParents.map((p) => {
          const children = (parentMap.get(p.name) || []).sort(
            (a, b) => b.count - a.count,
          );
          const isOpen = !collapsed.has(p.name);
          return (
            <div key={p.name}>
              <SidebarMenuItem>
                <SidebarMenuButton
                  asChild
                  tooltip={p.name}
                  size="sm"
                  className="cursor-pointer"
                  onClick={(e) => {
                    e.preventDefault();
                    toggle(p.name);
                  }}
                >
                  <a href={p.uri || "/"}>
                    <span className="text-[0.65rem] text-sidebar-foreground/40">
                      {isOpen ? "▾" : "▸"}
                    </span>
                    <span className="text-[0.7rem] flex-1">{p.name}</span>
                    <span className="text-[0.65rem] text-sidebar-foreground/40">
                      {p.count}
                    </span>
                  </a>
                </SidebarMenuButton>
              </SidebarMenuItem>
              {isOpen && (
                <div style={{ paddingLeft: "0.75rem" }}>
                  {children.map(renderItem)}
                </div>
              )}
            </div>
          );
        })}
        {roots.map(renderItem)}
      </SidebarMenu>
    </SidebarGroup>
  );
}

function ArchiveList({
  posts,
}: {
  posts: { date: string }[];
}) {
  const archives = React.useMemo(() => buildArchive(posts), [posts]);
  if (archives.length === 0) return null;
  return (
    <SidebarGroup>
      <SidebarGroupLabel className="font-bold tracking-wider uppercase text-[0.65rem] text-sidebar-foreground/60">
        文章归档
      </SidebarGroupLabel>
      <div className="px-2 pb-2">
        <Select
          value=""
          onValueChange={(v) => {
            const [y, mo] = v.split("-");
            window.location.href = `/archives/post-date/${y}/${mo}`;
          }}
        >
          <SelectTrigger className="w-full justify-between text-[0.7rem]">
            <SelectValue placeholder="选择月份" />
          </SelectTrigger>
          <SelectContent>
            {archives.map((a) => (
              <SelectItem key={a.month} value={a.month}>
                <span className="flex items-center justify-between w-full gap-2">
                  <span>{formatMonth(a.month)}</span>
                  <span className="text-sidebar-foreground/40">
                    ({a.count})
                  </span>
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </SidebarGroup>
  );
}

function buildArchive(posts: { date: string }[]) {
  const months = new Map<string, number>();
  for (const p of posts) {
    const m = p.date.slice(0, 7);
    months.set(m, (months.get(m) || 0) + 1);
  }
  return [...months.entries()]
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([month, count]) => ({ month, count }));
}

function formatMonth(month: string): string {
  const [y, m] = month.split("-");
  return `${y}年${Number(m)}月`;
}

function TagCloud({
  tags,
}: {
  tags: { name: string; uri: string; count: number }[];
}) {
  return (
    <SidebarGroup>
      <SidebarGroupLabel className="font-bold tracking-wider uppercase text-[0.65rem] text-sidebar-foreground/60">
        标签云
      </SidebarGroupLabel>
      <div className="flex flex-wrap gap-1.5 px-2 pt-1 pb-2">
        {tags.map((tag) => (
          <a
            key={tag.name}
            href={tag.uri}
            className={`inline-block px-2 py-0.5 rounded-full border border-border/50 text-sidebar-foreground/70 hover:text-primary hover:border-primary/40 hover:bg-primary/5 transition-all duration-200 cursor-pointer ${
              tag.count >= 4
                ? "text-[0.72rem] font-bold"
                : tag.count >= 3
                  ? "text-[0.65rem] font-semibold"
                  : "text-[0.6rem] font-medium"
            }`}
          >
            {tag.name}
          </a>
        ))}
      </div>
    </SidebarGroup>
  );
}

interface TocItem {
  index: number;
  text: string;
  level: 1 | 2 | 3 | 4 | 5 | 6;
  children: TocItem[];
}

function useToc(pathname?: string) {
  const [toc, setToc] = React.useState<TocItem[]>([]);
  const [activeIndex, setActiveIndex] = React.useState<number>(-1);
  const [collapsed, setCollapsed] = React.useState<Set<number>>(new Set());
  // Map heading element → TOC index, rebuilt whenever toc changes
  const headingIndexMap = React.useRef<Map<Element, number>>(new Map());
  const scrollContainer = React.useRef<Element | null>(null);

  React.useEffect(() => {
    const buildToc = () => {
      setToc([]);
      const article = document.querySelector(
        "article.post-content, article.page-content",
      );
      if (!article) return false;

      // Only scan active page (or whole article if no pagination)
      const activePage = article.querySelector(".article-page.active");
      const container = activePage || article;
      scrollContainer.current = container;

      const headings = container.querySelectorAll("h1, h2, h3, h4, h5, h6");
      if (headings.length === 0) return false;

      const map = new Map<Element, number>();
      const items: TocItem[] = [];
      const stack: TocItem[] = [];

      headings.forEach((h, i) => {
        const level = parseInt(h.tagName[1]) as 1 | 2 | 3 | 4 | 5 | 6;
        map.set(h, i);

        const item: TocItem = {
          index: i,
          text: h.textContent || "",
          level,
          children: [],
        };

        while (stack.length > 0 && stack[stack.length - 1].level >= level) {
          stack.pop();
        }
        if (stack.length === 0) items.push(item);
        else stack[stack.length - 1].children.push(item);
        stack.push(item);
      });

      headingIndexMap.current = map;
      setToc(items);
      return true;
    };

    buildToc();

    const article = document.querySelector(
      "article.post-content, article.page-content",
    );
    if (!article) return;

    const observer = new MutationObserver(() => buildToc());
    observer.observe(article, { childList: true, subtree: true });

    const onPageChange = () => buildToc();
    emitter.on("article-page-changed", onPageChange);

    return () => {
      observer.disconnect();
      emitter.off("article-page-changed", onPageChange);
    };
    // Rebuild when the route changes: ClientRouter swaps the body, so the
    // previously observed article element is gone and the observer would
    // silently stop firing.
  }, [pathname]);

  // IntersectionObserver for scroll-aware active heading
  React.useEffect(() => {
    if (toc.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            const idx = headingIndexMap.current.get(entry.target);
            if (idx !== undefined) setActiveIndex(idx);
          }
        });
      },
      { rootMargin: "-80px 0px -70% 0px", threshold: 0 },
    );

    const article = document.querySelector(
      "article.post-content, article.page-content",
    );
    if (!article) return;
    article
      .querySelectorAll("h1, h2, h3, h4, h5, h6")
      .forEach((h) => observer.observe(h));
    setActiveIndex(-1);

    return () => observer.disconnect();
  }, [toc]);

  const scrollToHeading = React.useCallback((index: number) => {
    const article =
      scrollContainer.current ||
      document.querySelector("article.post-content, article.page-content");
    if (!article) return;
    const headings = article.querySelectorAll("h1, h2, h3, h4, h5, h6");
    if (headings[index]) {
      headings[index].scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, []);

  const toggleCollapsed = (index: number) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  };

  return { toc, activeIndex, collapsed, scrollToHeading, toggleCollapsed };
}

function TocRenderer({
  items,
  activeIndex,
  collapsed,
  toggleCollapsed,
  scrollToHeading,
  depth = 0,
}: {
  items: TocItem[];
  activeIndex: number;
  collapsed: Set<number>;
  toggleCollapsed: (idx: number) => void;
  scrollToHeading: (idx: number) => void;
  depth?: number;
}) {
  return (
    <ul
      className={`${depth > 0 ? "ml-3 border-l border-border/30 pl-2" : ""} flex flex-col gap-0.5`}
    >
      {items.map((item) => {
        const isActive = activeIndex === item.index;
        const hasChildren = item.children.length > 0;
        const isCollapsed = collapsed.has(item.index);

        return (
          <li key={item.index}>
            <button
              type="button"
              onClick={() => scrollToHeading(item.index)}
              className={`w-full text-left text-[0.68rem] leading-tight py-1 px-2 rounded-md transition-all duration-150 flex items-start gap-1 cursor-pointer ${
                isActive
                  ? "bg-primary/10 text-primary font-bold"
                  : "text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-sidebar-accent/50"
              }`}
            >
              {hasChildren && (
                <span
                  className="shrink-0 text-[0.55rem] mt-0.5 cursor-pointer"
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleCollapsed(item.index);
                  }}
                >
                  {isCollapsed ? "▸" : "▾"}
                </span>
              )}
              <span className="truncate">{item.text}</span>
            </button>
            {hasChildren && !isCollapsed && (
              <TocRenderer
                items={item.children}
                activeIndex={activeIndex}
                collapsed={collapsed}
                toggleCollapsed={toggleCollapsed}
                scrollToHeading={scrollToHeading}
                depth={depth + 1}
              />
            )}
          </li>
        );
      })}
    </ul>
  );
}

function ArticleToc({ pathname }: { pathname?: string }) {
  const { toc, activeIndex, collapsed, scrollToHeading, toggleCollapsed } =
    useToc(pathname);

  if (toc.length === 0) {
    return (
      <SidebarGroup>
        <SidebarGroupLabel className="font-bold tracking-wider uppercase text-[0.65rem] text-sidebar-foreground/60">
          文章目录
        </SidebarGroupLabel>
        <p className="text-[0.7rem] text-sidebar-foreground/40 px-2 py-3 text-center">
          暂无目录
        </p>
      </SidebarGroup>
    );
  }

  return (
    <SidebarGroup>
      <SidebarGroupLabel className="font-bold tracking-wider uppercase text-[0.65rem] text-sidebar-foreground/60">
        文章目录
      </SidebarGroupLabel>
      <div className="px-2 max-h-64 overflow-y-auto custom-scrollbar">
        <TocRenderer
          items={toc}
          activeIndex={activeIndex}
          collapsed={collapsed}
          toggleCollapsed={toggleCollapsed}
          scrollToHeading={scrollToHeading}
        />
      </div>
    </SidebarGroup>
  );
}

function ArticleComments({ pathname }: { pathname?: string }) {
  const [commentCount, setCommentCount] = React.useState(0);

  React.useEffect(() => {
    const el = document.getElementById("article-comment-data");
    if (el) {
      try {
        const data = JSON.parse(el.textContent || "{}");
        setCommentCount(data.commentCount ?? 0);
      } catch {}
    }
    // pathname dep: ClientRouter swaps the body, replacing #article-comment-data.
  }, [pathname]);

  return (
    <SidebarGroup>
      <div className="px-2 py-2">
        <button
          type="button"
          onClick={() => {
            document.getElementById("comments-section")?.scrollIntoView({
              behavior: "smooth",
              block: "center",
            });
          }}
          className="w-full flex items-center justify-center gap-2 py-2 rounded-lg border border-border bg-sidebar-accent/30 text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-foreground transition-colors duration-200 cursor-pointer text-[0.75rem] font-semibold"
        >
          <svg
            className="size-3.5"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
          </svg>
          查看评论 ({commentCount})
        </button>
      </div>
    </SidebarGroup>
  );
}

/* ─── SidebarSkeleton ─── */
function SidebarSkeleton() {
  return (
    <>
      <SidebarHeader className="h-16 border-b border-sidebar-border">
        <div className="flex items-center gap-2 px-2">
          <Skeleton className="size-8 rounded-lg" />
          <div className="flex flex-col gap-1.5">
            <Skeleton className="h-3 w-20 rounded" />
            <Skeleton className="h-2.5 w-28 rounded" />
          </div>
        </div>
      </SidebarHeader>
      <SidebarContent className="overflow-y-auto space-y-4 px-3 py-4">
        <Skeleton className="h-40 w-full rounded-lg" />
        <Skeleton className="h-4 w-16 rounded" />
        <Skeleton className="h-2.5 w-full rounded" />
        <Skeleton className="h-2.5 w-5/6 rounded" />
        <Skeleton className="h-2.5 w-3/4 rounded" />
        <Skeleton className="h-2.5 w-full rounded" />
        <Skeleton className="h-4 w-20 rounded" />
        <div className="flex flex-wrap gap-1.5">
          {[48, 56, 36, 60, 44, 52].map((w, i) => (
            <Skeleton
              key={i}
              className="h-5 rounded-full"
              style={{ width: `${w}px` }}
            />
          ))}
        </div>
      </SidebarContent>
    </>
  );
}

/* ─── SiteStats ─── */
function SiteStats({
  sidebarData,
}: {
  sidebarData: SidebarRightProps["sidebarData"];
}) {
  const postCount = sidebarData?.totalPosts ?? sidebarData?.posts?.length ?? 0;
  const commentCount = sidebarData?.totalComments ?? 0;
  const tagCount = sidebarData?.tags?.length ?? 0;
  const categoryCount = sidebarData?.categories?.length ?? 0;

  if (!postCount && !commentCount) return null;

  const stats = [
    { label: "文章", value: postCount },
    { label: "分类", value: categoryCount },
    { label: "标签", value: tagCount },
    { label: "评论", value: commentCount },
  ];

  return (
    <SidebarGroup>
      <SidebarGroupLabel className="font-bold tracking-wider uppercase text-[0.65rem] text-sidebar-foreground/60">
        网站统计
      </SidebarGroupLabel>
      <div className="grid grid-cols-2 gap-1.5 px-2 pb-2">
        {stats.map((s) => (
          <div
            key={s.label}
            className="flex flex-col items-center gap-0.5 rounded-lg border border-border/60 bg-sidebar-accent/40 px-2 py-2.5"
          >
            <span className="font-display text-lg font-bold text-mint-700 transition-colors duration-200 dark:text-mint-300">
              {s.value}
            </span>
            <span className="text-[0.6rem] font-semibold uppercase tracking-wide text-sidebar-foreground/50">
              {s.label}
            </span>
          </div>
        ))}
      </div>
    </SidebarGroup>
  );
}

/* ─── HomepageSidebar ─── */
function HomepageSidebar({
  menu,
  sidebarData,
}: {
  menu?: SidebarRightProps["menu"];
  sidebarData?: SidebarRightProps["sidebarData"];
}) {
  return (
    <>
      <SidebarHeader className="h-16 border-b border-sidebar-border">
        <NavUser />
      </SidebarHeader>
      <SidebarContent className="overflow-y-auto custom-scrollbar">
        <CalendarWidget />
        <SiteStats sidebarData={sidebarData} />
        <TabsSection
          posts={sidebarData?.posts || []}
          comments={sidebarData?.comments || []}
        />
        <CategoryList categories={sidebarData?.categories || []} />
        <TagCloud tags={sidebarData?.tags || []} />
        <ArchiveList posts={sidebarData?.archivePosts || []} />
      </SidebarContent>
      <SidebarFooter className="border-t border-sidebar-border p-2">
        <p className="text-center text-[0.65rem] text-sidebar-foreground/40">
          Theme Maltose By Styunlen
        </p>
      </SidebarFooter>
    </>
  );
}

/* ─── ArticleSidebar ─── */
function ArticleSidebar({ pathname }: { pathname?: string }) {
  return (
    <>
      <SidebarHeader className="h-16 border-b border-sidebar-border">
        <NavUser />
      </SidebarHeader>
      <SidebarContent className="overflow-y-auto custom-scrollbar">
        <ArticleToc pathname={pathname} />
        <ArticleComments pathname={pathname} />
      </SidebarContent>
    </>
  );
}

/* ─── Main ─── */
export default function SidebarRight({
  menu,
  generalSettings,
  sidebarData,
  pathname,
}: SidebarRightProps & { pathname?: string }) {
  const pageType = getPageType(pathname);

  return (
    <Sidebar
      side="right"
      collapsible="icon"
      className="fixed right-0 top-(--header-height) w-(--sidebar-width) h-[calc(100svh-var(--header-height))]! xl:hidden 2xl:flex"
      suppressHydrationWarning
    >
      {pageType === "" && <SidebarSkeleton />}
      {pageType === "article" && <ArticleSidebar pathname={pathname} />}
      {pageType === "home" && (
        <HomepageSidebar menu={menu} sidebarData={sidebarData} />
      )}
      {pageType === "other" && <ArticleSidebar pathname={pathname} />}
      <style>
        {`
        .custom-scrollbar::-webkit-scrollbar { width: 4px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: var(--border); border-radius: 9999px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: var(--primary); }
      `}
      </style>
    </Sidebar>
  );
}
