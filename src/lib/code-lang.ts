import hljs from "highlight.js";

/*
 * Code block language resolution for CoreCode.
 *
 * Language priority (highest first):
 *   1. explicit hint: `language-*` class from WP data (cssClassName or the
 *      cssClassNames array) or from rendered HTML
 *   2. hljs auto-detection with a relevance threshold
 *   3. "text" fallback
 *
 * The resolved language is normalized to a shiki-compatible name so the
 * highlighter (shiki) and the badge (displayLanguage) agree.
 */

// hljs returns short names that shiki doesn't recognize (or renders better
// under a canonical name). Map them to shiki's bundled language names.
const HLJS_TO_SHIKI: Record<string, string> = {
  js: "javascript",
  ts: "typescript",
  py: "python",
  sh: "bash",
  shell: "bash",
  cs: "csharp",
  md: "markdown",
  rb: "ruby",
  kt: "kotlin",
  fs: "fsharp",
  rs: "rust",
  gradle: "groovy",
  dockerfile: "docker",
  objectivec: "objective-c",
  cpp: "cpp",
  c: "c",
  h: "c",
  hpp: "cpp",
  cxx: "cpp",
  m: "objective-c",
  mm: "objective-c",
  ps1: "powershell",
  yml: "yaml",
  shell_session: "bash",
};

// hljs detection below this relevance is treated as "not confident" —
// the badge then shows "text" instead of a misleading "(Auto identified)".
const CONFIDENCE_THRESHOLD = 10;

const LANGUAGE_CLASS_RE = /language-([\w-]+)/i;

/** Extract a `language-*` hint from a class name string ("" → null). */
export function extractLanguageFromClass(className: string): string | null {
  const match = className.match(LANGUAGE_CLASS_RE);
  return match ? match[1] : null;
}

/**
 * Collect every language hint from WP block data:
 * attributes.cssClassName (string) and the cssClassNames array.
 */
export function collectLanguageHints(
  cssClassName: string | undefined,
  cssClassNames: string[] | undefined,
): string[] {
  const sources = [cssClassName, ...(cssClassNames ?? [])].filter(
    (c): c is string => typeof c === "string" && c.length > 0,
  );
  const hints: string[] = [];
  for (const source of sources) {
    const hit = extractLanguageFromClass(source);
    if (hit) hints.push(hit);
  }
  return hints;
}

/** Extract a `language-*` hint from rendered block HTML (e.g. shortcode path). */
export function extractLanguageFromHtml(html: string): string | null {
  const match = html.match(
    /<(?:code|pre)[^>]*class=["'][^"']*\blanguage-([\w-]+)[^"']*["']/i,
  );
  return match ? match[1] : null;
}

/**
 * Resolve the final language for a code block.
 * Returns the shiki-compatible language name, or "text" as fallback.
 */
export function resolveCodeLanguage(input: {
  content: string;
  cssClassName?: string;
  cssClassNames?: string[];
  renderedHtml?: string;
}): { lang: string; source: "explicit" | "detected" | "text" } {
  const { content, cssClassName, cssClassNames, renderedHtml } = input;

  // 1. Explicit hints from block data / rendered HTML.
  const hints = collectLanguageHints(cssClassName, cssClassNames);
  if (hints.length > 0) {
    return { lang: hints[0], source: "explicit" };
  }
  if (renderedHtml) {
    const htmlLang = extractLanguageFromHtml(renderedHtml);
    if (htmlLang) return { lang: htmlLang, source: "explicit" };
  }

  // 2. hljs auto-detection with confidence threshold.
  try {
    const result = hljs.highlightAuto(content);
    const detected = result.language ?? "";
    const confident = result.relevance >= CONFIDENCE_THRESHOLD;
    if (detected && confident) {
      return { lang: HLJS_TO_SHIKI[detected] ?? detected, source: "detected" };
    }
    // Not confident → "text" (don't show a misleading badge).
    return { lang: "text", source: "text" };
  } catch {
    return { lang: "text", source: "text" };
  }
}
