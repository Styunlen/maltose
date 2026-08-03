import type { ButtonBlock, BlockRendererProps } from "@lib/blocks/types";

export default function CoreButton({
  block,
  className,
  children,
}: BlockRendererProps) {
  const buttonBlock = block as ButtonBlock;
  const { text, url, linkTarget, rel } = buttonBlock.attributes;

  const Tag = url ? "a" : "span";
  const tagProps: any = url
    ? { href: url, target: linkTarget || undefined, rel: rel || undefined }
    : {};

  return (
    <Tag
      {...tagProps}
      className={`wp-block-button__link ${className || ""}`}
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "0.6rem 1.4rem",
        fontSize: "0.9rem",
        fontWeight: 600,
        color: "#000",
        background: "var(--primary)",
        border: "none",
        borderRadius: "var(--radius)",
        textDecoration: "none",
        cursor: url ? "pointer" : "default",
        transition: "all 0.2s ease",
      }}
    >
      <span dangerouslySetInnerHTML={{ __html: text || "" }} />
      {children}
    </Tag>
  );
}

CoreButton.fragments = {
  key: "ButtonBlockFragment",
  entry: `
    fragment ButtonBlockFragment on CoreButton {
      attributes {
        text
        url
        linkTarget
        rel
        cssClassName
      }
    }
  `,
};

CoreButton.displayName = "CoreButton";
