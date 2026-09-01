import type { PreformattedBlock, BlockRendererProps } from "@lib/blocks/types";

export default function CorePreformatted({
  block,
  className,
}: BlockRendererProps) {
  const preBlock = block as PreformattedBlock;
  const content = preBlock.attributes?.content || "";

  return (
    <pre
      className={className}
      style={{
        whiteSpace: "pre-wrap",
        wordBreak: "break-word",
        fontFamily: "monospace",
        fontSize: "0.9rem",
        lineHeight: 1.6,
        padding: "1.25rem",
        background: "var(--muted)",
        borderRadius: "var(--radius)",
        border: "1px solid var(--border)",
        color: "var(--foreground)",
      }}
    >
      {content}
    </pre>
  );
}

CorePreformatted.fragments = {
  key: "PreformattedBlockFragment",
  entry: `
    fragment PreformattedBlockFragment on CorePreformatted {
      attributes {
        content
        fontFamily
        fontSize
        style
      }
    }
  `,
};

CorePreformatted.displayName = "CorePreformatted";
