import {
  WHEEL_RELEASE_MS,
  isDeepOrigin,
  keyboardTarget,
  shouldAbsorbUpward,
  switchTarget,
  type LastDir,
} from "../lib/banner-snap";
import type { VirtualScrollData } from "lenis";

/** Duration (s) of a full-screen completion — matches the site-wide Lenis feel. */
const SNAP_DURATION = 1.2;

/** Completion duration (s) for small keyboard steps (arrow keys). */
const STEP_DURATION = 0.35;

/** Arrow-key step in px. */
const ARROW_STEP = 48;

/** Shortest completion duration (s), used when the gesture is nearly there. */
const SETTLE_MIN_DURATION = 0.3;

/** Wheel speed (px/s) that turns a gesture into a full-screen page switch. */
const SWITCH_VELOCITY = 1200;

/** Completion-animation strategies; `?snapfeel=` is a temporary A/B switch. */
type SnapFeel = "current" | "ease" | "fixed";

const SNAP_FEELS: readonly SnapFeel[] = ["current", "ease", "fixed"];

let snapFeel: SnapFeel | null = null;

function readSnapFeel(): SnapFeel {
  if (snapFeel) return snapFeel;
  const requested = new URLSearchParams(window.location.search).get("snapfeel");
  snapFeel =
    requested && (SNAP_FEELS as readonly string[]).includes(requested)
      ? (requested as SnapFeel)
      : "ease";
  return snapFeel;
}

let switchVelocity: number | null = null;

/** `?snapvelocity=` tuning override for the default switch threshold. */
function readSwitchVelocity(): number {
  if (switchVelocity) return switchVelocity;
  const requested = Number(
    new URLSearchParams(window.location.search).get("snapvelocity"),
  );
  switchVelocity =
    Number.isFinite(requested) && requested >= 200 && requested <= 8000
      ? requested
      : SWITCH_VELOCITY;
  return switchVelocity;
}

/** Hermite completion curve: starts at `slope`, ends at rest (slope 0). */
function velocityMatchedEasing(slope: number): (t: number) => number {
  const v = Math.max(0, Math.min(3, slope));
  return (t) => {
    const rest = 1 - t;
    return v * t * rest * rest + t * t * (3 - 2 * t);
  };
}

function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
}

/**
 * Completion duration scaled by the travel left: a full-screen switch keeps
 * the reference-like glide, while a gesture that already covered most of the
 * distance settles quickly instead of creeping through a long tail.
 */
function completionDuration(distance: number): number {
  const span = bannerHeight() || window.innerHeight;
  const ratio = span > 0 ? Math.min(1, Math.abs(distance) / span) : 1;
  return SETTLE_MIN_DURATION + (SNAP_DURATION - SETTLE_MIN_DURATION) * ratio;
}

let active = false;
let snapping = false;
let snapTarget = 0;
let originY = 0;
let lastDir: LastDir = 0;
let lastWheelAt = 0;
let wheelSamples: Array<{ t: number; d: number }> = [];
let snapGuardTimer = 0;

function bannerHeight(): number {
  const hero = document.querySelector("[data-maltose-home-hero]");
  return hero instanceof HTMLElement ? hero.getBoundingClientRect().height : 0;
}

/**
 * Mirrors Lenis's own `data-lenis-prevent*` path check for wheel events, so
 * the snap controller never interferes with gestures aimed at inner
 * scrollables.
 */
function preventedByPath(
  event: Event,
  deltaX: number,
  deltaY: number,
): boolean {
  const horizontal = Math.abs(deltaX) >= Math.abs(deltaY);
  return event.composedPath().some((node) => {
    if (!(node instanceof HTMLElement)) return false;
    return (
      node.hasAttribute("data-lenis-prevent") ||
      node.hasAttribute("data-lenis-prevent-wheel") ||
      (horizontal
        ? node.hasAttribute("data-lenis-prevent-horizontal")
        : node.hasAttribute("data-lenis-prevent-vertical"))
    );
  });
}

