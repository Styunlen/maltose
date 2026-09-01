import React, { Children } from "react";
import type { ColumnsBlock, BlockRendererProps } from "@lib/blocks/types";
import { gql } from "@apollo/client";

export default function CoreColumns({
  block,
  className,
  children,
}: BlockRendererProps) {
  const columnsBlock = block as ColumnsBlock;
  const { isStackedOnMobile = true, verticalAlignment } =
    columnsBlock.attributes;

  // Count actual column children by checking if they have wp-block-column class
  const childrenArray = Children.toArray(children);
  let columnCount = 0;

  childrenArray.forEach((child) => {
    if (React.isValidElement(child)) {
      const element = child as React.ReactElement<{ className?: string }>;
      if (
        element.props &&
        typeof element.props.className === "string" &&
        element.props.className.includes("wp-block-column")
      ) {
        columnCount++;
      }
    }
  });

  if (columnCount === 0) columnCount = 1; // fallback

  // Calculate responsive classes
  const baseClasses = [
    "wp-block-columns",
    "flex",
    "min-w-0",
    "max-w-full", // in grid parents, -mx-2 would overflow the track
    "gap-4",
    "md:gap-6",
  ];

  // Handle stacking behavior.
  // flex-col + flex-wrap would lay each 100%-wide column out on its own
  // "line" that wraps to the NEXT ROW, i.e. pushes subsequent columns to the
  // right — overflowing the container on mobile. Only wrap in row mode.
  if (isStackedOnMobile) {
    baseClasses.push("flex-col", "md:flex-row", "md:flex-wrap");
  } else {
    baseClasses.push("flex-row", "flex-wrap");
  }

  // Handle vertical alignment.
  // `verticalAlignment` is WP's "vertical" axis (row direction = align-items).
  // On mobile the columns stack to flex-column, where that axis becomes the
  // cross axis of the WRAPPED row — align-items:center then centers each
  // column horizontally, which combined with width:100% children pushes them
  // past the container (observed as right-side overflow on mobile). So:
  //   - mobile (flex-col): stretch columns to full width, center via justify
  //   - desktop (md:flex-row): align-items = the WP vertical alignment
  if (verticalAlignment) {
    const alignmentMap: Record<string, string> = {
      top: "justify-start md:items-start",
      center: "justify-center md:items-center",
      bottom: "justify-end md:items-end",
      "space-between": "justify-between md:items-stretch",
    };
    baseClasses.push(
      alignmentMap[verticalAlignment] || `md:items-${verticalAlignment}`,
    );
  }

  const finalClass = [
    className,
    ...baseClasses,
    !isStackedOnMobile ? "is-not-stacked-on-mobile" : "",
    verticalAlignment ? `is-vertically-aligned-${verticalAlignment}` : "",
  ]
    .filter(Boolean)
    .join(" ");

  return <div className={finalClass}>{children}</div>;
}

CoreColumns.fragments = {
  key: "ColumnsBlockFragment",
  entry: `
    fragment ColumnsBlockFragment on CoreColumns {
      attributes {
        cssClassName
        isStackedOnMobile
        verticalAlignment
        style
      }
    }
  `,
};

CoreColumns.displayName = "CoreColumns";
