import type Lenis from "lenis";

/**
 * Shared programmatic-scroll helpers (ADR-0041). They prefer the site-wide
 * Lenis instance so programmatic jumps match the smoothed scroll feel, and
 * fall back to native scrolling when Lenis is absent (reduced motion).
 */

function getLenis(): Lenis | null {
  return window.__lenis ?? null;
}

function prefersReducedMotion(): boolean {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** Scroll the document to `top`, optionally jumping instantly. */
export function scrollToY(
  top: number,
  options: { immediate?: boolean } = {},
): void {
  const lenis = getLenis();
  if (lenis) {
    lenis.scrollTo(top, { immediate: options.immediate === true });
    return;
  }
  window.scrollTo({
    top,
    behavior: options.immediate || prefersReducedMotion() ? "auto" : "smooth",
  });
}

/** Scroll the document back to the top. */
export function scrollToTop(options: { immediate?: boolean } = {}): void {
  scrollToY(0, options);
}

/**
 * Scroll a page-level element into view. Inner scroll containers are left
 * alone — callers that need those keep their native `scrollIntoView`.
 */
export function scrollToElement(
  element: Element | null | undefined,
  options: {
    block?: "start" | "center";
    offset?: number;
    immediate?: boolean;
  } = {},
): void {
  if (!element) return;
  const block = options.block ?? "center";
  const offset = options.offset ?? 0;
  const rect = element.getBoundingClientRect();
  const top =
    window.scrollY +
    rect.top -
    (block === "center"
      ? Math.max(0, (window.innerHeight - rect.height) / 2)
      : 0) -
    offset;
  scrollToY(top, { immediate: options.immediate });
}
