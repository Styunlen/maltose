/**
 * Reverse WordPress wpautop transformation — convert filtered comment HTML
 * back to raw markdown text suitable for editing.
 * This file has NO jsdom dependency — safe to import in browser components.
 */
export function reverseWpautop(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>\s*<p>/gi, "\n\n")
    .replace(/<\/?p>/gi, "")
    .replace(/&gt;/g, ">")
    .replace(/&lt;/g, "<")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&nbsp;/g, " ")
    // Collapse excessive blank lines
    .replace(/\n{3,}/g, "\n\n")
    // In markdown, blank lines between list items, code fences, blockquotes,
    // headings break the block structure. Since wpautop wrapped everything with
    // <p>, after reversal we get extra blank lines before these elements.
    .replace(/\n\n(?=(?:[-*+]\s|\d+\.\s|```|>|#{1,6}\s))/g, "\n")
    .trim();
}
