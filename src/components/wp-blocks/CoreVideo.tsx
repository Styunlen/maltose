"use client";

import { useEffect, useRef } from "react";
import Artplayer from "artplayer";
import type { VideoBlock, BlockRendererProps } from "@lib/blocks/types";
import { sanitizeHtml } from "@/lib/sanitize";

export default function CoreVideo({ block, className }: BlockRendererProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const artRef = useRef<Artplayer | null>(null);

  const videoBlock = block as VideoBlock;
  const {
    src,
    poster,
    caption,
    autoplay = false,
    loop = false,
    muted = false,
    controls = true,
    preload = "metadata",
    playsInline = true,
  } = videoBlock.attributes;

  useEffect(() => {
    if (!containerRef.current || !src) return;

    const options: any = {
      container: containerRef.current,
      url: src,
      poster: poster || "",
      autoplay,
      loop,
      muted,
      preload,
      playsInline,
      theme: "#00f0a0",
      lang: navigator.language.startsWith("zh") ? "zh-cn" : "en",
      pip: true,
      screenshot: true,
      setting: true,
      flip: true,
      playbackRate: true,
      aspectRatio: true,
      fullscreen: true,
      fullscreenWeb: true,
      subtitleOffset: true,
      miniProgressBar: true,
      mutex: true,
      backdrop: true,
      autoPlayback: true,
      airplay: true,
    };

    if (!controls) {
      options.controls = [];
    }

    const art = new Artplayer(options);

    artRef.current = art;

    return () => {
      art.destroy(false);
    };
  }, [src]);

  const wrapperClass = ["wp-block-video", className].filter(Boolean).join(" ");

  return (
    <figure className={wrapperClass}>
      <div
        ref={containerRef}
        className="artplayer-app"
        style={{
          width: "100%",
          maxWidth: 800,
          aspectRatio: "16/9",
          borderRadius: "var(--radius)",
          overflow: "hidden",
          background: "#000",
        }}
        data-src={src}
      />
      {caption && (
        <figcaption
          className="wp-element-caption"
          dangerouslySetInnerHTML={{ __html: sanitizeHtml(caption) }}
          style={{
            textAlign: "center",
            fontSize: "0.85rem",
            color: "var(--muted-foreground)",
            marginTop: "0.5rem",
          }}
        />
      )}
    </figure>
  );
}

CoreVideo.fragments = {
  key: "VideoBlockFragment",
  entry: `
    fragment VideoBlockFragment on CoreVideo {
      attributes {
        src
        id
        poster
        caption
        autoplay
        loop
        muted
        controls
        preload
        playsInline
      }
    }
  `,
};

CoreVideo.displayName = "CoreVideo";
