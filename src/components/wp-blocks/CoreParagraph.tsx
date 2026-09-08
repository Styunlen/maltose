import React from "react";
import type { ParagraphBlock, BlockRendererProps } from "@lib/blocks/types";
import { gql } from "@apollo/client";

export default function CoreParagraph({
  block,
  className,
  endAdornment,
  rootProps,
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
  // and causing layout height jumps (see ADR-0021 for the same issue). The
  // div root still carries the self-host contract (rootProps + endAdornment)
  // so the paragraph keeps its comment entry point (ADR-0036 rev B).
  const wrappedInP = /^\s*<p[\s>]/i.test(content || "");

  if (wrappedInP) {
    return (
      <div
        className={paragraphClass}
        {...rootProps}
        suppressHydrationWarning={true}
      >
        <div dangerouslySetInnerHTML={{ __html: content }} />
        {endAdornment}
      </div>
    );
  }

  // With an inline comment tail, the content must be wrapped in a <span> so
  // the button can follow it inside the same <p> text flow (React forbids
  // children next to dangerouslySetInnerHTML on one element). Content is
  // phrasing-only in practice (see ADR-0036); the span keeps it in-flow.
  if (endAdornment) {
    return (
      <p className={paragraphClass} {...rootProps}>
        <span
          dangerouslySetInnerHTML={{ __html: content }}
          suppressHydrationWarning={true}
        />
        {endAdornment}
      </p>
    );
  }

  return (
    <p
      className={paragraphClass}
      {...rootProps}
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
