// Shortcode parser — extracts [tag attrs]content[/tag] from strings
// Supports multiple shortcodes in a single string.
// Nested shortcodes are NOT supported yet — each shortcode content is parsed
// only for <pre><code> blocks, not for nested shortcodes.

import type { ShortcodeAttrs } from "./types";

interface ParsedShortcode {
  tag: string;
  attrs: ShortcodeAttrs;
  content: string;
  raw: string; // full matched string
}

const SHORTCODE_RE = /\[(\w+)(?:\s+([^\]]+))?\]([\s\S]*?)\[\/\1\]/g;

function parseAttrs(attrsStr: string): ShortcodeAttrs {
  const attrs: ShortcodeAttrs = {};
  if (!attrsStr) return attrs;
  const pairs = attrsStr.matchAll(/(\w+)=["']([^"']*)["']/g);
  for (const [, key, value] of pairs) {
    attrs[key] = value;
  }
  return attrs;
}

export function parseShortcodes(text: string): ParsedShortcode[] {
  const results: ParsedShortcode[] = [];
  const re = new RegExp(SHORTCODE_RE.source, "g");
  let match: RegExpExecArray | null;
  while ((match = re.exec(text)) !== null) {
    results.push({
      tag: match[1],
      attrs: parseAttrs(match[2] || ""),
      content: match[3],
      raw: match[0],
    });
  }
  return results;
}

// Split code blocks from HTML content.
// Returns segments: { type: "html", value: string } | { type: "code", value: string, lang: string }
export interface ContentSegment {
  type: "html" | "code";
  value: string;
  lang?: string;
}

const CODE_RE =
  /<pre[^>]*><code(?:\s+class=["'](?:[^"']*\s)?language-(\w+)(?:\s[^"']*)?["'])?[^>]*>([\s\S]*?)<\/code><\/pre>/gi;

export function parseContentWithCode(content: string): ContentSegment[] {
  const segments: ContentSegment[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  const re = new RegExp(CODE_RE.source, "gi");

  while ((match = re.exec(content)) !== null) {
    if (match.index > lastIndex) {
      segments.push({
        type: "html",
        value: content.slice(lastIndex, match.index),
      });
    }
    segments.push({
      type: "code",
      value: match[2],
      lang: match[1] || "plaintext",
    });
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < content.length) {
    segments.push({
      type: "html",
      value: content.slice(lastIndex),
    });
  }

  return segments;
}
