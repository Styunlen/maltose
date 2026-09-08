import type { BlockRendererProps } from "@lib/blocks/types";

export default function CoreListItem({
  block,
  className,
  children,
  endAdornment,
  rootProps,
}: BlockRendererProps) {
  let content = block.attributes?.content || (block as any).renderedHtml || "";
  // console.log("Rendering CoreListItem with content:", content);

  // When children (innerBlocks) exist, WordPress embeds the nested list HTML
  // AND trailing duplicate text into the content attribute. Keep only the
  // text before the first nested <ul> or <ol> — children render the rest.
  if (children) {
    const listStart = content.search(/<(ul|ol)\b[^>]*>/i);
    if (listStart >= 0) {
      content = content.slice(0, listStart).trim();
    }
  }
  // console.log(content);

  return (
    <li className={className} {...rootProps}>
      {content && <span dangerouslySetInnerHTML={{ __html: content }} />}
      {/* The trailing-control slot follows the item's text (before any nested
          list) so the affordance sits at the end of the line, matching
          paragraph behaviour. */}
      {endAdornment}
      {children}
    </li>
  );
}
CoreListItem.fragments = {
  key: "ListItemBlockFragment",
  entry: `
    fragment ListItemBlockFragment on CoreListItem {
      attributes {
        content
      }
    }
  `,
};
CoreListItem.displayName = "CoreListItem";
