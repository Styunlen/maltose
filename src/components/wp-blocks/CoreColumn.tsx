import type { ColumnBlock, BlockRendererProps } from "@lib/blocks/types";

export default function CoreColumn({
  block,
  className,
  children,
}: BlockRendererProps) {
  const columnBlock = block as ColumnBlock;
  const { width, verticalAlignment } = columnBlock.attributes;

  // Calculate width classes based on column count and width attribute
  const getWidthClass = () => {
    if (width) {
      // If explicit width is set (e.g., "33.33%", "50%")
      if (typeof width === "string" && width.includes("%")) {
        const percentage = parseInt(width);
        if (percentage >= 100) return "w-full";
        if (percentage >= 70) return "w-full md:w-3/4";
        if (percentage >= 50) return "w-full md:w-1/2";
        if (percentage >= 33) return "w-full md:w-1/3";
        if (percentage >= 25) return "w-full md:w-1/4";
        return "w-full md:flex-1";
      }
    }
    // Default: flexible width
    return "w-full md:flex-1";
  };

  const columnClass = [
    className,
    "wp-block-column",
    "px-2", // padding for column gutters
    getWidthClass(),
    "min-w-0", // prevent overflow issues
    verticalAlignment && `is-vertically-aligned-${verticalAlignment}`,
  ]
    .filter(Boolean)
    .join(" ");

  return (
      <div className={columnClass}>
        <div className="h-full p-3 bg-card/50 rounded-xl border border-border/40">{children}</div>
      </div>
  );
}

CoreColumn.fragments = {
  key: "ColumnBlockFragment",
  entry: `
    fragment ColumnBlockFragment on CoreColumn {
      attributes {
        cssClassName
        width
        style
        verticalAlignment
      }
    }
  `,
};

CoreColumn.displayName = "CoreColumn";
