"use client";

import * as React from "react";
import { Home, FileText, Heart, ExternalLink } from "lucide-react";
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

export default function SidebarLeft({
  menu,
  generalSettings,
  ...props
}: AppSidebarProps) {
  const year = new Date().getFullYear();

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
                <div className="flex aspect-square size-8 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm">
                  <Home className="size-4" />
                </div>
                <div className="grid flex-1 text-left text-sm leading-tight">
                  <span className="truncate font-semibold">
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
        {/* Navigation - from WordPress menu */}
        {menu?.menuItems?.nodes?.length > 0 && (
          <SidebarGroup>
            <SidebarGroupLabel className="font-bold tracking-wider uppercase text-[0.65rem] text-sidebar-foreground/60">
              Navigation
            </SidebarGroupLabel>
            <SidebarMenu>
              {menu.menuItems.nodes
                .sort((a, b) => a.order - b.order)
                .map((item) => (
                  <SidebarMenuItem key={item.label}>
                    <SidebarMenuButton asChild tooltip={item.label}>
                      <a href={item.uri || "/"}>
                        <span>{item.label}</span>
                      </a>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
            </SidebarMenu>
          </SidebarGroup>
        )}

        {/* Recent Posts */}
        <SidebarGroup>
          <SidebarGroupLabel className="font-bold tracking-wider uppercase text-[0.65rem] text-sidebar-foreground/60">
            Recent Posts
          </SidebarGroupLabel>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton asChild tooltip="Latest posts">
                <a href="/">
                  <FileText className="size-4" />
                  <span>Check the latest posts</span>
                </a>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter>
        <SidebarMenu></SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
