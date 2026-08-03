import { useEffect, useState } from "react";

// Guard against duplicate view recording across double-mounted instances
// (e.g. Single.astro rendered from multiple routes). Only the first mount
// for a given post issues the mutation.
const recordedPosts = new Set<string | number>();

/**
 * Renders the view count of a post and records a view on mount.
 * The count is bumped optimistically and kept even if the mutation is
 * rejected by rate limiting, so the UI never "snaps back" to the old value.
 */
export default function PostViewCounter({
  postId,
  initialCount = 0,
}: {
  postId: number | string;
  initialCount?: number;
}) {
  const [count, setCount] = useState(initialCount);
  const [recorded, setRecorded] = useState(false);

  useEffect(() => {
    if (recordedPosts.has(postId)) return;
    recordedPosts.add(postId);

    const record = async () => {
      try {
        const { recordPostView } = await import("@api/api");
        const updated = await recordPostView(postId);
        if (typeof updated === "number") {
          setCount(updated);
        }
      } catch (err) {
        // Keep the optimistic value on failure (rate limited / network error)
        // instead of reverting, so the count does not visibly snap back.
        console.warn("[PostViewCounter] view recording skipped:", err);
      } finally {
        setRecorded(true);
      }
    };
    record();
  }, [postId]);

  return (
    <span
      className="post-view-count"
      title="浏览次数"
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "0.3rem",
        fontSize: "0.85rem",
        fontWeight: 500,
        color: "var(--muted-foreground)",
        whiteSpace: "nowrap",
      }}
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
        style={{ width: "0.85rem", height: "0.85rem", flexShrink: 0 }}
      >
        <path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z" />
      </svg>
      {count > 0 ? count + (recorded ? 0 : 1) : count} 次浏览
    </span>
  );
}
