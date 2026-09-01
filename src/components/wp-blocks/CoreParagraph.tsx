import React from "react";
import type { ParagraphBlock, BlockRendererProps } from "@lib/blocks/types";
import { gql } from "@apollo/client";

export default function CoreParagraph({
  block,
  className,
}: BlockRendererProps) {
  const paragraphBlock = block as ParagraphBlock;
  const { content, dropCap } = paragraphBlock.attributes;

  const paragraphClass = [
    className,
    dropCap ? "has-drop-cap" : "",
    "wp-block-paragraph",
  ]
    .filter(Boolean)
    .join(" ");

  // WP sometimes returns content already wrapped in <p> (e.g. empty or
  // special paragraphs). Rendering that inside an outer <p> creates invalid
  // <p><p> nesting — browsers auto-split it, breaking SSR/client hydration
  // and causing layout height jumps (see ADR-0021 for the same issue).
  const wrappedInP = /^\s*<p[\s>]/i.test(content || "");

  if (wrappedInP) {
    return <div className={paragraphClass} dangerouslySetInnerHTML={{ __html: content }} suppressHydrationWarning={true} />;
  }

  return (
    <p
      className={paragraphClass}
      dangerouslySetInnerHTML={{ __html: content }}
      suppressHydrationWarning={true}
    />
  );
}

CoreParagraph.fragments = {
  key: "ParagraphBlockFragment",
  entry: `
    fragment ParagraphBlockFragment on CoreParagraph {
      attributes {
        cssClassName
        content
        dropCap
      }
    }
  `,
};

CoreParagraph.displayName = "CoreParagraph";
