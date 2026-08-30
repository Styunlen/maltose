import { parseUa } from "@lib/ua";
import type { UaInfo } from "@lib/ua";

/* ─── Types ─── */
export interface CommentAuthor {
  name: string;
  databaseId?: number;
  email?: string;
  url?: string;
  avatar: { url: string; size: number };
}

export interface FlatComment {
  id: string;
  databaseId: number;
  parentId: number | null;
  content: string;
  rawContent?: string;
  ua?: UaInfo | null;
  commentGeo?: { country?: string | null; province?: string | null } | null;
  blockReference?: { clientId?: string | null; snippet?: string | null } | null;
  author: { node: CommentAuthor };
  date: string;
  parentAuthorName?: string;
  parentDatabaseId?: number;
  /** Plain-text excerpt of the parent comment (for the quote chip). */
  parentContent?: string;
  /** Sanitized rendered HTML of the parent comment (for the quote chip). */
  parentRenderedHtml?: string;
  children: FlatComment[];
}

/* ─── Helpers ─── */
// Comment raw content can be either markdown (from our editor) or plain HTML
// (legacy/WP-authored comments). Reduce either to readable plain text for the
// parent-quote chip: strip HTML tags first, then markdown symbols.
export function toPlainText(src: string): string {
  return src
    .replace(/<[^>]*>/g, " ")
    .replace(/&[a-z#0-9]+;/gi, " ")
    .replace(/[#>*`~\-\[\]()!]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function buildCommentMap(flat: any[]): Map<number, FlatComment> {
  const map = new Map<number, FlatComment>();
  const nameMap = new Map<number, string>();
  const contentMap = new Map<number, string>();
  const htmlMap = new Map<number, string>();
  for (const c of flat) {
    nameMap.set(c.databaseId, c.author?.node?.name || "Anonymous");
    // toPlainText: rawContent may be markdown or HTML; strip both for the
    // plain-text tooltip. The quote chip's HTML reuses the parent's `content`
    // (already server-rendered + sanitized by renderCommentMd) instead of
    // re-rendering client-side, which crashed in SSR with DOMPurify.
    contentMap.set(c.databaseId, toPlainText(c.rawContent || c.content || ""));
    htmlMap.set(c.databaseId, c.content || "");
  }
  for (const c of flat) {
    const p = c.parentDatabaseId ?? c.parentId ?? null;
    map.set(c.databaseId, {
      id: c.id,
      databaseId: c.databaseId,
      parentId: p,
      content: c.content,
      rawContent: c.rawContent,
      ua: parseUa(c.agentPublic || c.agent || ""),
      commentGeo: c.commentGeo ?? null,
      blockReference: c.blockReference ?? null,
      author: c.author,
      date: c.date,
      parentAuthorName: p ? nameMap.get(p) : undefined,
      parentDatabaseId: p,
      parentContent: p ? contentMap.get(p) : undefined,
      parentRenderedHtml: p ? htmlMap.get(p) : undefined,
      children: [],
    });
  }
  for (const n of map.values()) {
    if (n.parentId && map.has(n.parentId))
      map.get(n.parentId)!.children.push(n);
  }
  return map;
}

/* ─── Chat grouping ─── */
// Group strictly consecutive comments by the same author into message groups.
export function groupByAuthor(sorted: FlatComment[]): FlatComment[][] {
  const groups: FlatComment[][] = [];
  for (const c of sorted) {
    const last = groups[groups.length - 1];
    if (last && last[last.length - 1].author.node.name === c.author.node.name) {
      last.push(c);
    } else {
      groups.push([c]);
    }
  }
  return groups;
}
