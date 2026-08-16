"use client";

import * as React from "react";
import ConfirmDialog from "@/components/ConfirmDialog";

// Intercept clicks on external links site-wide and ask for confirmation
// before navigating away (see ADR-0022). Uses document-level event delegation
// so dynamically rendered links (markdown, comments) are covered too.
function isExternal(href: string): boolean {
  if (!/^https?:\/\//i.test(href)) return false;
  try {
    const url = new URL(href);
    return url.hostname !== window.location.hostname;
  } catch {
    return false;
  }
}

export default function ExternalLinkGuard() {
  const [pendingUrl, setPendingUrl] = React.useState<string | null>(null);

  React.useEffect(() => {
    const onClick = (e: MouseEvent) => {
      const anchor = (e.target as HTMLElement).closest?.("a[href]");
      if (!anchor) return;
      const href = anchor.getAttribute("href") || "";
      if (!isExternal(href)) return;
      // Respect modifier clicks (Ctrl/Cmd) — those already mean new-tab intent.
      if (e.metaKey || e.ctrlKey || e.shiftKey) return;
      e.preventDefault();
      setPendingUrl(href);
    };
    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, []);

  return (
    <ConfirmDialog
      open={pendingUrl !== null}
      onOpenChange={(o) => {
        if (!o) setPendingUrl(null);
      }}
      title="即将离开本站"
      description={
        pendingUrl ? (
          <div className="flex flex-col gap-1.5">
            <span className="text-sm text-muted-foreground">您即将访问外部网站：</span>
            <code
              className="block max-w-full rounded-md bg-muted px-2 py-1.5 text-xs text-foreground break-all font-mono"
            >
              {pendingUrl}
            </code>
            <span className="text-xs text-muted-foreground mt-0.5">
              请注意信息安全，谨慎操作。
            </span>
          </div>
        ) : undefined
      }
      confirmLabel="继续访问"
      cancelLabel="取消"
      confirmVariant="primary"
      onConfirm={() => {
        if (pendingUrl) {
          window.open(pendingUrl, "_blank", "noopener,noreferrer");
        }
        setPendingUrl(null);
      }}
    />
  );
}
