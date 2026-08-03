import React, { useEffect } from "react";
import type { SupportedBlock, BlockRendererProps } from "@lib/blocks/types";
import WordPressBlocks from "./WordPressBlocks";

// Core block components
import wpBlocks from "./wp-blocks/";
import UnsupportedBlock from "./wp-blocks/Unsupported";
interface BlockRendererMap {
  [key: string]: React.ComponentType<any>;
}

const blockRendererMap: BlockRendererMap = {};
const inVisibleBlockTypes = [
  // Add block types here to hide them from the block renderer
  // e.g., "CoreSeparator", "CoreMore"
  "CoreMore",
  "CoreNextpage",
];
// Leave empty to render all block types
// Or add specific block types to debug
// const debugFilterBlockTypes = new Set(["CoreList", "CoreListItem"]);
const debugFilterBlockTypes = new Set([]);

Object.entries(wpBlocks).forEach(([key, Component]: [string, any]) => {
  if (
    debugFilterBlockTypes.size > 0 &&
    (Array.isArray(Component?.displayName ?? undefined)
      ? (Component.displayName as string[]).every(
          (item) => !debugFilterBlockTypes.has(item),
        )
      : !debugFilterBlockTypes.has(Component.displayName ?? key))
  ) {
    return;
  }
  // Support multiple display names for a single component
  if (Array.isArray(Component.displayName)) {
    Component.displayName.forEach((name: string) => {
      blockRendererMap[name] = Component;
    });
  } else {
    const displayName = (Component.displayName as string) || key;
    blockRendererMap[displayName] = Component;
  }
});

export default function BlockRenderer({
  block,
  className,
  noWrapper = false,
}: BlockRendererProps) {
  if (inVisibleBlockTypes.includes(block.type)) {
    return <></>;
  }

  const Component = blockRendererMap[block.type] || UnsupportedBlock;

  // Handle nested blocks
  let children: React.ReactNode = null;
  if (block.innerBlocks && block.innerBlocks.length > 0) {
    children = <WordPressBlocks blocks={block.innerBlocks} noWrapper={true} />;
  }

  return noWrapper ? (
    <Component
      block={block}
      className={[className, "wp-block-no-wrapper", "my-2"]
        .filter(Boolean)
        .join(" ")}
    >
      {children}
    </Component>
  ) : (
    <div className="wp-block-wrapper my-8">
      <Component block={block} className={className}>
        {children}
      </Component>
    </div>
  );
}
