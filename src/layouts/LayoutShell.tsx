"use client";

import * as React from "react";
import NavigationProgress from "@/components/NavigationProgress";
import ScrollProgress from "@/components/ScrollProgress";
import SiteHeader from "@/components/SiteHeader";
import AuthProvider from "@/components/AuthProvider";
import AuthErrorToast from "@/components/AuthErrorToast";
import ExternalLinkGuard from "@/components/ExternalLinkGuard";
import HoverPreviewProvider from "@/components/HoverPreviewProvider";
import Live2DAvatar from "@/components/Live2DAvatar";
import BackToTop from "@/components/BackToTop";
import SidebarLeft from "./SidebarLeft";
import SidebarRight from "./SidebarRight";
import {
  SidebarProvider,
  SidebarInset,
  SidebarTrigger,
} from "@/components/animate-ui/radix/sidebar";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
} from "@/components/ui/breadcrumb";
import { Separator } from "@/components/ui/separator";

interface LayoutShellProps {
  menu?: { menuItems: { nodes: Array<{ uri: string; url: string; order: number; label: string }> } };
  generalSettings?: { title: string; url: string; description: string };
  sidebarData?: {
    posts?: any[];
    tags?: any[];
    comments?: any[];
    categories?: { name: string; uri: string; count: number }[];
    archivePosts?: { date: string }[];
  } | null;
  initialUser?: { sub: string; email?: string; name?: string; preferred_username?: string } | null;
  pathname?: string;
  children: React.ReactNode;
}

export default function LayoutShell({
  menu,
  generalSettings,
  sidebarData,
  initialUser = null,
  pathname,
  children,
}: LayoutShellProps) {
  return (
    <>
      <NavigationProgress />
      <ScrollProgress />
      <AuthProvider initialUser={initialUser}>
    <AuthErrorToast />
    <ExternalLinkGuard />
    <HoverPreviewProvider />
    {/* MC 皮肤 3D 看板娘（ADR-0027）：右下角浮动，桌面端展示 */}
    <Live2DAvatar />
    <BackToTop />
    <div className="[--header-height:calc(--spacing(14))]">
      <SiteHeader menu={menu} generalSettings={generalSettings} />
      <SidebarProvider>
        <SidebarLeft menu={menu} generalSettings={generalSettings} />
        <SidebarInset className="bg-transparent top-(--header-height) max-w-5xl mx-auto">
          <header className="flex h-14 shrink-0 items-center gap-2 border-b border-border/30 bg-background/50 px-4">
            <SidebarTrigger className="size-8 rounded-xl hover:bg-primary/20 hover:text-primary transition-all duration-200" />
            <Separator
              orientation="vertical"
              className="mr-2 h-4 bg-border/50"
            />
            <Breadcrumb>
              <BreadcrumbList>
                <BreadcrumbItem>
                  <BreadcrumbPage className="text-foreground/80 font-semibold tracking-tight">
                    {generalSettings?.title || "Blog"}
                  </BreadcrumbPage>
                </BreadcrumbItem>
              </BreadcrumbList>
            </Breadcrumb>
          </header>
          <div className="flex flex-1 flex-col max-w-5xl mx-auto w-full p-4 md:p-6">
            {children}
          </div>
        </SidebarInset>
        <SidebarRight menu={menu} generalSettings={generalSettings} sidebarData={sidebarData} pathname={pathname} />
      </SidebarProvider>
    </div>
    </AuthProvider>
    </>
  );
}
