import { useMemo, useState } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface DayCell {
  date: string; // YYYY-MM-DD
  count: number;
}

interface GitHubCalendarProps {
  posts: { date: string }[];
}

// GitHub-style contribution heatmap (53 weeks x 7 days) with year selection.
// Recent years get quick buttons; older years go in a Select dropdown.
// Generated from post publish dates; color intensity maps to posts per day.
export default function GitHubCalendar({ posts }: GitHubCalendarProps) {
  const [hovered, setHovered] = useState<DayCell | null>(null);
  const [year, setYear] = useState<number | "all">("all");

  const years = useMemo(() => {
    const set = new Set<number>();
    for (const p of posts) {
      const y = Number(p.date.slice(0, 4));
      if (!Number.isNaN(y)) set.add(y);
    }
    return [...set].sort((a, b) => b - a);
  }, [posts]);

  const selectedYear = year === "all" ? years[0] : year;

  const weeks = useMemo(
    () => buildWeeks(posts, selectedYear),
    [posts, selectedYear],
  );

  const recentYears = years.slice(0, 3);
  const olderYears = years.slice(3);

  const levelClass = (count: number) => {
    if (count === 0) return "timeline-heat-0";
    if (count === 1) return "timeline-heat-1";
    if (count <= 3) return "timeline-heat-2";
    return "timeline-heat-3";
  };

  const yearCount = (y: number) =>
    posts.filter((p) => p.date.startsWith(String(y))).length;

  return (
    <div
      style={{
        position: "relative",
        display: "block",
        maxWidth: "100%",
        overflowX: "auto",
      }}
    >
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "3px",
          padding: "0.75rem",
          background: "var(--card)",
          border: "1px solid var(--border)",
          borderRadius: "var(--radius)",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "0.75rem",
            marginBottom: "0.5rem",
            flexWrap: "wrap",
          }}
        >
          <div
            style={{
              fontSize: "0.85rem",
              fontWeight: 600,
              color: "var(--foreground)",
            }}
          >
            写作热力图
            <span
              style={{
                marginLeft: "0.5rem",
                fontSize: "0.72rem",
                color: "var(--muted-foreground)",
                fontWeight: 400,
              }}
            >
              {selectedYear} 年 · {yearCount(selectedYear)} 篇文章
            </span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
            {recentYears.map((y) => (
              <button
                key={y}
                type="button"
                onClick={() => setYear(y)}
                style={{
                  padding: "0.2rem 0.6rem",
                  fontSize: "0.78rem",
                  fontWeight: 600,
                  borderRadius: 9999,
                  border:
                    selectedYear === y
                      ? "1px solid var(--primary)"
                      : "1px solid var(--border)",
                  background:
                    selectedYear === y
                      ? "color-mix(in oklch, var(--primary) 12%, transparent)"
                      : "transparent",
                  color:
                    selectedYear === y ? "var(--primary)" : "var(--muted-foreground)",
                  cursor: "pointer",
                }}
              >
                {y}
              </button>
            ))}
            {olderYears.length > 0 && (
              <Select
                value={String(selectedYear)}
                onValueChange={(v) => setYear(Number(v))}
              >
                <SelectTrigger style={{ height: 26, fontSize: "0.78rem", padding: "0 0.5rem" }}>
                  <SelectValue placeholder="更早年份" />
                </SelectTrigger>
                <SelectContent>
                  {olderYears.map((y) => (
                    <SelectItem key={y} value={String(y)}>
                      {y}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: "3px" }}>
          {[0, 1, 2, 3, 4, 5, 6].map((row) => (
            <div key={row} style={{ display: "flex", gap: "3px" }}>
              {weeks.map((week, wi) => {
                const cell = week[row];
                return (
                  <div
                    key={wi}
                    className={`timeline-heat-cell ${cell ? levelClass(cell.count) : "timeline-heat-0"}`}
                    onMouseEnter={() => cell && setHovered(cell)}
                    onMouseLeave={() => setHovered(null)}
                    style={{
                      width: 12,
                      height: 12,
                      borderRadius: 2,
                      cursor: cell ? "pointer" : "default",
                    }}
                  />
                );
              })}
            </div>
          ))}
        </div>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "flex-end",
            gap: "0.25rem",
            marginTop: "0.5rem",
            fontSize: "0.7rem",
            color: "var(--muted-foreground)",
          }}
        >
          <span>少</span>
          {["timeline-heat-0", "timeline-heat-1", "timeline-heat-2", "timeline-heat-3"].map(
            (cls) => (
              <span key={cls} className={cls} style={{ width: 10, height: 10, borderRadius: 2, display: "inline-block" }} />
            ),
          )}
          <span>多</span>
        </div>
      </div>
      {hovered && (
        <div
          style={{
            position: "absolute",
            bottom: "calc(100% - 0.5rem)",
            left: "50%",
            transform: "translateX(-50%)",
            background: "var(--foreground)",
            color: "var(--background)",
            padding: "0.25rem 0.6rem",
            borderRadius: "var(--radius)",
            fontSize: "0.72rem",
            whiteSpace: "nowrap",
            zIndex: 10,
            pointerEvents: "none",
          }}
        >
          {hovered.date} · {hovered.count} 篇文章
        </div>
      )}
      <style>{`
        .timeline-heat-cell { transition: transform 0.15s ease; }
        .timeline-heat-cell:hover { transform: scale(1.3); }
        .timeline-heat-0 { background: var(--muted); }
        .timeline-heat-1 { background: color-mix(in oklch, var(--primary) 25%, var(--muted)); }
        .timeline-heat-2 { background: color-mix(in oklch, var(--primary) 55%, var(--muted)); }
        .timeline-heat-3 { background: var(--primary); }
      `}</style>
    </div>
  );
}

// Build a 53x7 week matrix for a specific year (Jan 1 – Dec 31).
function buildWeeks(posts: { date: string }[], year: number): (DayCell | null)[][] {
  const byDay = new Map<string, number>();
  const yearPrefix = `${year}-`;
  for (const p of posts) {
    if (!p.date.startsWith(yearPrefix)) continue;
    const d = p.date.slice(0, 10);
    byDay.set(d, (byDay.get(d) || 0) + 1);
  }

  const start = new Date(year, 0, 1); // Jan 1
  const end = new Date(year, 11, 31); // Dec 31
  start.setHours(0, 0, 0, 0);
  end.setHours(0, 0, 0, 0);

  const weeks: (DayCell | null)[][] = [];
  const cur = new Date(start);
  while (cur <= end) {
    const week: (DayCell | null)[] = [];
    for (let r = 0; r < 7; r++) {
      if (cur > end) {
        week.push(null);
        break;
      }
      const iso = cur.toISOString().slice(0, 10);
      const count = byDay.get(iso) || 0;
      week.push({ date: iso, count });
      cur.setDate(cur.getDate() + 1);
    }
    // pad to 7 rows
    while (week.length < 7) week.push(null);
    weeks.push(week);
  }
  return weeks;
}
