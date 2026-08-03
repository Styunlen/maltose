import { useEffect } from "react";

export const VIEW_COUNT_EVENT = "maltose:view-count";

export interface ViewCountTarget {
  databaseId: number | string;
  elementId: string;
}

/**
 * Global view-count refresher. Collects every element on the page that needs
 * a live view count, fetches them in one batched network-only query on mount,
 * then dispatches the fresh values via CustomEvent so each card updates
 * without additional requests.
 */
export default function ViewCountsProvider({ targets }: { targets: ViewCountTarget[] }) {
  useEffect(() => {
    if (targets.length === 0) return;

    let cancelled = false;
    const run = async () => {
      try {
        const { getViewCounts } = await import("@api/api");
        const ids = targets.map((t) => t.databaseId);
        const map = await getViewCounts(ids);
        if (cancelled) return;
        window.dispatchEvent(
          new CustomEvent(VIEW_COUNT_EVENT, { detail: { counts: map } }),
        );
      } catch (err) {
        console.warn("[ViewCountsProvider] failed to refresh view counts:", err);
      }
    };
    run();

    return () => {
      cancelled = true;
    };
  }, [targets]);

  return null;
}
