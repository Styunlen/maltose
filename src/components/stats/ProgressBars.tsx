interface ProgressItem {
  label: string;
  count: number;
  percent: number; // 0-100
}

interface ProgressBarsProps {
  items: ProgressItem[];
}

// 分类占比 / 任意占比的横向进度条。条宽按 percent 填充，标签居左、
// 数值居右，纯 CSS 实现。
export default function ProgressBars({ items }: ProgressBarsProps) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem" }}>
      {items.map((it) => (
        <div key={it.label} style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
          <div style={{ width: "6rem", flexShrink: 0, fontSize: "0.82rem", fontWeight: 600 }}>
            {it.label}
          </div>
          <div
            style={{
              flex: 1,
              background: "var(--muted)",
              borderRadius: 9999,
              height: "0.5rem",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                width: `${Math.min(100, Math.max(0, it.percent))}%`,
                background: "var(--primary)",
                height: "100%",
                borderRadius: 9999,
              }}
            />
          </div>
          <div
            style={{
              width: "4.5rem",
              flexShrink: 0,
              textAlign: "right",
              fontSize: "0.78rem",
              color: "var(--muted-foreground)",
            }}
          >
            {it.count.toLocaleString()} · {it.percent}%
          </div>
        </div>
      ))}
    </div>
  );
}
