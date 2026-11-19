"use client";

import * as React from "react";
import { Megaphone, X } from "lucide-react";
import { formatAnnouncementDate, type Announcement } from "@/lib/site-config";

/**
 * Centered announcement timeline dialog (ADR-0043). Opens from the left-rail
 * announcement card and lists every announcement newest-first (sticky first),
 * date + content per entry. Esc / backdrop click / ✕ close it; background
 * scroll is paused while open (Lenis stop + body overflow fallback).
 */
export default function AnnouncementDialog({
  open,
  onClose,
  announcements,
}: {
  open: boolean;
  onClose: () => void;
  announcements: Announcement[];
}) {
  React.useEffect(() => {
    if (!open) return;

    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);

    const lenis = (
      window as unknown as { __lenis?: { stop: () => void; start: () => void } }
    ).__lenis;
    lenis?.stop();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", onKey);
      lenis?.start();
      document.body.style.overflow = previousOverflow;
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[95] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label="站点公告"
    >
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden
      />
      <div className="relative flex max-h-[80vh] w-full max-w-lg flex-col rounded-2xl border border-border/50 bg-background/85 shadow-2xl backdrop-blur-xl">
        <div className="flex items-center gap-2 border-b border-border/40 px-5 py-4">
          <Megaphone className="size-4 text-primary" />
          <h2 className="font-display text-base font-bold">站点公告</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="关闭"
            className="ml-auto rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-primary/10 hover:text-primary"
          >
            <X className="size-4" />
          </button>
        </div>
        <div className="custom-scrollbar flex-1 overflow-y-auto px-5 py-4">
          <ol className="relative ml-2 border-l border-border/50 pl-4">
            {announcements.map((item) => (
              <li key={item.id} className="relative pb-5 last:pb-0">
                <span className="absolute top-1 -left-[1.35rem] size-2.5 rounded-full bg-primary ring-4 ring-background/60" />
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <time dateTime={item.date}>
                    {formatAnnouncementDate(item.date)}
                  </time>
                  {item.sticky && (
                    <span className="rounded bg-primary/15 px-1.5 py-0.5 text-[0.65rem] font-bold text-primary">
                      置顶
                    </span>
                  )}
                </div>
                <div
                  className="mt-1.5 text-sm leading-relaxed text-foreground/90"
                  dangerouslySetInnerHTML={{ __html: item.content ?? "" }}
                />
              </li>
            ))}
          </ol>
        </div>
      </div>
    </div>
  );
}
