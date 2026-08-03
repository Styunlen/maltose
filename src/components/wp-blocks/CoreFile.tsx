import type { FileBlock, BlockRendererProps } from "@lib/blocks/types";
import { Download } from "lucide-react";

export default function CoreFile({ block, className }: BlockRendererProps) {
  const fileBlock = block as FileBlock;
  const {
    href,
    fileName = "Download",
    showDownloadButton = true,
    downloadButtonText = "Download",
    textLinkHref,
    textLinkTarget,
  } = fileBlock.attributes;

  const linkUrl = textLinkHref || href || "#";
  const isDisabled = !href;

  return (
    <div
      className={`wp-block-file ${className || ""}`}
      style={{
        display: "flex",
        alignItems: "center",
        gap: "1rem",
        padding: "1rem 1.25rem",
        background: "var(--muted)",
        border: "1px solid var(--border)",
        borderRadius: "var(--radius)",
        flexWrap: "wrap",
      }}
    >
      {/* File icon + name link */}
      <a
        href={isDisabled ? undefined : linkUrl}
        target={textLinkTarget || undefined}
        className="wp-block-file__text-link"
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: "0.5rem",
          color: "var(--foreground)",
          textDecoration: "none",
          cursor: isDisabled ? "default" : "pointer",
          opacity: isDisabled ? 0.5 : 1,
        }}
      >
        <Download className="size-4" />
        {fileName}
      </a>

      {showDownloadButton && (
        <a
          href={isDisabled ? undefined : href}
          download={fileName}
          className="wp-block-file__button"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "0.35rem",
            padding: "0.45rem 1rem",
            color: "#000",
            background: "var(--primary)",
            border: "none",
            borderRadius: "var(--radius)",
            textDecoration: "none",
            cursor: isDisabled ? "default" : "pointer",
            opacity: isDisabled ? 0.4 : 1,
            marginLeft: "auto",
            transition: "opacity 0.2s ease",
          }}
        >
          <Download className="size-3.5" />
          {downloadButtonText}
        </a>
      )}
    </div>
  );
}

CoreFile.fragments = {
  key: "FileBlockFragment",
  entry: `
    fragment FileBlockFragment on CoreFile {
      attributes {
        id
        href
        fileName
        textLinkHref
        textLinkTarget
        showDownloadButton
        downloadButtonText
      }
    }
  `,
};

CoreFile.displayName = "CoreFile";
