import React from "react";
import type { ImageBlock, BlockRendererProps } from "@lib/blocks/types";
import { gql } from "@apollo/client";
import { LAZY_PLACEHOLDER } from "../../lib/lazy";
import { sanitizeHtml } from "@/lib/sanitize";

export default function CoreImage({ block, className }: BlockRendererProps) {
  const imageBlock = block as ImageBlock;
  const { url, alt, caption, href, width, height, sizeSlug } =
    imageBlock.attributes;

  // className 中已经存在 size-${sizeSlug} 类名了
  // const imgClass = [className, sizeSlug ? `size-${sizeSlug}` : ""]
  //   .filter(Boolean)
  //   .join(" ");
  const imgClass = className;

  const imageElement = (
    <img
      src={LAZY_PLACEHOLDER}
      data-src={url}
      alt={alt || ""}
      width={width}
      height={height}
      className="lazy-img"
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
