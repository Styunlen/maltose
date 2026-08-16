interface StatCardsProps {
  runningDays: number;
  totalPosts: number;
  totalWords: number;
  totalComments: number;
  avgInterval: number; // 平均更新间隔（天/篇）
}

// 站点核心指标卡片。复用 timeline StatsCards 的视觉语言（CSS 变量 +
// 圆角卡片网格），无图表库依赖。
export default function StatCards({
  runningDays,
  totalPosts,
  totalWords,
  totalComments,
  avgInterval,
}: StatCardsProps) {
  const cards = [
    { label: "已运行天数", value: runningDays.toLocaleString() },
    { label: "文章总数", value: totalPosts.toLocaleString() },
    { label: "累计字数", value: totalWords.toLocaleString() },
    { label: "评论总数", value: totalComments.toLocaleString() },
    { label: "平均更新间隔", value: avgInterval > 0 ? `${avgInterval.toFixed(1)} 天` : "—" },
  ];

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))",
        gap: "0.75rem",
        margin: "1.25rem 0",
      }}
    >
      {cards.map((c) => (
        <div
          key={c.label}
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
            {c.value}
          </div>
          <div
            style={{
              fontSize: "0.78rem",
              color: "var(--muted-foreground)",
              marginTop: "0.15rem",
            }}
          >
            {c.label}
          </div>
        </div>
      ))}
    </div>
  );
}
