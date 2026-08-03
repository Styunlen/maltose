import type { BlockRendererProps } from "@lib/blocks/types";

export default function CoreButtons({
  className,
  children,
}: BlockRendererProps) {
  return (
    <div
      className={`wp-block-buttons ${className || ""}`}
      style={{
        display: "flex",
        flexWrap: "wrap",
        gap: "0.75rem",
        margin: "1.25rem 0",
      }}
    >
      {children}
    </div>
  );
}

CoreButtons.fragments = {
  key: "ButtonsBlockFragment",
  entry: `
    fragment ButtonsBlockFragment on CoreButtons {
      attributes {
        cssClassName
      }
    }
  `,
};

CoreButtons.displayName = "CoreButtons";
