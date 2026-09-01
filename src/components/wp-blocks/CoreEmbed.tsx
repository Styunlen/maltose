import React from "react";
import type { EmbedBlock, BlockRendererProps } from "@lib/blocks/types";
import { gql } from "@apollo/client";
import { sanitizeHtml } from "@/lib/sanitize";

export default function CoreEmbed({ block, className }: BlockRendererProps) {
  const embedBlock = block as EmbedBlock;
  const { url, caption, allowResponsive } = embedBlock.attributes;

  const embedClass = [
    className,
    "wp-block-embed",
    allowResponsive ? "is-responsive" : "",
  ]
    .filter(Boolean)
    .join(" ");

  // For security, we'll use a simple iframe approach
  // In production, you might want to use a more sophisticated embed system
  // that validates URLs and uses oEmbed

  return (
    <figure className={embedClass}>
      <div className="wp-block-embed__wrapper">
        <iframe src={url} allowFullScreen title="Embedded content" />
      </div>
      {caption && (
        <figcaption
          className="wp-element-caption"
          dangerouslySetInnerHTML={{ __html: sanitizeHtml(caption) }}
        />
      )}
    </figure>
  );
}

CoreEmbed.fragments = {
  key: "EmbedBlockFragment",
  entry: `
    fragment EmbedBlockFragment on CoreEmbed {
      attributes {
        url
        type
        providerNameSlug
        caption
        allowResponsive
      }
    }
  `,
};

CoreEmbed.displayName = "CoreEmbed";
