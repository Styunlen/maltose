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
