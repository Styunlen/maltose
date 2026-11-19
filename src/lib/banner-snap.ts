/**
 * Pure decision logic for the WelcomeBanner ↔ content page switch (ADR-0041).
 * No DOM, no Lenis — everything here is unit-testable.
 *
 * Coordinate system: document scroll position `y`, where the banner occupies
 * [0, H] and H = banner height (viewport-height section). Slow gestures scroll
 * freely and may rest anywhere; a wheel gesture that crosses `threshold`
 * (px/s) while it began in the banner switches the whole screen to the next
 * rest position (H downwards, 0 upwards).
 */

/** Tolerance (px) around the two rest positions when classifying position. */
export const SNAP_EPS = 16;

/** Wheel bursts with a gap longer than this are treated as separate gestures. */
export const WHEEL_RELEASE_MS = 140;

/** Last scroll movement direction: -1 up (toward banner), 1 down (toward content), 0 unknown. */
export type LastDir = -1 | 0 | 1;

/**
 * A scroll gesture that started at a position "deep" in the content should
 * stop at the content top (H) when scrolling back up instead of carrying
 * into the banner ("到顶后再滑"). Any start clearly below the content top
 * counts as deep.
 */
export function isDeepOrigin(
  originY: number,
  H: number,
  eps = SNAP_EPS,
): boolean {
  return originY > H + eps;
}

/**
 * Where a fast wheel gesture must complete — a full-screen page switch — or
 * null when the gesture scrolls freely:
 *
 * - down (toward the content): H, but only for gestures that began in the
 *   banner; scrolling inside the content is never hijacked.
 * - up (toward the banner): 0, but only from the banner zone or the content
 *   top; a gesture that began deep in the content is absorbed at H first and
 *   needs a fresh gesture to switch back.
 * - gestures below the speed threshold never switch: slow scrolling stays
 *   free and may rest mid-way.
 */
export function switchTarget(
  originY: number,
  y: number,
  H: number,
  dir: LastDir,
  speed: number,
  threshold: number,
  eps = SNAP_EPS,
): number | null {
  if (H <= 0) return null;
  if (dir === 0) return null;
  if (speed < threshold) return null;

  if (dir > 0) {
    if (y >= H) return null;
    if (originY >= H) return null;
    return H;
  }

  if (y <= eps) return null;
  if (isDeepOrigin(originY, H, eps)) return null;
  return 0;
}

/**
 * Whether an upward wheel event in an active deep-origin gesture must be
 * swallowed to keep the scroll target clamped at the content top.
 * (`target` is Lenis's `targetScroll`; the caller also writes it back to H.)
 */
export function shouldAbsorbUpward(
  H: number,
  originY: number,
  lastDir: LastDir,
  target: number,
  eps = SNAP_EPS,
): boolean {
  if (H <= 0) return false;
  if (!isDeepOrigin(originY, H, eps)) return false;
  if (lastDir >= 0) return false;
  return target <= H;
}

/** Keyboard intent keys handled by the snap controller (PgUp/PgDn/Space). */
export function keyboardTarget(
  key: string,
  shift: boolean,
  y: number,
  H: number,
  maxY: number,
  pageStep: number,
  eps = SNAP_EPS,
): number | null {
  if (H <= 0) return null;

  const downIntent =
    key === "PageDown" || key === "ArrowDown" || (key === " " && !shift);
  const upIntent =
    key === "PageUp" || key === "ArrowUp" || (key === " " && shift);
  if (!downIntent && !upIntent) return null;

  if (downIntent) {
    // Banner or already in the transient zone: complete the full switch.
    if (y < H) return H;
    return Math.min(maxY, y + pageStep);
  }

  if (y <= H + eps) {
    // At (or within a hair of) the content top: full switch back to banner.
    return 0;
  }
  // Deep in the content: step up but stop at the content top — never carry
  // into the banner (the next key press switches).
  return Math.max(H, y - pageStep);
}
