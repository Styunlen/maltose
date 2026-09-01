// Shortcode registry — maps shortcode tag names to React components.
// Add new shortcodes by registering a handler here.

import { createElement } from "react";
import type { ShortcodeRegistry } from "@/lib/shortcodes/types";
import CollapseShortcode from "@/components/shortcodes/CollapseShortcode";

const REGISTRY: ShortcodeRegistry = {
  collapse: ({ attrs, content }) =>
    createElement(CollapseShortcode, { attrs, content }),
};

export function resolveShortcode(
  tag: string,
  attrs: { [key: string]: string },
  content: string,
): React.ReactNode | null {
  const handler = REGISTRY[tag];
  if (!handler) return null;
  return handler({ tag, attrs, content });
}

export default REGISTRY;
