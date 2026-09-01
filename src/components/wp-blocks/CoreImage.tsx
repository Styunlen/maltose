import React from "react";
import type { ImageBlock, BlockRendererProps } from "@lib/blocks/types";
import { gql } from "@apollo/client";
import LazyImage from "@/components/LazyImage";
import { sanitizeHtml } from "@/lib/sanitize";

export default function CoreImage({ block, className }: BlockRendererProps) {
  const imageBlock = block as ImageBlock;
  const { url, alt, caption, href, width, height, sizeSlug } =
    imageBlock.attributes;

  const imgClass = className;

  const imageElement = (
    <LazyImage
      src={url}
      alt={alt || ""}
      width={width}
      height={height}
      className="react-lazy-img"
    />
  );

  let content = imageElement;

  if (href) {
    content = (
      <a href={href} target="_blank" rel="noopener noreferrer">
        {imageElement}
      </a>
    );
  }

  if (caption) {
    content = (
      <>
        {content}
        <figcaption
          className="wp-element-caption bg-muted text-muted-foreground rounded-full px-4 py-1.5 text-sm mt-2 inline-block border border-border/50"
          dangerouslySetInnerHTML={{ __html: sanitizeHtml(caption) }}
        />
      </>
    );
  }

  return (
    <div className="wp-block-image">
      <figure className={imgClass}>{content}</figure>
    </div>
  );
}

CoreImage.fragments = {
  key: "ImageBlockFragment",
  entry: `
    fragment ImageBlockFragment on CoreImage {
      attributes {
        cssClassName
        url
        alt
        caption
        href
        width
        height
        sizeSlug
      }
    }
  `,
};

CoreImage.displayName = "CoreImage";
