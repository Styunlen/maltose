import React from "react";
import type { GroupBlock, BlockRendererProps } from "@lib/blocks/types";
import { gql } from "@apollo/client";

export default function CoreGroup({
  block,
  className,
  children,
}: BlockRendererProps) {
  const groupBlock = block as GroupBlock;
  const { tagName = "div" } = groupBlock.attributes;

  const Tag = tagName as React.ElementType;
  const groupClass = [className, "wp-block-group"].filter(Boolean).join(" ");

  return (
      <Tag className={groupClass}>{children}</Tag>
  );
}

CoreGroup.fragments = {
  key: "GroupBlockFragment",
  entry: `
    fragment GroupBlockFragment on CoreGroup {
      attributes {
        cssClassName
        tagName
        layout
        style
      }
    }
  `,
};

CoreGroup.displayName = "CoreGroup";
