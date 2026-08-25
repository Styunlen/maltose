import React from "react";
import type { BlockRendererProps } from "@lib/blocks/types";

export default function CoreSeparator({
  block,
  className,
}: BlockRendererProps) {
  const opacity = block.attributes?.opacity;
  const classNames = [
    className,
    "wp-block-separator",
    "has-alpha-channel-opacity",
    "my-8",
  ]
    .filter(Boolean)
    .join(" ");

  // opacity=true → 半透明弱化分隔线；否则纯色分隔线。
  return (
    <hr
      className={classNames}
      style={opacity ? { opacity: 0.3 } : undefined}
      aria-hidden="true"
    />
  );
}

CoreSeparator.fragments = {
  key: "SeparatorBlockFragment",
  entry: `
    fragment SeparatorBlockFragment on CoreSeparator {
      attributes {
        opacity
        cssClassName
      }
    }
  `,
};

CoreSeparator.displayName = "CoreSeparator";
