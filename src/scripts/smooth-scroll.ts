import Lenis from "lenis";
import "lenis/dist/lenis.css";
import { handleSnapVirtualScroll, mountBannerSnap } from "./banner-snap";

let instance: Lenis | null = null;
let motionPreference: MediaQueryList | null = null;

function createInstance(): void {
  if (instance || motionPreference?.matches) return;
  instance = new Lenis({
    duration: 1.2,
    smoothWheel: true,
    syncTouch: false,
    autoRaf: true,
    stopInertiaOnNavigate: true,
    virtualScroll: handleSnapVirtualScroll,
  });
  window.__lenis = instance;
}

function destroyInstance(): void {
  if (!instance) return;
  instance.destroy();
  instance = null;
  window.__lenis = null;
}

/**
 * Site-wide Lenis (ADR-0041): smoothed wheel on pointer devices, native
 * touch, skipped entirely under reduced motion; kept alive across
 * ClientRouter navigations via the astro lifecycle events.
 */
export function initSmoothScroll(): void {
  if (motionPreference) return;
  motionPreference = window.matchMedia("(prefers-reduced-motion: reduce)");

  const sync = (): void => {
    if (motionPreference?.matches) destroyInstance();
    else createInstance();
  };

  sync();
  motionPreference.addEventListener("change", sync);

  mountBannerSnap();

  document.addEventListener("astro:before-swap", () => instance?.stop());
  document.addEventListener("astro:after-swap", () => {
    instance?.start();
    instance?.resize();
  });
  document.addEventListener("astro:page-load", () => instance?.resize());
}
