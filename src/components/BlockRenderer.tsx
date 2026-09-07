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
    "CoreImage",
  ]);
  const commentable = dataBlockId && COMMENTABLE_TYPES.has(block.type);
  const count = commentable && commentsByBlock ? (commentsByBlock[dataBlockId] ?? 0) : 0;

  // Leaf text blocks with a clean React text flow (CoreParagraph) get the
  // affordance rendered as an inline tail inside their own text (end-of-last-
  // line placement, all devices — ADR-0036 2026-09). Container blocks whose
  // content is a raw HTML string (quote/table/code/html/pre…) are commented on
  // as a WHOLE: their chip stays as an overlay at the host's top-right, and
  // showing the chip also outlines the whole container so the user sees the
  // comment applies to the entire block (ADR-0036 2026-09-07).
  const INLINE_TAIL_TYPES = new Set(["CoreParagraph", "CoreListItem"]);
  const useInlineTail = commentable && INLINE_TAIL_TYPES.has(block.type);

  const wrapperProps = commentable
    ? {
        "data-block-id": dataBlockId,
        "data-comment-count": count > 0 ? String(count) : undefined,
      }
    : {};
  const hostClass = commentable
    ? useInlineTail
      ? "wp-block-wrapper my-8 block-comment-host block-comment-host--inline-tail"
      : "wp-block-wrapper my-8 block-comment-host block-comment-host--block"
    : "wp-block-wrapper my-8";

  const chipClass = useInlineTail
    ? "block-comment-trigger block-comment-trigger--inline"
    : "block-comment-trigger";

  // Two affordance shapes (ADR-0036 2026-09-07):
  // - Inline-tail chips are a COMPACT single SVG: a rounded-square bubble with
  //   the count rendered as SVG <text> inside it. Zero-width anchor keeps it
  //   from wrapping to its own line; ~14px keeps any right overflow tiny.
  // - Whole-block/list overlay chips keep the pill (border + bg + span count).
  const countText = count > 0 ? String(count) : null;
  const inlineIcon = (
    <svg
      viewBox="0 0 24 24"
      width="15"
      height="15"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
      {countText && (
        <text
          x="12"
          y="10"
          textAnchor="middle"
          dominantBaseline="central"
          fontSize={countText.length >= 3 ? 6.5 : countText.length === 2 ? 7.5 : 9}
          fontWeight="600"
          fill="currentColor"
          stroke="none"
          style={{ fontFamily: "inherit" }}
        >
          {countText}
        </text>
      )}
    </svg>
  );
  const overlayIcon = (
    <>
      <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
      </svg>
      {count > 0 ? <span className="block-comment-count">{count}</span> : null}
    </>
  );

  const chipButton = commentable ? (
    <button
      type="button"
      className={chipClass}
      aria-label={`评论这段${count > 0 ? `（${count} 条）` : ""}`}
      data-comment-trigger
      // No React onClick here: ParagraphComments handles the click via
      // document-level delegation so the affordance works even if this block
      // renders outside the ParagraphComments island subtree.
    >
      {useInlineTail ? inlineIcon : overlayIcon}
    </button>
  ) : null;

  // Inline-tail chips sit inside a zero-width inline-block anchor: the line
  // box measures the anchor as 0 wide, so a full text line never pushes the
  // chip to its own line; the chip paints just right of the anchor (the text
  // end) and may overflow the container a few px. Whole-block/list chips are
  // used directly (they are not text-flow members).
  const commentAffordance = useInlineTail ? (
    <span className="block-comment-anchor">{chipButton}</span>
  ) : (
    chipButton
  );

  // Inline-tail leaf blocks (paragraph / list item) consume the affordance via
  // commentTail inside their own text flow; other commentable blocks render it
  // as a wrapper sibling (as before).
  const componentProps = {
    block,
    commentTail: useInlineTail ? commentAffordance : undefined,
  };

  if (noWrapper && commentable) {
    // Nested in a container block (columns, group, …). Leaf text blocks
    // (paragraph / list item) keep a lightweight span host so the affordance
    // rides their text flow without disturbing the surrounding structure.
    // Whole-block types (quote/table/code/image/…) must still get the --block
    // div host even when nested — otherwise they lose the top-right chip and
    // the highlight frame (ADR-0036 2026-09-07).
    if (useInlineTail) {
      return (
        <span
          className="block-comment-host block-comment-host--inline block-comment-host--inline-tail"
          {...wrapperProps}
        >
          <Component
            block={block}
            className={[className, "wp-block-no-wrapper", "my-2"]
              .filter(Boolean)
              .join(" ")}
            commentTail={commentAffordance}
          >
            {children}
          </Component>
        </span>
      );
    }
    return (
      <div
        className="block-comment-host block-comment-host--block"
        {...wrapperProps}
      >
        {commentAffordance}
        <Component
          block={block}
          className={[className, "wp-block-no-wrapper", "my-2"]
            .filter(Boolean)
            .join(" ")}
        >
          {children}
        </Component>
      </div>
    );
  }

  return noWrapper ? (
    <Component
      block={block}
      className={[className, "wp-block-no-wrapper", "my-2"]
        .filter(Boolean)
        .join(" ")}
      {...componentProps}
    >
      {children}
    </Component>
  ) : (
    <div className={hostClass} {...wrapperProps}>
      {/* Whole-block hosts (--block) show their chip as an absolute overlay at
          the host's top-right; inline-tail leaf blocks consumed theirs via
          commentTail above so nothing extra renders for them here. */}
      {commentable && !useInlineTail ? commentAffordance : null}
      <Component block={block} className={className} {...componentProps}>
        {children}
      </Component>
    </div>
  );
}
