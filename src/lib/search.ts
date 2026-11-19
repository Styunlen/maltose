export const SEARCH_TYPES = ["post", "page", "comment", "tag", "category"] as const;

export type SearchType = (typeof SEARCH_TYPES)[number];

export interface SearchResultItem {
  id: string;
  type: SearchType;
  title: string;
  url: string;
  snippet: string;
  date?: string;
  parentTitle?: string;
  parentUrl?: string;
  count?: number;
}

export interface SearchGroup {
  type: SearchType;
  label: string;
  total: number;
  items: SearchResultItem[];
}

export interface PaginatedSearchResults {
  items: SearchResultItem[];
  groups: SearchGroup[];
  total: number;
  page: number;
  perPage: number;
  totalPages: number;
}

type UnknownRecord = Record<string, unknown>;

export const SEARCH_TYPE_LABELS: Record<SearchType, string> = {
  post: "文章",
  page: "页面",
  comment: "评论",
  tag: "标签",
  category: "分类",
};

const TYPE_ORDER = new Map<SearchType, number>(SEARCH_TYPES.map((type, index) => [type, index]));

export function normalizeSearchQuery(value: string | null | undefined): string {
  return (value ?? "")
    .normalize("NFKC")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);
}

export function parseSearchTypes(values: string[]): SearchType[] {
  const selected = new Set<SearchType>();
  for (const value of values) {
    for (const raw of value.split(",")) {
      const type = raw.trim().toLowerCase();
      if (isSearchType(type)) selected.add(type);
    }
  }
  return selected.size > 0 ? SEARCH_TYPES.filter((type) => selected.has(type)) : [...SEARCH_TYPES];
}

export function canonicalSearchPath(query: string, types: SearchType[], page: number): string {
  const params = new URLSearchParams();
  const normalizedQuery = normalizeSearchQuery(query);
  if (normalizedQuery) params.set("q", normalizedQuery);
  const uniqueTypes = SEARCH_TYPES.filter((type) => types.includes(type));
  if (uniqueTypes.length > 0 && uniqueTypes.length < SEARCH_TYPES.length) {
    for (const type of uniqueTypes) params.append("type", type);
  }
  if (page > 1) params.set("page", String(page));
  const qs = params.toString();
  return qs ? `/search?${qs}` : "/search";
}

export function stripHtmlToText(html: string | null | undefined): string {
  if (!html) return "";
  return decodeBasicEntities(html.replace(/<[^>]*>/g, " "))
    .replace(/\s+/g, " ")
    .trim();
}

export function makeSnippet(source: string, query: string, maxLength = 180): string {
  const text = stripHtmlToText(source);
  if (!text) return "";
  const needle = normalizeSearchQuery(query).toLocaleLowerCase();
  if (!needle) return truncateText(text, maxLength);
  const haystack = text.toLocaleLowerCase();
  const index = haystack.indexOf(needle);
  if (index < 0) return truncateText(text, maxLength);
  const half = Math.floor(maxLength / 2);
  const start = Math.max(0, index - half);
  const end = Math.min(text.length, start + maxLength);
  const prefix = start > 0 ? "..." : "";
  const suffix = end < text.length ? "..." : "";
  return `${prefix}${text.slice(start, end).trim()}${suffix}`;
}

export function highlightSearchText(text: string, query: string): string {
  const normalizedQuery = normalizeSearchQuery(query);
  if (!normalizedQuery) return escapeHtml(text);
  const terms = [...new Set(normalizedQuery.split(" ").filter(Boolean))]
    .sort((a, b) => b.length - a.length)
    .map(escapeRegExp);
  if (terms.length === 0) return escapeHtml(text);
  const pattern = new RegExp(terms.join("|"), "giu");
  let result = "";
  let cursor = 0;
  for (const match of text.matchAll(pattern)) {
    const index = match.index ?? 0;
    result += escapeHtml(text.slice(cursor, index));
    result += `<mark>${escapeHtml(match[0])}</mark>`;
    cursor = index + match[0].length;
  }
  result += escapeHtml(text.slice(cursor));
  return result;
}

