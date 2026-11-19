"use client";

import * as React from "react";

/** Scroll distance over which the side rails fade in past the banner. */
export const RAIL_FADE_RANGE = 80;
const RAIL_MEDIA_QUERY = "(min-width: 768px)";

/**
 * Scroll-linked rail chrome (ADR-0043): on the homepage the side rails are
 * hidden over the banner and fade in linearly across the LAST 80px of the
 * introduction, reaching full opacity exactly at the content top (H). That way
 * a whole-page switch that lands on H shows the rails immediately, without
 * needing an extra scroll. Drives `--rail-opacity` / `--rail-pe` CSS variables
 * on the target element instead of React state, so scrolling never re-renders
 * the sidebar trees. Same rAF-on-scroll pattern as SiteHeader; nothing runs
 * while idle.
 */
export default function RailChromeBridge({
  active,
  targetRef,
}: {
  active: boolean;
  targetRef: React.RefObject<HTMLDivElement | null>;
}) {
  React.useEffect(() => {
    const el = targetRef.current;
    if (!el) return;

    const setVars = (opacity: number, pe: "auto" | "none") => {
      el.style.setProperty("--rail-opacity", opacity.toFixed(3));
      el.style.setProperty("--rail-pe", pe);
    };

    const media = window.matchMedia(RAIL_MEDIA_QUERY);
    if (!active || !media.matches) {
      setVars(1, "auto");
      return;
    }

    let raf = 0;
    const recompute = () => {
      raf = 0;
      const fadeStart = window.innerHeight - RAIL_FADE_RANGE;
      const p = Math.min(
        Math.max((window.scrollY - fadeStart) / RAIL_FADE_RANGE, 0),
        1,
      );
      setVars(p, p > 0.001 ? "auto" : "none");
    };
    const schedule = () => {
      if (raf === 0) raf = window.requestAnimationFrame(recompute);
    };
    const onMediaChange = () => {
      if (!media.matches) setVars(1, "auto");
      else schedule();
    };

    schedule();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    media.addEventListener("change", onMediaChange);
    document.addEventListener("astro:page-load", schedule);

    const cleanup = () => {
      if (raf !== 0) cancelAnimationFrame(raf);
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      media.removeEventListener("change", onMediaChange);
      document.removeEventListener("astro:page-load", schedule);
    };
    document.addEventListener("astro:before-swap", cleanup, { once: true });
    return cleanup;
  }, [active, targetRef]);

  return null;
}