/** True when this wheel delta pushes further toward the active switch target. */
function wheelTowardTarget(deltaY: number): boolean {
  if (snapTarget > window.scrollY) return deltaY > 0;
  if (snapTarget < window.scrollY) return deltaY < 0;
  return false;
}

function completeTo(target: number, explicitDuration?: number): void {
  const lenis = window.__lenis ?? null;
  snapping = true;
  snapTarget = target;
  window.clearTimeout(snapGuardTimer);
  if (!lenis) {
    snapping = false;
    window.scrollTo({ top: target, behavior: "auto" });
    return;
  }

  const feel = readSnapFeel();
  const distance = target - window.scrollY;
  const duration =
    explicitDuration ??
    (feel === "current" ? SNAP_DURATION : completionDuration(distance));

  let easing: ((t: number) => number) | undefined;
  if (feel === "ease") {
    // Hand off at the velocity the scroll already has, so a slow wheel is not
    // kicked into a burst and a fast flick is not braked; the curve lands at rest.
    const velocity = Math.abs(lenis.velocity) * 60; // px/frame -> px/s
    const slope =
      Math.abs(distance) < 1 ? 0 : (velocity * duration) / Math.abs(distance);
    easing = velocityMatchedEasing(slope);
  } else if (feel === "fixed") {
    easing = easeInOutCubic;
  }

  snapGuardTimer = window.setTimeout(
    () => {
      snapping = false;
    },
    duration * 1000 + 250,
  );
  lenis.scrollTo(target, {
    duration,
    ...(easing ? { easing } : {}),
    onComplete: () => {
      window.clearTimeout(snapGuardTimer);
      snapping = false;
    },
  });
}

/** Wheel speed over the last `SPEED_WINDOW_MS`, or null until two events land. */
const SPEED_WINDOW_MS = 250;

/** Minimum span used when timing is bursty, so jank cannot fake extreme speed. */
const SPEED_MIN_SPAN_MS = 80;

function wheelSpeed(now: number, deltaY: number): number | null {
  wheelSamples.push({ t: now, d: Math.abs(deltaY) });
  while (wheelSamples.length && now - wheelSamples[0].t > SPEED_WINDOW_MS) {
    wheelSamples.shift();
  }
  if (wheelSamples.length < 2) return null;
  const span = Math.max(now - wheelSamples[0].t, SPEED_MIN_SPAN_MS);
  const total = wheelSamples.reduce((sum, sample) => sum + sample.d, 0);
  return (total / span) * 1000;
}

function cancelSnap(): void {
  window.clearTimeout(snapGuardTimer);
  const lenis = window.__lenis ?? null;
  if (snapping && lenis) {
    lenis.scrollTo(window.scrollY, { immediate: true, force: true });
  }
  snapping = false;
  wheelSamples = [];
}

function onWheel(event: WheelEvent): void {
  if (!active || event.ctrlKey) return;
  if (preventedByPath(event, event.deltaX, event.deltaY)) return;
  if (snapping) {
    // Same-direction input is ignored while a switch is in flight; the Lenis
    // hook swallows those events. Opposite input cancels the switch.
    if (wheelTowardTarget(event.deltaY)) return;
    cancelSnap();
  }

  const now = performance.now();
  const gap = now - lastWheelAt;
  if (gap > WHEEL_RELEASE_MS) {
    originY = window.scrollY;
    wheelSamples = [];
  }
  const speed = wheelSpeed(now, event.deltaY);
  lastWheelAt = now;
  if (event.deltaY > 0) lastDir = 1;
  else if (event.deltaY < 0) lastDir = -1;
  if (speed === null) return;

  const threshold = readSwitchVelocity();
  if (speed < threshold) return;
  const H = bannerHeight();
  if (H <= 0) return;
  const target = switchTarget(
    originY,
    window.scrollY,
    H,
    lastDir,
    speed,
    threshold,
  );
  if (target !== null) completeTo(target);
}

