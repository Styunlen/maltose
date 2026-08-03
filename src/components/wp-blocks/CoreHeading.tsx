import React, { JSX } from "react";
import type { HeadingBlock, BlockRendererProps } from "@lib/blocks/types";

// Article heading sizes (Tailwind font-size utilities), tuned for readability
// inside post content rather than hero sections.
const HEADING_SIZES: Record<number, string> = {
  1: "text-3xl",
  2: "text-2xl",
  3: "text-xl",
  4: "text-lg",
  5: "text-base",
  6: "text-sm",
};

export default function CoreHeading({ block, className }: BlockRendererProps) {
  const headingBlock = block as HeadingBlock;
  const { content, level, textAlign } = headingBlock.attributes;
  const HeadingLevel = Math.min(Math.max(level, 1), 6); // Ensure level is between 1 and 6
  const HeadingTag = `h${HeadingLevel}` as keyof JSX.IntrinsicElements;
  const style: React.CSSProperties = {};
  if (textAlign) {
    style.textAlign = textAlign;
  }

  // Stable anchor id from the heading text for in-page navigation / TOC.
  const anchorId = (content || "")
    .replace(/<[^>]*>/g, "")
    .trim()
    .toLowerCase()
    .replace(/[^\w\u4e00-\u9fa5]+/g, "-")
    .replace(/^-+|-+$/g, "");

  const headingClass = [
    className,
    textAlign ? `has-text-align-${textAlign}` : "",
    HEADING_SIZES[HeadingLevel] || "text-lg",
    "font-bold",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <HeadingTag
      id={anchorId || undefined}
      className={headingClass}
      style={style}
      dangerouslySetInnerHTML={{ __html: content }}
    />
  );
}

CoreHeading.fragments = {
  key: "HeadingBlockFragment",
  entry: `
    fragment HeadingBlockFragment on CoreHeading {
      attributes {
        cssClassName
        content
        level
        align
      }
    }
  `,
};

CoreHeading.displayName = "CoreHeading";
