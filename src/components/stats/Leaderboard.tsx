interface RankItem {
  name: string;
  count: number;
}

interface LeaderboardProps {
  items: RankItem[];
  limit?: number;
}

// 榜单（最勤评论者 / 省份 / 国家）。行内含淡色衬底条（宽度按 count 归一化），
// 名次徽章 + 名称 + 数量，纯 CSS 实现。
export default function Leaderboard({ items, limit = 10 }: LeaderboardProps) {
  const rows = items.slice(0, limit);
  const max = Math.max(1, ...rows.map((r) => r.count));
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
      {rows.map((r, i) => (
        <div
          key={r.name}
          style={{
            position: "relative",
            display: "flex",
            alignItems: "center",
            gap: "0.6rem",
            padding: "0.3rem 0.6rem",
            borderRadius: "calc(var(--radius) - 4px)",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              position: "absolute",
              inset: 0,
              width: `${(r.count / max) * 100}%`,
              background: "color-mix(in oklch, var(--primary) 10%, transparent)",
              borderRadius: "calc(var(--radius) - 4px)",
            }}
          />
          <div
            style={{
              position: "relative",
              width: "1.4rem",
              height: "1.4rem",
              flexShrink: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              borderRadius: 9999,
              fontSize: "0.72rem",
              fontWeight: 700,
              background: i === 0 ? "var(--primary)" : "var(--muted)",
              color: i === 0 ? "var(--primary-foreground)" : "var(--muted-foreground)",
            }}
          >
            {i + 1}
          </div>
          <div style={{ position: "relative", flex: 1, fontSize: "0.85rem", fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {r.name}
          </div>
          <div style={{ position: "relative", fontSize: "0.78rem", color: "var(--muted-foreground)", flexShrink: 0 }}>
            {r.count.toLocaleString()}
          </div>
        </div>
      ))}
    </div>
  );
}
