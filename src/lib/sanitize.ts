import DOMPurify from "dompurify";

const ALLOWED_TAGS = [
  "p", "br", "b", "i", "em", "strong", "u", "s", "del", "ins",
  "a", "img",
  "code", "pre", "blockquote", "hr",
  "ul", "ol", "li",
  "h1", "h2", "h3", "h4", "h5", "h6",
  "table", "thead", "tbody", "tr", "th", "td",
  "span", "div",
  "figure", "figcaption",
  "iframe", "video", "audio", "source", "source", "picture",
  "svg", "path", "circle", "rect", "polygon", "line", "polyline", "g", "defs", "linearGradient", "stop",
];

const ALLOWED_ATTR = [
  "href", "src", "srcset", "alt", "title", "target", "rel", "class", "align",
  "width", "height", "style", "controls", "autoplay", "loop", "muted", "poster",
  "preload", "playsinline", "data-src", "data-original", "type", "id", "name",
  "viewbox", "d", "cx", "cy", "r", "x1", "y1", "x2", "y2", "fill", "stroke",
  "stroke-width", "stroke-linecap", "stroke-linejoin", "points", "opacity",
  "x", "y", "offset", "stop-color", "gradientunits", "gradienttransform",
];

// DOMPurify without a `window` (Node SSR) returns a factory instead of an
// instance, so it must be bound to a jsdom window server-side. In the browser
// the default export is already bound to the global window. import.meta.env.SSR
// is a compile-time constant, keeping jsdom out of the client bundle.
const purify = await (async () => {
  if (import.meta.env.SSR) {
    const { JSDOM } = await import("jsdom");
    return DOMPurify(new JSDOM("").window as any);
  }
  return DOMPurify;
})();

/**
 * Sanitize untrusted HTML for dangerouslySetInnerHTML.
 * Used by CoreHtml / CoreShortcode which render raw editor HTML.
 */
export function sanitizeHtml(html: string): string {
  return purify.sanitize(html, {
    ALLOWED_TAGS,
    ALLOWED_ATTR,
    ALLOW_DATA_ATTR: false,
    ADD_ATTR: ["target"],
  });
}
