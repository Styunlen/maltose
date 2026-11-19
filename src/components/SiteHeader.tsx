"use client";

import * as React from "react";
import { Menu, PanelRightOpen, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import ThemeToggle from "@/components/ThemeToggle";
import SettingsDrawer from "@/components/SettingsDrawer";
import { toggleRightRail } from "@/lib/right-rail-store";

interface SiteHeaderProps {
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
  homepageIntroChrome?: boolean;
}

export const CONTENT_HEADER_HEIGHT = 64;

const DESKTOP_HEADER_MEDIA_QUERY = "(min-width: 768px)";

export type SiteHeaderChromeState = "banner" | "content";

export interface SiteHeaderScrollInput {
  readonly homepageIntroChrome: boolean;
  readonly isDesktop: boolean;
  readonly scrollY: number;
  readonly transitionRange: number;
}

export interface SiteHeaderScrollModel {
  readonly state: SiteHeaderChromeState;
  readonly progress: number;
}

type SiteHeaderStyle = React.CSSProperties &
  Record<"--site-header-bg" | "--site-header-filter", string>;

export function clampHeaderProgress(scrollY: number, range: number): number {
  if (scrollY <= 0 || range <= 0) return 0;
  return Math.min(scrollY / range, 1);
}

export function getSiteHeaderScrollModel({
  homepageIntroChrome,
  isDesktop,
  scrollY,
  transitionRange,
}: SiteHeaderScrollInput): SiteHeaderScrollModel {
  if (!homepageIntroChrome || !isDesktop) {
    return { state: "content", progress: 1 };
  }

  return {
    state: scrollY > 0 ? "content" : "banner",
    progress: clampHeaderProgress(scrollY, transitionRange),
  };
}

function getHeaderBackground(progress: number): string {
  if (progress <= 0) return "transparent";
  if (progress >= 1) return "var(--background)";
  return `color-mix(in oklch, var(--background) ${Math.round(progress * 100)}%, transparent)`;
}

function getHeaderFilter(progress: number): string {
  if (progress <= 0) return "none";
  return `blur(${Math.min(progress * 8, 8).toFixed(3)}px)`;
}

export default function SiteHeader({
  menu,
  generalSettings,
  homepageIntroChrome = false,
}: SiteHeaderProps) {
  const [mobileOpen, setMobileOpen] = React.useState(false);
  const [headerModel, setHeaderModel] = React.useState<SiteHeaderScrollModel>({
    state: homepageIntroChrome ? "banner" : "content",
    progress: homepageIntroChrome ? 0 : 1,
  });

  React.useEffect(() => {
    if (!homepageIntroChrome) {
      setHeaderModel({ state: "content", progress: 1 });
      return;
    }

    const desktopQuery = window.matchMedia(DESKTOP_HEADER_MEDIA_QUERY);
    let animationFrame: number | null = null;
    let disposed = false;

    const recompute = () => {
      animationFrame = null;
      if (disposed) return;
      setHeaderModel(
        getSiteHeaderScrollModel({
          homepageIntroChrome,
          isDesktop: desktopQuery.matches,
          scrollY: window.scrollY,
          transitionRange: Math.max(
            1,
            window.innerHeight - CONTENT_HEADER_HEIGHT,
          ),
        }),
      );
    };

    const scheduleRecompute = () => {
      if (animationFrame !== null) return;
      animationFrame = window.requestAnimationFrame(recompute);
    };

    const cleanup = () => {
      disposed = true;
      window.removeEventListener("scroll", scheduleRecompute);
      window.removeEventListener("resize", scheduleRecompute);
      desktopQuery.removeEventListener("change", scheduleRecompute);
      document.removeEventListener("astro:page-load", scheduleRecompute);
      document.removeEventListener("astro:before-swap", cleanup);
      if (animationFrame !== null) {
        window.cancelAnimationFrame(animationFrame);
        animationFrame = null;
      }
    };

    scheduleRecompute();
    window.addEventListener("scroll", scheduleRecompute, { passive: true });
    window.addEventListener("resize", scheduleRecompute);
    desktopQuery.addEventListener("change", scheduleRecompute);
    document.addEventListener("astro:page-load", scheduleRecompute);
    document.addEventListener("astro:before-swap", cleanup, { once: true });

    return cleanup;
  }, [homepageIntroChrome]);

  const isBanner = homepageIntroChrome && headerModel.state === "banner";
  const headerStyle: SiteHeaderStyle = {
    "--site-header-bg": getHeaderBackground(headerModel.progress),
    "--site-header-filter": getHeaderFilter(headerModel.progress),
  };

  return (
    <>
      <header
        data-homepage-header={homepageIntroChrome ? "true" : undefined}
        data-header-state={headerModel.state}
        style={headerStyle}
        className="fixed top-0 z-50 flex w-full flex-col border-b bg-background/95 backdrop-blur-sm transition-[background-color,backdrop-filter] duration-200 motion-reduce:transition-none md:border-b-0 md:bg-[var(--site-header-bg)] md:[backdrop-filter:var(--site-header-filter)]"
      >
        <div
          className={`flex h-(--header-height) w-full items-center gap-2 px-4 transition-[height] duration-200 motion-reduce:transition-none${isBanner ? " md:h-20" : ""}`}
        >
          <a
            href="/"
            className="font-extrabold text-lg tracking-tight text-primary shrink-0 px-1"
          >
            {generalSettings?.title || "Blog"}
          </a>

          {/* Desktop navigation */}
          <nav className="hidden md:flex items-center gap-0.5 ml-6">
            {menu?.menuItems?.nodes
              ?.sort((a, b) => a.order - b.order)
              .map((item) => (
                <a
                  key={item.label}
                  href={item.uri || "/"}
                  className="px-3 py-1.5 rounded-xl text-sm font-semibold text-foreground/70 hover:text-primary hover:bg-primary/10 transition-all duration-200"
                >
                  {item.label}
                </a>
              ))}
          </nav>

          <div className="ml-auto flex items-center gap-1">
            <ThemeToggle />
            {/* Right-rail toggle for 1280–1536px where the fixed right rail is
                hidden but can be opened as an overlay (ADR-0043). */}
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-8 hidden xl:inline-flex 2xl:hidden rounded-xl hover:bg-primary/20 hover:text-primary transition-all duration-200"
              onClick={toggleRightRail}
              aria-label="展开右侧栏"
              title="右侧栏"
            >
              <PanelRightOpen data-icon="inline-start" />
            </Button>
            <Button
              asChild
              variant="ghost"
              size="icon"
              className="size-8 rounded-xl hover:bg-primary/20 hover:text-primary transition-all duration-200"
            >
              <a href="/search" aria-label="搜索" title="搜索">
                <Search data-icon="inline-start" />
              </a>
            </Button>
            <SettingsDrawer />

            {/* Mobile hamburger */}
            <Button
              variant="ghost"
              size="icon"
              className="size-8 rounded-xl hover:bg-primary/20 hover:text-primary transition-all duration-200 md:hidden"
              onClick={() => setMobileOpen(!mobileOpen)}
            >
              {mobileOpen ? (
                <X data-icon="inline-start" />
              ) : (
                <Menu data-icon="inline-start" />
              )}
            </Button>
          </div>
        </div>

        {/* Mobile navigation panel */}
        {mobileOpen && (
          <div className="md:hidden border-t border-border/50 bg-background px-4 py-3 shadow-lg">
            <nav className="flex flex-col gap-1">
              {menu?.menuItems?.nodes
                ?.sort((a, b) => a.order - b.order)
                .map((item) => (
                  <a
                    key={item.label}
                    href={item.uri || "/"}
                    className="px-4 py-2.5 rounded-xl text-sm font-semibold text-foreground/70 hover:text-primary hover:bg-primary/10 transition-all duration-200"
                    onClick={() => setMobileOpen(false)}
                  >
                    {item.label}
                  </a>
                ))}
            </nav>
          </div>
        )}
      </header>
      <style>{`
        @media (prefers-reduced-motion: reduce) {
          header[data-header-state],
          header[data-header-state] > div:first-child {
            transition: none;
            transition-duration: 0s;
            transition-delay: 0s;
          }
        }
      `}</style>
    </>
  );
}
