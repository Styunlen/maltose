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
    "flex-wrap",
    "-mx-2", // negative margin for column gutters
  ];

  // Handle stacking behavior
  if (isStackedOnMobile) {
    baseClasses.push("flex-col", "md:flex-row");
  } else {
    baseClasses.push("flex-row");
  }

  baseClasses.push("gap-4", "md:gap-6");

  // Handle vertical alignment
  if (verticalAlignment) {
    const alignmentMap: Record<string, string> = {
      top: "items-start",
      center: "items-center",
      bottom: "items-end",
      "space-between": "items-stretch",
    };
    baseClasses.push(
      alignmentMap[verticalAlignment] || `items-${verticalAlignment}`,
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
