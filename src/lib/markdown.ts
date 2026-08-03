import { JSDOM } from "jsdom";
import DOMPurify from "dompurify";
import { marked } from "marked";
import { reverseWpautop } from "./wpautop";

const window = new JSDOM("").window;
const purify = DOMPurify(window as any);

const ALLOWED_TAGS = [
  "p", "br", "b", "i", "em", "strong", "u", "s", "del", "ins",
  "a", "img",
  "code", "pre", "blockquote", "hr",
  "ul", "ol", "li",
  "h1", "h2", "h3", "h4", "h5", "h6",
  "table", "thead", "tbody", "tr", "th", "td",
  "span", "div",
  "figure", "figcaption",
];

const ALLOWED_ATTR = ["href", "src", "alt", "title", "target", "rel", "class", "align"];

/**
 * Render markdown to HTML, then sanitize.
 * Used in SSR (Single.astro) and for final display.
 */
export function renderCommentMd(md: string): string {
  const raw = reverseWpautop(md);
  const html = marked.parse(raw, { async: false }) as string;
  return purify.sanitize(html, {
    ALLOWED_TAGS,
    ALLOWED_ATTR,
    ALLOW_DATA_ATTR: false,
    ADD_ATTR: ["target"],
  });
}

/**
 * Sanitize raw markdown source before storage.
 * Removes raw <script>, <iframe>, event handlers etc.
 * Leaves most markdown-safe HTML (like <b>, <i>, <a>) intact.
 */
export function sanitizeMarkdownSource(md: string): string {
  return purify.sanitize(md, {
    ALLOWED_TAGS: [
      "b", "i", "em", "strong", "u", "s", "del", "ins",
      "a", "img",
      "code", "pre", "br", "hr", "blockquote",
      "ul", "ol", "li",
      "h1", "h2", "h3", "h4", "h5", "h6",
      "table", "thead", "tbody", "tr", "th", "td",
      "span", "p", "div",
    ],
    ALLOWED_ATTR,
    ALLOW_DATA_ATTR: false,
    ADD_ATTR: ["target"],
    WHOLE_DOCUMENT: false,
  });
}
