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
  dataBlockId,
  commentsByBlock,
  onCommentClick,
}: BlockRendererProps) {
  if (inVisibleBlockTypes.includes(block.type)) {
    return <></>;
  }

  const Component = blockRendererMap[block.type] || UnsupportedBlock;

  // Handle nested blocks
  let children: React.ReactNode = null;
  if (block.innerBlocks && block.innerBlocks.length > 0) {
    children = (
      <WordPressBlocks
        blocks={block.innerBlocks}
        noWrapper={true}
        commentsByBlock={commentsByBlock}
        onCommentClick={onCommentClick}
      />
    );
  }

  // Paragraph-comment anchor (ADR-0036 P3): commentable block types get a
  // data-block-id hook + hover affordance + count badge. Anchor lives on the
  // wrapper so nested list items are also targetable.
  // Leaf/composite blocks (paragraph, list item) anchor per-instance; blocks
  // whose content is a raw HTML string (quote value / html content / table /
  // code / preformatted) anchor as a whole block. Nested CoreParagraph inside
  // a quote becomes independently anchorable once parentClientId is fixed.
  const COMMENTABLE_TYPES = new Set([
    "CoreParagraph",
    "CoreListItem",
    "CoreQuote",
    "CorePullquote",
    "CoreHtml",
    "CoreFreeform",
    "CoreTable",
    "CoreCode",
    "CorePreformatted",
  ]);
  const commentable = dataBlockId && COMMENTABLE_TYPES.has(block.type);
  const count = commentable && commentsByBlock ? (commentsByBlock[dataBlockId] ?? 0) : 0;

  const wrapperProps = commentable
    ? {
        "data-block-id": dataBlockId,
        "data-comment-count": count > 0 ? String(count) : undefined,
      }
    : {};

  const commentAffordance = commentable ? (
    <button
      type="button"
      className="block-comment-trigger"
      aria-label={`评论这段${count > 0 ? `（${count} 条）` : ""}`}
      data-comment-trigger
      // No React onClick here: ParagraphComments handles the click via
      // document-level delegation so the affordance works even if this block
      // renders outside the ParagraphComments island subtree.
    >
      <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
      </svg>
      {count > 0 ? <span className="block-comment-count">{count}</span> : null}
    </button>
  ) : null;

  if (noWrapper && commentable) {
    // Nested list item: wrap in a lightweight host so the anchor + affordance
    // still render without disturbing the list structure.
    return (
      <span className="block-comment-host block-comment-host--inline" {...wrapperProps}>
        {commentAffordance}
        <Component
          block={block}
          className={[className, "wp-block-no-wrapper", "my-2"]
            .filter(Boolean)
            .join(" ")}
        >
          {children}
        </Component>
      </span>
    );
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
    <div className="wp-block-wrapper my-8 block-comment-host" {...wrapperProps}>
      {commentAffordance}
      <Component block={block} className={className}>
        {children}
      </Component>
    </div>
  );
}
