"use client";

import * as React from "react";
import {
  ArrowUp,
  Circle,
  Clock,
  Home,
  Link,
  MessageCircle,
  Package,
  Rss,
  Rocket,
  User,
  type LucideIcon,
} from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarGroup,
  SidebarGroupLabel,
} from "@/components/animate-ui/radix/sidebar";

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
    .replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2300}-\u{23FF}\u{2B00}-\u{2BFF}]/gu, "")
    .replace(/[\u{FE0F}\u{200D}]/gu, "")
    .trim();
}

const GROUP_LABEL_CLS =
  "font-bold tracking-wider uppercase text-[0.65rem] text-sidebar-foreground/60";

export default function SidebarLeft({
  menu,
  generalSettings,
  ...props
}: AppSidebarProps) {
  const year = new Date().getFullYear();

  const backToTop = () => {
    const reduced =
      window.matchMedia &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    window.scrollTo({ top: 0, behavior: reduced ? "auto" : "smooth" });
  };

  return (
    <Sidebar
      collapsible="icon"
      className="top-(--header-height) h-[calc(100svh-var(--header-height))]!"
      {...props}
    >
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
                    {generalSettings?.title || "Blog"}
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

      <SidebarContent>
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

        <SidebarGroup className="group-data-[collapsible=icon]:hidden">
          <SidebarGroupLabel className={GROUP_LABEL_CLS}>
            Tools
          </SidebarGroupLabel>
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
                onClick={backToTop}
                tooltip="返回顶部"
                className="transition-colors duration-200 hover:text-primary"
              >
                <ArrowUp className="size-4" />
                <span>返回顶部</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter>
        <div className="px-2 pb-2 text-center group-data-[collapsible=icon]:hidden">
          <p className="text-[0.65rem] text-sidebar-foreground/40">
            © {year} {generalSettings?.title || "Maltose"}
          </p>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
