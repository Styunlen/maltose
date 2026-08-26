interface ProgressItem {
  label: string;
  count: number;
  percent: number; // 0-100
}

interface ProgressBarsProps {
  items: ProgressItem[];
}

// 分类占比 / 任意占比的横向进度条。条宽按 percent 填充（用于视觉对比），
// 标签居左、数量居右。刻意不显示百分比数字——percent 是相对最大值的
// 归一化比例，写成 % 会误导用户以为它是真实占比（见 timeline/stats 页）。
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
              fontSize: "0.9rem",
              fontWeight: 700,
              color: "var(--foreground)",
              fontVariantNumeric: "tabular-nums",
            }}
          >
            {it.count.toLocaleString()} 篇
          </div>
        </div>
      ))}
    </div>
  );
}