const INTERACTIVE_SELECTOR = [
  "input",
  "textarea",
  "select",
  "button",
  "summary",
  "[contenteditable]:not([contenteditable='false'])",
  "[role='textbox']",
  "[role='menu']",
  "[role='listbox']",
  "[role='combobox']",
  "[role='dialog']",
  "[role='slider']",
].join(", ");

function onKeydown(event: KeyboardEvent): void {
  if (!active || event.defaultPrevented || event.repeat) return;
  if (event.metaKey || event.ctrlKey || event.altKey) return;
  const target = event.target;
  if (target instanceof Element && target.closest(INTERACTIVE_SELECTOR)) return;
  const H = bannerHeight();
  if (H <= 0) return;
  const lenis = window.__lenis ?? null;
  const maxY =
    lenis?.limit ??
    Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
  const isPageKey =
    event.key === "PageDown" || event.key === "PageUp" || event.key === " ";
  const step = isPageKey ? Math.round(H * 0.9) : ARROW_STEP;
  const scrollTarget = keyboardTarget(
    event.key,
    event.shiftKey,
    window.scrollY,
    H,
    maxY,
    step,
  );
  if (scrollTarget === null) return;
  event.preventDefault();
  const distance = Math.abs(scrollTarget - window.scrollY);
  completeTo(scrollTarget, distance >= H * 0.5 ? SNAP_DURATION : STEP_DURATION);
}

/**
 * Lenis `virtualScroll` hook (wired in `src/scripts/smooth-scroll.ts`). Runs
 * before each event is consumed and may rewrite its pixel deltas or return
 * `false` to drop it entirely. Implements the "absorb at the content top"
 * rule and same-direction ignoring during a switch animation.
 */
export function handleSnapVirtualScroll(data: VirtualScrollData): boolean {
  if (!active) return true;
  const event = data.event;
  if (!(event instanceof WheelEvent) || event.ctrlKey) return true;
  const lenis = window.__lenis ?? null;
  if (!lenis) return true;
  if (preventedByPath(event, data.deltaX, data.deltaY)) return true;

  if (snapping) {
    if (wheelTowardTarget(data.deltaY)) {
      if (event.cancelable) event.preventDefault();
      return false;
    }
    return true;
  }

  const H = bannerHeight();
  if (H <= 0) return true;
  if (!isDeepOrigin(originY, H) || lastDir >= 0) return true;
  const target = lenis.targetScroll;
  if (shouldAbsorbUpward(H, originY, lastDir, target)) {
    if (target < H) {
      data.deltaY = H - target;
      return true;
    }
    if (event.cancelable) event.preventDefault();
    return false;
  }
  if (target + data.deltaY < H) {
    data.deltaY = H - target;
  }
  return true;
}

export function initBannerSnap(): (() => void) | undefined {
  if (active) return undefined;
  const hero = document.querySelector("[data-maltose-home-hero]");
  if (!(hero instanceof HTMLElement)) return undefined;

  active = true;
  snapping = false;
  lastDir = 0;
  lastWheelAt = 0;
  wheelSamples = [];
  originY = window.scrollY;

  window.addEventListener("wheel", onWheel, { capture: true, passive: true });
  window.addEventListener("keydown", onKeydown);

  return () => {
    active = false;
    snapping = false;
    window.clearTimeout(snapGuardTimer);
    window.removeEventListener("wheel", onWheel, { capture: true });
    window.removeEventListener("keydown", onKeydown);
  };
}

/**
 * Binds the snap controller to the current page and re-binds it after every
 * ClientRouter navigation. Lives in the site-wide bundle because
 * `data-astro-rerun` scripts are emitted as-is and cannot import this module.
 */
export function mountBannerSnap(): void {
  let cleanup: (() => void) | undefined;

  const setup = (): void => {
    if (cleanup) return;
    cleanup = initBannerSnap();
  };

  const teardown = (): void => {
    cleanup?.();
    cleanup = undefined;
  };

  document.addEventListener("astro:page-load", setup);
  document.addEventListener("astro:before-swap", teardown);
  setup();
}
