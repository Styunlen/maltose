// Module-level store for the right sidebar overlay (1280–1536px screens where
// the fixed right rail is hidden but can be opened on demand, ADR-0043).
import { useSyncExternalStore } from "react";

let open = false;
const listeners = new Set<() => void>();

export function setRightRailOpen(value: boolean): void {
  if (open === value) return;
  open = value;
  listeners.forEach((listener) => listener());
}

export function toggleRightRail(): void {
  setRightRailOpen(!open);
}

export function useRightRailOpen(): boolean {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    () => open,
    () => false,
  );
}

// ClientRouter swaps the whole body on navigation; a stale overlay must never
// survive into the next page.
if (typeof document !== "undefined") {
  document.addEventListener("astro:before-swap", () => {
    setRightRailOpen(false);
  });
}
