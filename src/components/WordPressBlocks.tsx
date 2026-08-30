import type { SupportedBlock } from "@lib/blocks/types";
import BlockRenderer from "./BlockRenderer";

interface WordPressBlocksProps {
  blocks: SupportedBlock[];
  className?: string;
  noWrapper?: boolean;
  commentsByBlock?: Record<string, number>;
  onCommentClick?: (clientId: string) => void;
}

export default function WordPressBlocks({
  blocks,
  className,
  noWrapper = false,
  commentsByBlock,
  onCommentClick,
}: WordPressBlocksProps) {
  // console.log("Rendering WordPressBlocks with blocks:", blocks);
  if (!blocks || blocks.length === 0) {
    return <></>;
  }
  // console.log("WordPressBlocks rendering blocks:", blocks);

  const content = blocks.map((block) => {
    // cssClassNames (array at editorBlocks level) = user's custom className merged
    // attributes.cssClassName (per-block attribute) = Gutenberg auto-generated style
    // Both may overlap — deduplicate after merging
    const allClasses = [
      ...((block as any)?.attributes?.cssClassName || "").split(/\s+/),
      ...(block?.cssClassNames || []),
      "wp-block",
    ].filter(Boolean);
    const merged = [...new Set(allClasses)].join(" ");
    return (
      <BlockRenderer
        key={block.clientId}
        block={block}
        className={merged}
        noWrapper={noWrapper}
        dataBlockId={block.clientId}
        commentsByBlock={commentsByBlock}
        onCommentClick={onCommentClick}
      />
    );
  });

  if (noWrapper) {
    return <>{content}</>;
  }

  return (
    <div className={`wp-blocks-container ${className || ""}`}>{content}</div>
  );
}
