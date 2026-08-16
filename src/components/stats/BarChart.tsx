interface BarDatum {
  label: string; // 柱底标签（日期/年份）
  value: number;
  title?: string; // hover 提示
}

interface BarChartProps {
  data: BarDatum[];
  height?: number;
}

// 纯 CSS 柱状图。柱高按 max 归一化，用 --primary 与 --muted 两级配色，
// 不引入任何图表库（ADR-0026 决策 5）。
export default function BarChart({ data, height = 160 }: BarChartProps) {
  const max = Math.max(1, ...data.map((d) => d.value));
  return (
    <div
      style={{
        display: "flex",
        alignItems: "flex-end",
        gap: "4px",
        height,
        padding: "0.5rem 0.25rem 0",
      }}
    >
      {data.map((d, i) => {
        const ratio = d.value / max;
        const isLast = i === data.length - 1;
        return (
          <div
            key={`${d.label}-${i}`}
            style={{
              flex: "1 1 0",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "flex-end",
              height: "100%",
              minWidth: 0,
            }}
            title={d.title ?? `${d.label} · ${d.value}`}
          >
            <div
              style={{
                width: "100%",
                height: `${Math.max(ratio * 100, 2)}%`,
                background: isLast
                  ? "var(--primary)"
                  : "color-mix(in oklch, var(--primary) 45%, var(--muted))",
                borderRadius: "3px 3px 0 0",
                transition: "height 0.2s ease",
              }}
            />
          </div>
        );
      })}
    </div>
  );
}
