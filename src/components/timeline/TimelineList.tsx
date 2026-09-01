import { motion, useInView } from "motion/react";
import { useRef, useState } from "react";

interface TimelinePost {
  databaseId: number;
  date: string;
  uri: string;
  title: string;
  viewCount?: number;
  commentCount?: number;
}

interface TimelineListProps {
  posts: TimelinePost[];
}

// Layout constants — keep the dot centers exactly on the track line.
const DATE_COL = 72; // fixed date column width (px)
const DOT = 12; // article dot size (px)
const YEAR_DOT = 16; // year node dot size (px)
const TRACK_LEFT = DATE_COL - 1; // 2px track centered on the date-column edge

// timeline19-style vertical timeline with year grouping.
// Year nodes (big dot + year + count) are collapsible (default expanded);
// their articles are child nodes with MM-DD dates.
export default function TimelineList({ posts }: TimelineListProps) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: "-80px" });

  const groups = useGrouped(posts);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  const toggle = (year: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(year)) next.delete(year);
      else next.add(year);
      return next;
    });
  };

  return (
    <div style={{ marginTop: "1.5rem" }} ref={ref}>
      <h2
        style={{
          fontSize: "1.15rem",
          fontWeight: 800,
          marginBottom: "1.25rem",
        }}
      >
        时间轴
      </h2>
      <div style={{ position: "relative" }}>
        {/* Track line */}
        <div
          style={{
            position: "absolute",
            left: TRACK_LEFT,
            top: 0,
            bottom: 0,
            width: 2,
            background: "var(--border)",
            borderRadius: 1,
          }}
        />
        {/* Animated progress line */}
        <motion.div
          style={{
            position: "absolute",
            left: TRACK_LEFT,
            top: 0,
            width: 2,
            background: "var(--primary)",
            borderRadius: 1,
          }}
          initial={{ height: 0 }}
          animate={{ height: inView ? "100%" : 0 }}
          transition={{ duration: 1.5, ease: "easeOut" }}
        />
        <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
          {groups.map((g) => {
            const isOpen = !collapsed.has(g.year);
            return (
              <div key={g.year}>
                {/* Year node */}
                <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
                  <span
                    style={{
                      position: "absolute",
                      left: TRACK_LEFT - YEAR_DOT / 2 + 1,
                      top: "50%",
                      transform: "translateY(-50%)",
                      width: YEAR_DOT,
                      height: YEAR_DOT,
                      borderRadius: "50%",
                      background: "var(--primary)",
                      zIndex: 1,
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => toggle(g.year)}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "0.5rem",
                      background: "none",
                      border: "none",
                      cursor: "pointer",
                      padding: "0.25rem 0",
                      marginLeft: DATE_COL + 16,
                    }}
                  >
                    <span
                      style={{
                        fontSize: "1.2rem",
                        fontWeight: 800,
                        color: "var(--foreground)",
                      }}
                    >
                      {g.year}
                    </span>
                    <span
                      style={{
                        fontSize: "0.78rem",
                        color: "var(--muted-foreground)",
                        fontWeight: 500,
                      }}
                    >
                      {g.posts.length} 篇
                      <span style={{ marginLeft: "0.4rem" }}>{isOpen ? "▾" : "▸"}</span>
                    </span>
                  </button>
                </div>
                {/* Articles */}
                {isOpen && (
                  <div style={{ display: "flex", flexDirection: "column", gap: "0.9rem", paddingTop: "0.4rem" }}>
                    {g.posts.map((p, i) => (
                      <div
                        key={p.databaseId}
                        style={{ position: "relative", display: "flex", alignItems: "flex-start" }}
                      >
                        {/* Article dot — static, always sits on the track line */}
                        <span
                          style={{
                            position: "absolute",
                            left: TRACK_LEFT - DOT / 2 + 1,
                            top: 5,
                            width: DOT,
                            height: DOT,
                            borderRadius: "50%",
                            background: "var(--background)",
                            border: "2px solid var(--primary)",
                            zIndex: 1,
                          }}
                        />
                        <motion.div
                          style={{ display: "flex", alignItems: "flex-start", flex: 1, minWidth: 0 }}
                          initial={{ opacity: 0, x: -8 }}
                          animate={inView ? { opacity: 1, x: 0 } : {}}
                          transition={{ duration: 0.25, delay: Math.min(i * 0.015, 0.3) }}
                        >
                        {/* Date column */}
                        <div
                          style={{
                            width: DATE_COL,
                            flexShrink: 0,
                            fontSize: "0.8rem",
                            fontWeight: 600,
                            color: "var(--muted-foreground)",
                            paddingTop: 1,
                            textAlign: "right",
                            paddingRight: 24,
                          }}
                        >
                          {formatMD(p.date)}
                        </div>
                        {/* Content */}
                        <div style={{ flex: 1, minWidth: 0, paddingLeft: "1rem" }}>
                          <a
                            href={p.uri}
                            style={{
                              color: "var(--foreground)",
                              fontWeight: 600,
                              textDecoration: "none",
                              fontSize: "0.95rem",
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              whiteSpace: "nowrap",
                              display: "block",
                              maxWidth: "100%",
                            }}
                          >
                            {p.title}
                          </a>
                          <div
                            style={{
                              fontSize: "0.75rem",
                              color: "var(--muted-foreground)",
                              marginTop: "0.1rem",
                            }}
                          >
                            {p.viewCount || 0} 浏览 · {p.commentCount || 0} 评论
                          </div>
                        </div>
                        </motion.div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function useGrouped(posts: TimelinePost[]) {
  const sorted = [...posts].sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
  );
  const years: { year: string; posts: TimelinePost[] }[] = [];
  const map = new Map<string, TimelinePost[]>();
  for (const p of sorted) {
    const y = p.date.slice(0, 4);
    if (!map.has(y)) map.set(y, []);
    map.get(y)!.push(p);
  }
  for (const [year, ps] of map) {
    years.push({ year, posts: ps });
  }
  years.sort((a, b) => Number(b.year) - Number(a.year));
  return years;
}

// "2026-08-12" → "08-12"
function formatMD(iso: string): string {
  return iso.slice(5, 10);
}
