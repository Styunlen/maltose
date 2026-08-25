/* Hallmark · pre-emit critique: P5 H4 E5 S4 R5 V5 */
/**
 * Relative-time formatting (pattern studied from blog.anheyu.com): cards read
 * "2个月前" instead of absolute dates, giving the feed a new-content pulse.
 * Past ~1 year falls back to absolute date so old posts don't read as stale.
 */

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const MONTH = 30 * DAY;
const YEAR = 365 * DAY;

export function formatRelativeTime(iso: string | Date, now: Date = new Date()): string {
  const then = typeof iso === "string" ? new Date(iso) : iso;
  if (Number.isNaN(then.getTime())) return "";
  const diff = now.getTime() - then.getTime();
  if (diff < MINUTE) return "刚刚";
  if (diff < HOUR) return `${Math.floor(diff / MINUTE)} 分钟前`;
  if (diff < DAY) return `${Math.floor(diff / HOUR)} 小时前`;
  if (diff < MONTH) return `${Math.floor(diff / DAY)} 天前`;
  if (diff < YEAR) return `${Math.floor(diff / MONTH)} 个月前`;
  return then.toLocaleDateString("zh-CN", { year: "numeric", month: "long", day: "numeric" });
}

export function isNew(iso: string | Date, days = 30, now: Date = new Date()): boolean {
  const then = typeof iso === "string" ? new Date(iso) : iso;
  if (Number.isNaN(then.getTime())) return false;
  return now.getTime() - then.getTime() <= days * DAY;
}