export function paginateSearchResults(
  items: SearchResultItem[],
  selectedTypes: SearchType[],
  page: number,
  perPage: number,
): PaginatedSearchResults {
  const selected = new Set(selectedTypes);
  const groupedItems = new Map<SearchType, SearchResultItem[]>();
  for (const type of SEARCH_TYPES) {
    if (selected.has(type)) groupedItems.set(type, []);
  }
  for (const item of items) {
    const group = groupedItems.get(item.type);
    if (group) group.push(item);
  }
  for (const group of groupedItems.values()) group.sort(compareSearchItems);

  const total = [...groupedItems.values()].reduce((sum, group) => sum + group.length, 0);
  const totalPages = Math.max(
    1,
    ...[...groupedItems.values()].map((group) => Math.ceil(group.length / perPage)),
  );
  const safePage = Math.min(Math.max(1, page), totalPages);
  const start = (safePage - 1) * perPage;
  const groups = SEARCH_TYPES.filter((type) => selected.has(type)).map((type) => {
    const allGroupItems = groupedItems.get(type) ?? [];
    const groupItems = allGroupItems.slice(start, start + perPage);
    return {
      type,
      label: SEARCH_TYPE_LABELS[type],
      total: allGroupItems.length,
      items: groupItems,
    };
  });
  const pageItems = groups.flatMap((group) => group.items);
  return { items: pageItems, groups, total, page: safePage, perPage, totalPages };
}

export function normalizeSiteSearchData(data: unknown, query: string): SearchResultItem[] {
  const root = asRecord(data);
  return [
    ...connectionNodes(root.posts).map((node) => normalizePostLike(node, "post", query)),
    ...connectionNodes(root.pages).map((node) => normalizePostLike(node, "page", query)),
    ...connectionNodes(root.comments).map((node) => normalizeComment(node, query)),
    ...connectionNodes(root.tags).map((node) => normalizeTerm(node, "tag", query)),
    ...connectionNodes(root.categories).map((node) => normalizeTerm(node, "category", query)),
  ].filter((item): item is SearchResultItem => item !== null);
}

function compareSearchItems(left: SearchResultItem, right: SearchResultItem): number {
  const typeDiff = (TYPE_ORDER.get(left.type) ?? 0) - (TYPE_ORDER.get(right.type) ?? 0);
  if (typeDiff !== 0) return typeDiff;
  const leftTime = left.date ? Date.parse(left.date) : 0;
  const rightTime = right.date ? Date.parse(right.date) : 0;
  if (leftTime !== rightTime) return rightTime - leftTime;
  return `${left.title}:${left.id}`.localeCompare(`${right.title}:${right.id}`);
}

function normalizePostLike(node: UnknownRecord, type: "post" | "page", query: string): SearchResultItem | null {
  const title = stringField(node.title);
  const url = stringField(node.uri);
  const id = numberOrStringField(node.databaseId);
  if (!title || !url || !id) return null;
  const content = stringField(node.content);
  const excerpt = stringField(node.excerpt);
  return {
    id: `${type}:${id}`,
    type,
    title,
    url,
    snippet: makeSnippet(content || excerpt, query),
    date: stringField(node.date) || undefined,
    count: numberField(node.commentCount),
  };
}

function normalizeComment(node: UnknownRecord, query: string): SearchResultItem | null {
  const id = numberOrStringField(node.databaseId);
  const content = stringField(node.content);
  if (!id || !content) return null;
  const commentedOn = asRecord(asRecord(node.commentedOn).node);
  const parentTitle = stringField(commentedOn.title);
  const parentUrl = stringField(commentedOn.uri);
  if (!parentTitle || !parentUrl) return null;
  const authorName = stringField(asRecord(asRecord(node.author).node).name);
  return {
    id: `comment:${id}`,
    type: "comment",
    title: authorName ? `${authorName} on ${parentTitle}` : `Comment on ${parentTitle}`,
    url: `${parentUrl}#comment-${id}`,
    snippet: makeSnippet(content, query),
    date: stringField(node.dateGmt) || stringField(node.date) || undefined,
    parentTitle,
    parentUrl,
  };
}

function normalizeTerm(node: UnknownRecord, type: "tag" | "category", query: string): SearchResultItem | null {
  const title = stringField(node.name);
  const url = stringField(node.uri);
  const id = numberOrStringField(node.databaseId) || title;
  if (!title || !url || !id) return null;
  return {
    id: `${type}:${id}`,
    type,
    title,
    url,
    snippet: makeSnippet(stringField(node.description) || title, query),
    count: numberField(node.count),
  };
}

function connectionNodes(value: unknown): UnknownRecord[] {
  const nodes = asRecord(value).nodes;
  if (!Array.isArray(nodes)) return [];
  return nodes.map(asRecord).filter((node) => Object.keys(node).length > 0);
}

function asRecord(value: unknown): UnknownRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? value as UnknownRecord : {};
}

function stringField(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function numberField(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function numberOrStringField(value: unknown): string {
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return typeof value === "string" ? value : "";
}

function isSearchType(value: string): value is SearchType {
  return SEARCH_TYPES.includes(value as SearchType);
}

function truncateText(text: string, maxLength: number): string {
  return text.length > maxLength ? `${text.slice(0, maxLength).trim()}...` : text;
}

function decodeBasicEntities(value: string): string {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&hellip;/g, "...")
    .replace(/&nbsp;/g, " ");
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
