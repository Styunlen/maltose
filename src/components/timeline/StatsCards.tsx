import { useMemo } from "react";

interface StatsCardsProps {
  posts: { date: string; viewCount?: number; commentCount?: number }[];
  totalComments: number;
}

// Basic site stats derived from post metadata.
export default function StatsCards({ posts, totalComments }: StatsCardsProps) {
  const stats = useMemo(() => {
    if (posts.length === 0) return null;

    const totalPosts = posts.length;
    const totalViews = posts.reduce((s, p) => s + (p.viewCount || 0), 0);

    const dates = posts
      .map((p) => p.date.slice(0, 10))
      .filter(Boolean)
      .sort();
    const first = dates[0];
    const last = dates[dates.length - 1];
    const daysWriting = first
      ? Math.max(
          1,
          Math.round(
            (new Date(last).getTime() - new Date(first).getTime()) /
              (1000 * 60 * 60 * 24),
          ) + 1,
        )
      : 0;

    const monthSet = new Set(dates.map((d) => d.slice(0, 7)));
    const activeMonths = monthSet.size;

    // Longest consecutive streak of days with >=1 post
    let longest = 0;
    let cur = 0;
    const daySet = new Set(dates);
    const iter = new Date(first);
    const endD = new Date(last);
    while (iter <= endD) {
      const iso = iter.toISOString().slice(0, 10);
      if (daySet.has(iso)) {
        cur++;
        if (cur > longest) longest = cur;
      } else {
        cur = 0;
      }
      iter.setDate(iter.getDate() + 1);
    }

    return [
      { label: "文章", value: totalPosts },
      { label: "评论", value: totalComments },
      { label: "浏览", value: totalViews.toLocaleString() },
      { label: "写作天数", value: daysWriting },
      { label: "活跃月份", value: activeMonths },
      { label: "最长连续", value: `${longest} 天` },
    ];
  }, [posts, totalComments]);

  if (!stats) return null;

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))",
        gap: "0.75rem",
        margin: "1.25rem 0",
      }}
    >
      {stats.map((s) => (
        <div
          key={s.label}
          style={{
            background: "var(--card)",
            border: "1px solid var(--border)",
            borderRadius: "var(--radius)",
            padding: "0.9rem 1rem",
            textAlign: "center",
          }}
        >
          <div
            style={{
              fontSize: "1.35rem",
              fontWeight: 800,
              color: "var(--primary)",
            }}
          >
            {s.value}
          </div>
          <div
            style={{
              fontSize: "0.78rem",
              color: "var(--muted-foreground)",
              marginTop: "0.15rem",
            }}
          >
            {s.label}
          </div>
        </div>
      ))}
    </div>
  );
}
