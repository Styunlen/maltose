"use client";

import * as React from "react";
import {
  ArrowUp,
  Circle,
  Clock,
  Home,
  Link,
  Megaphone,
  MessageCircle,
  Package,
  Rss,
  Rocket,
  Settings2,
  User,
  type LucideIcon,
} from "lucide-react";
import {
  Sidebar,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/animate-ui/radix/sidebar";
import AnnouncementDialog from "@/components/AnnouncementDialog";
import { scrollToTop } from "@/lib/scroll";
import {
  formatAnnouncementDate,
  sortAnnouncements,
  stripHtml,
  type Announcement,
  type SiteConfig,
  type SocialLink,
} from "@/lib/site-config";

interface AppSidebarProps extends React.ComponentProps<typeof Sidebar> {
  menu?: {
    menuItems: {
      nodes: Array<{
        uri: string;
        url: string;
        order: number;
        label: string;
      }>;
    };
  };
  generalSettings?: {
    title: string;
    url: string;
    description: string;
  };
  siteConfig?: SiteConfig | null;
  announcements?: Announcement[] | null;
}

const NAV_ICONS: Array<{ match: RegExp; icon: LucideIcon }> = [
  { match: /timeline/, icon: Clock },
  { match: /softlib/, icon: Package },
  { match: /comment/, icon: MessageCircle },
  { match: /warp/, icon: Link },
  { match: /travellings/, icon: Rocket },
  { match: /about/, icon: User },
  { match: /home|^\/$/, icon: Home },
];

function getNavIcon(item: { uri: string; url: string }): LucideIcon {
  const href = `${item.uri || item.url || ""}`.toLowerCase();
  return NAV_ICONS.find(({ match }) => match.test(href))?.icon ?? Circle;
}

function stripEmoji(label: string): string {
  return label
    .replace(
      /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2300}-\u{23FF}\u{2B00}-\u{2BFF}]/gu,
      "",
    )
    .replace(/[\u{FE0F}\u{200D}]/gu, "")
    .trim();
}

const GROUP_LABEL_CLS =
  "font-bold tracking-wider uppercase text-[0.65rem] text-sidebar-foreground/60";

function SocialIcon({ link }: { link: SocialLink }) {
  const [broken, setBroken] = React.useState(false);
  const href = link.url || "#";

  const source =
    !broken && link.iconType === "url"
      ? link.icon
      : !broken && link.iconType === "iconify"
        ? `https://api.iconify.design/${link.icon.replaceAll(":", "/")}.svg?color=%237888a0`
        : null;

  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer noopener"
      title={link.label}
      aria-label={link.label}
      className="flex size-8 items-center justify-center rounded-lg border border-border/40 bg-background/40 text-foreground/70 transition-colors hover:text-primary hover:bg-primary/10"
    >
      {source ? (
        <img
          src={source}
          alt={link.label}
          loading="lazy"
          referrerPolicy="no-referrer"
          className="size-4.5 object-contain"
          onError={() => setBroken(true)}
        />
      ) : (
        <span className="text-sm font-bold">{link.label.charAt(0)}</span>
      )}
    </a>
  );
}

/** Shared Tools group: RSS / about / settings (desktop opens the drawer). */
function ToolsGroup() {
  const openSettings = () => {
    window.dispatchEvent(new CustomEvent("maltose:open-settings"));
  };

  return (
    <SidebarGroup>
      <SidebarGroupLabel className={GROUP_LABEL_CLS}>Tools</SidebarGroupLabel>
      <SidebarMenu>
        <SidebarMenuItem>
          <SidebarMenuButton
            asChild
            tooltip="RSS 订阅"
            className="transition-colors duration-200 hover:text-primary"
          >
            <a href="/rss.xml">
              <Rss className="size-4" />
              <span>RSS 订阅</span>
            </a>
          </SidebarMenuButton>
        </SidebarMenuItem>
        <SidebarMenuItem>
          <SidebarMenuButton
            asChild
            tooltip="关于我"
            className="transition-colors duration-200 hover:text-primary"
          >
            <a href="/about">
              <User className="size-4" />
              <span>关于我</span>
            </a>
          </SidebarMenuButton>
        </SidebarMenuItem>
        <SidebarMenuItem>
          <SidebarMenuButton
            onClick={openSettings}
            tooltip="设置"
            className="transition-colors duration-200 hover:text-primary"
          >
            <Settings2 className="size-4" />
            <span>设置</span>
          </SidebarMenuButton>
        </SidebarMenuItem>
        <SidebarMenuItem>
          <SidebarMenuButton
            onClick={() => scrollToTop()}
            tooltip="返回顶部"
            className="transition-colors duration-200 hover:text-primary"
          >
            <ArrowUp className="size-4" />
            <span>返回顶部</span>
          </SidebarMenuButton>
        </SidebarMenuItem>
      </SidebarMenu>
    </SidebarGroup>
  );
}

