// Site-level configuration and announcement models shared by the layout
// (ADR-0043: author card + announcement timeline in the left rail).

export interface SocialLink {
  label: string;
  url: string;
  /** "url" = image URL, "iconify" = iconify icon code (e.g. mdi:github). */
  iconType: "url" | "iconify";
  icon: string;
}

export interface SiteOwner {
  name?: string | null;
  description?: string | null;
  avatar?: { url?: string | null } | null;
  url?: string | null;
}

export interface SiteConfig {
  socialLinks?: SocialLink[] | null;
  owner?: SiteOwner | null;
}

export interface Announcement {
  id: string;
  date: string;
  modified?: string | null;
  content?: string | null;
  sticky?: boolean | null;
}

/** Sticky announcements first, then newest first (ISO date strings). */
export function sortAnnouncements(list: Announcement[]): Announcement[] {
  return [...list].sort((a, b) => {
    const sa = a.sticky ? 1 : 0;
    const sb = b.sticky ? 1 : 0;
    if (sa !== sb) return sb - sa;
    return (b.date ?? "").localeCompare(a.date ?? "");
  });
}

/** "2026-11-19T12:34:56" → "2026-11-19" (falls back to the raw value). */
export function formatAnnouncementDate(value: string): string {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}`;
}

/** Strip HTML tags and collapse whitespace, capped at `max` chars. */
export function stripHtml(text: string, max = 80): string {
  const plain = text
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
  if (plain.length <= max) return plain;
  return `${plain.slice(0, max - 1).trimEnd()}…`;
}
