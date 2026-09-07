import React from "react";
import type { ParagraphBlock, BlockRendererProps } from "@lib/blocks/types";
import { gql } from "@apollo/client";

export default function CoreParagraph({
  block,
  className,
  commentTail,
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

  // With an inline comment tail, the content must be wrapped in a <span> so
  // the button can follow it inside the same <p> text flow (React forbids
  // children next to dangerouslySetInnerHTML on one element). Content is
  // phrasing-only in practice (see ADR-0036); the span keeps it in-flow.
  if (commentTail) {
    return (
      <p className={paragraphClass}>
        <span
          dangerouslySetInnerHTML={{ __html: content }}
          suppressHydrationWarning={true}
        />
        {commentTail}
      </p>
    );
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
