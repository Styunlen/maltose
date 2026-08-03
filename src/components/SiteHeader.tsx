"use client";

import * as React from "react";
import { Search, Menu, X } from "lucide-react";
import { Button } from "@/components/ui/button";

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
}

export default function SiteHeader({ menu, generalSettings }: SiteHeaderProps) {
  const [mobileOpen, setMobileOpen] = React.useState(false);

  return (
    <header className="fixed top-0 z-50 flex w-full flex-col border-b bg-background/95 backdrop-blur-sm supports-[backdrop-filter]:bg-background/60">
      <div className="flex h-(--header-height) w-full items-center gap-2 px-4">
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
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 rounded-xl hover:bg-primary/20 hover:text-primary transition-all duration-200 hidden sm:inline-flex"
          >
            <Search className="size-4" />
          </Button>

          {/* Mobile hamburger */}
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 rounded-xl hover:bg-primary/20 hover:text-primary transition-all duration-200 md:hidden"
            onClick={() => setMobileOpen(!mobileOpen)}
          >
            {mobileOpen ? (
              <X className="size-4" />
            ) : (
              <Menu className="size-4" />
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
  );
}
