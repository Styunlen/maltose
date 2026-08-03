// Shortcode type definitions
// To add a new shortcode: add a handler function that returns a React element
// and register it in the shortcode registry (index.ts).

import type { ReactNode } from "react";

export interface ShortcodeAttrs {
  [key: string]: string;
}

export interface ShortcodeHandler {
  (node: {
    tag: string;
    attrs: ShortcodeAttrs;
    content: string;
  }): ReactNode;
}

export interface ShortcodeRegistry {
  [tag: string]: ShortcodeHandler;
}
