import React from "react";
import type { ListBlock, BlockRendererProps } from "@lib/blocks/types";
import { gql } from "@apollo/client";
import { sanitizeHtml } from "@/lib/sanitize";

export default function CoreList({
  block,
  className,
  children,
}: BlockRendererProps) {
  const listBlock = block as ListBlock;
  // console.log(JSON.stringify(listBlock, null, 2));
  // console.log(listBlock);
  // console.log(className);
  const { ordered, values } = listBlock.attributes;

  const Tag = ordered ? "ol" : "ul";

  // If there are innerBlocks (passed as children), render them instead of using dangerous HTML
  if (children) {
    return <Tag className={className}>{children}</Tag>;
  }

  // Parse the values string into list items
  // WordPress stores list as HTML string in values attribute
  return (
    <Tag
      className={className}
      dangerouslySetInnerHTML={{ __html: sanitizeHtml(listBlock.renderedHtml) }}
    />
  );
}

CoreList.fragments = {
  key: "ListBlockFragment",
  entry: `
    fragment ListBlockFragment on CoreList {
      attributes {
        cssClassName
        ordered
        values
        reversed
        start
        type
      }
    }
  `,
};

CoreList.displayName = "CoreList";
