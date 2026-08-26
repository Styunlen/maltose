import type { ColumnBlock, BlockRendererProps } from "@lib/blocks/types";

export default function CoreColumn({
  block,
  className,
  children,
}: BlockRendererProps) {
  const columnBlock = block as ColumnBlock;
  const { width, verticalAlignment } = columnBlock.attributes;

  // Calculate width classes based on column count and width attribute.
  // On mobile (stacked flex-col) use `basis-full` instead of `w-full`:
  // width:100% inside a grid-item parent resolves against the grid TRACK,
  // not this column's own flex container, so it can overflow the parent
  // (observed as columns pushed past the container edge on mobile).
  const getWidthClass = () => {
    if (width) {
      // If explicit width is set (e.g., "33.33%", "50%")
      if (typeof width === "string" && width.includes("%")) {
        const percentage = parseInt(width);
        if (percentage >= 100) return "basis-full md:w-full";
        if (percentage >= 70) return "basis-full md:w-3/4";
        if (percentage >= 50) return "basis-full md:w-1/2";
        if (percentage >= 33) return "basis-full md:w-1/3";
        if (percentage >= 25) return "basis-full md:w-1/4";
        return "basis-full md:flex-1";
      }
    }
    // Default: flexible width
    return "basis-full md:flex-1";
  };

  // WP's vertical alignment = align-self. On mobile the columns stack
  // (flex-col) where align-self works on the horizontal axis; the WP-rendered
  // is-vertically-aligned-* class values (center/end) would push 100%-wide
  // columns past the container edge. Force stretch on mobile via Tailwind
  // self-stretch (written as literal classes so Tailwind's scanner picks them
  // up), and restore the WP alignment at md: with the matching self-* utility.
  const alignClasses = verticalAlignment
    ? {
        top: "self-stretch md:self-start",
        center: "self-stretch md:self-center",
        bottom: "self-stretch md:self-end",
        stretch: "self-stretch md:self-stretch",
      }[verticalAlignment] || "self-stretch"
    : "self-stretch";

  const columnClass = [
    className,
    "wp-block-column",
    "px-2", // padding for column gutters
    getWidthClass(),
    "min-w-0", // prevent overflow issues
    alignClasses,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={columnClass}>
      <div className="h-full p-3">{children}</div>
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