export default function SidebarLeft({
  menu,
  generalSettings,
  siteConfig,
  announcements,
  ...props
}: AppSidebarProps) {
  const year = new Date().getFullYear();
  const [announcementOpen, setAnnouncementOpen] = React.useState(false);

  const owner = siteConfig?.owner ?? null;
  const socialLinks = siteConfig?.socialLinks ?? [];
  const ordered = React.useMemo(
    () => (announcements ? sortAnnouncements(announcements) : []),
    [announcements],
  );
  const latest = ordered[0] ?? null;
  const siteName = generalSettings?.title || "Blog";
  const ownerName = owner?.name || siteName;
  const ownerBio = owner?.description || generalSettings?.description || "";

  return (
    <>
      <Sidebar
        collapsible="icon"
        glass
        className="top-(--header-height) h-[calc(100svh-var(--header-height))]! [opacity:var(--rail-opacity)] [pointer-events:var(--rail-pe)]"
        {...props}
      >
        {/* ── Desktop rail (xl+): author card + announcement + tools ── */}
        <div
          data-lenis-prevent
          className="hidden h-full min-h-0 flex-col xl:flex"
        >
          <div className="custom-scrollbar flex-1 overflow-y-auto">
            {/* 作者卡（ADR-0043）：数据来自 WP 博主用户，社交链接后台可配 */}
            <div className="p-4">
              <div className="flex flex-col items-center gap-3 rounded-2xl border border-border/40 bg-background/40 p-4 text-center">
                {owner?.avatar?.url ? (
                  <img
                    src={owner.avatar.url}
                    alt={ownerName}
                    loading="lazy"
                    referrerPolicy="no-referrer"
                    className="size-16 rounded-full object-cover ring-1 ring-border/40"
                  />
                ) : (
                  <div className="flex size-16 items-center justify-center rounded-full bg-primary/10 text-2xl font-bold text-primary ring-1 ring-border/40">
                    {ownerName.charAt(0)}
                  </div>
                )}
                <div>
                  <p className="font-display font-semibold">{ownerName}</p>
                  {ownerBio && (
                    <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                      {ownerBio}
                    </p>
                  )}
                </div>
                {socialLinks.length > 0 && (
                  <div className="flex flex-wrap items-center justify-center gap-2">
                    {socialLinks.map((link) => (
                      <SocialIcon
                        key={`${link.label}-${link.url}`}
                        link={link}
                      />
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* 公告卡：默认显示最新一条，单击弹出全部公告时间轴 */}
            {latest && (
              <div className="px-4 pb-2">
                <button
                  type="button"
                  onClick={() => setAnnouncementOpen(true)}
                  className="flex w-full flex-col gap-1.5 rounded-2xl border border-border/40 bg-background/40 p-3 text-left transition-colors hover:bg-primary/10"
                  aria-haspopup="dialog"
                >
                  <span className="flex items-center gap-1.5 text-xs font-bold tracking-wide text-primary">
                    <Megaphone className="size-3.5" />
                    公告
                    <span className="ml-auto text-[0.65rem] font-normal text-muted-foreground">
                      {formatAnnouncementDate(latest.date)}
                    </span>
                  </span>
                  <span className="line-clamp-2 text-xs leading-relaxed text-foreground/80">
                    {stripHtml(latest.content ?? "", 80)}
                  </span>
                </button>
              </div>
            )}

            <ToolsGroup />
          </div>

          <div className="border-t border-border/40 px-2 pb-2 pt-2 text-center">
            <p className="text-[0.65rem] text-sidebar-foreground/40">
              © {year} {siteName}
            </p>
          </div>
        </div>

        {/* ── Mobile sheet: keep the existing navigation + tools ── */}
        <div className="flex h-full min-h-0 flex-col xl:hidden">
          <SidebarHeader>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton size="lg" asChild>
                  <a href="/">
                    <div className="flex aspect-square size-8 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-mint-600 text-primary-foreground shadow-[0_0_10px] shadow-primary/25 ring-1 ring-primary/30">
                      <Home className="size-4" />
                    </div>
                    <div className="grid flex-1 text-left text-sm leading-tight">
                      <span className="truncate font-display font-semibold">
                        {siteName}
                      </span>
                      <span className="truncate text-xs text-muted-foreground">
                        {generalSettings?.description || "Blog"}
                      </span>
                    </div>
                  </a>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarHeader>

          <div className="custom-scrollbar flex-1 overflow-y-auto">
            {menu?.menuItems?.nodes?.length > 0 && (
              <SidebarGroup>
                <SidebarGroupLabel className={GROUP_LABEL_CLS}>
                  Navigation
                </SidebarGroupLabel>
                <SidebarMenu>
                  {menu.menuItems.nodes
                    .sort((a, b) => a.order - b.order)
                    .map((item) => {
                      const Icon = getNavIcon(item);
                      const label = stripEmoji(item.label) || item.label;
                      return (
                        <SidebarMenuItem key={item.label}>
                          <SidebarMenuButton
                            asChild
                            tooltip={label}
                            className="transition-colors duration-200 hover:text-primary"
                          >
                            <a href={item.uri || item.url || "/"}>
                              <Icon className="size-4" />
                              <span>{label}</span>
                            </a>
                          </SidebarMenuButton>
                        </SidebarMenuItem>
                      );
                    })}
                </SidebarMenu>
              </SidebarGroup>
            )}

            <ToolsGroup />
          </div>

          <div className="border-t border-border/40 px-2 py-2 text-center">
            <p className="text-[0.65rem] text-sidebar-foreground/40">
              © {year} {siteName}
            </p>
          </div>
        </div>
      </Sidebar>

      {ordered.length > 0 && (
        <AnnouncementDialog
          open={announcementOpen}
          onClose={() => setAnnouncementOpen(false)}
          announcements={ordered}
        />
      )}
    </>
  );
}
