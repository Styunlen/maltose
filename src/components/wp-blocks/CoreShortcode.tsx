import { createElement } from "react";
import type { BlockRendererProps } from "@lib/blocks/types";
import { parseShortcodes } from "@/lib/shortcodes/parser";
import { resolveShortcode } from "@/lib/shortcodes/registry";
import { sanitizeHtml } from "@/lib/sanitize";

export default function CoreShortcode({
  block,
  className,
}: BlockRendererProps) {
  const content = (block.attributes as any)?.content || "";
  const renderedHtml = (block as any)?.renderedHtml || "";

  const raw = content || renderedHtml;
  if (!raw) return null;

  const shortcodes = parseShortcodes(raw);

  if (shortcodes.length === 0) {
    return (
      <div className={className} dangerouslySetInnerHTML={{ __html: sanitizeHtml(raw) }} />
    );
  }

  // Render each shortcode; unrecognized tags rendered as raw HTML
  return (
    <div className={className}>
      {shortcodes.map((sc, i) => {
        const resolved = resolveShortcode(sc.tag, sc.attrs, sc.content);
        return resolved !== null ? (
          <div key={i}>{resolved}</div>
        ) : (
          <div key={i} dangerouslySetInnerHTML={{ __html: sanitizeHtml(sc.raw) }} />
        );
      })}
    </div>
  );
}

CoreShortcode.fragments = {
  key: "ShortcodeBlockFragment",
  entry: `
    fragment ShortcodeBlockFragment on CoreShortcode {
      attributes {
        text
      }
    }
  `,
};

CoreShortcode.displayName = "CoreShortcode";
