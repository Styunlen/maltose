import { BlockRendererProps } from "@lib/block/types";
export default function CoreSpace({
  block,
  className,
  children,
}: BlockRendererProps) {
  const { spacerHeight: height } = block.attributes;
  const classNames = [className, "wp-block-spacer"].filter(Boolean).join(" ");
  return (
    <div className={classNames} style={{ height: height ? height : "1em" }}>
      {children}
    </div>
  );
}

CoreSpace.fragments = {
  key: "SpacerBlockFragment",
  entry: `
    fragment SpacerBlockFragment on CoreSpacer {
      attributes {
        spacerHeight: height
        # Alias to solve conflict with image block height attribute
      }
    }
  `,
};

CoreSpace.displayName = "CoreSpacer";
