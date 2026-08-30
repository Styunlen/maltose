import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import timezone from "dayjs/plugin/timezone";
import relativeTime from "dayjs/plugin/relativeTime";
import "dayjs/locale/zh-cn";

dayjs.extend(utc);
dayjs.extend(timezone);
dayjs.extend(relativeTime);
dayjs.locale("zh-cn");

const DAY = 24 * 60 * 60 * 1000;

/**
 * Parse a WP comment/post date string.
 *
 * WPGraphQL returns `comment.date` as an offset-less string (e.g.
 * "2026-08-28 16:14:27") whose wall-clock value is the server timezone's UTC
 * representation — i.e. it IS UTC time, just without the trailing "Z". Treat
 * it as UTC, then convert to the visitor's local timezone for display.
 * (ADR-0036 Update 2026-08-28, decision B.)
 */
export function parseCommentDate(date: string): dayjs.Dayjs {
  return dayjs.utc(date);
}

/**
 * Format a WP date string for display:
 *  - <7 days → relative ("刚刚" / "X 分钟前" / "X 小时前" / "昨天" / "X 天前")
 *  - ≥7 days → absolute local time; cross-year includes the year
 * Returns { display, title, relative }: display for the visible text, title
 * the full absolute local time, relative a relative-phrase always (used as a
 * secondary line in the hover tooltip).
 */
export function formatCommentTime(date: string, now: Date = new Date()): { display: string; title: string; relative: string } {
  const local = parseCommentDate(date).local();
  const title = local.format("YYYY-MM-DD HH:mm");
  const diff = now.getTime() - local.valueOf();

  const relative = (() => {
    if (diff < 0) return title;
    if (diff < 60_000) return "刚刚";
    if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} 分钟前`;
    if (diff < DAY) return `${Math.floor(diff / 3_600_000)} 小时前`;
    if (diff < 2 * DAY) return "昨天";
    if (diff < 7 * DAY) return `${Math.floor(diff / DAY)} 天前`;
    if (diff < 30 * DAY) return `${Math.floor(diff / DAY)} 天前`;
    if (diff < 365 * DAY) return `${Math.floor(diff / (30 * DAY))} 个月前`;
    return `${Math.floor(diff / (365 * DAY))} 年前`;
  })();

  if (diff < 0) {
    // Future-dated (clock skew) — show absolute.
    return { display: title, title, relative };
  }
  if (diff < DAY) {
    if (diff < 60_000) return { display: "刚刚", title, relative };
    if (diff < 3_600_000) return { display: `${Math.floor(diff / 60_000)} 分钟前`, title, relative };
    return { display: `${Math.floor(diff / 3_600_000)} 小时前`, title, relative };
  }
  if (diff < 2 * DAY) {
    // 24–48h → "昨天" (regardless of calendar boundary)
    return { display: "昨天", title, relative };
  }
  if (diff < 7 * DAY) {
    return { display: `${Math.floor(diff / DAY)} 天前`, title, relative };
  }
  // Absolute; include year when the date is in a different calendar year.
  const crossYear = local.year() !== dayjs(now).year();
  const display = crossYear ? local.format("YYYY-MM-DD HH:mm") : local.format("MM-DD HH:mm");
  return { display, title, relative };
}

/**
 * Sortable millisecond value for a WP date string (UTC-aware).
 * Use in comparator: `new Date(a.date) → parseCommentDate(a.date).valueOf()`.
 */
export function commentDateValue(date: string): number {
  return parseCommentDate(date).valueOf();
}

/**
 * Format a WP post date for display.
 *
 * Unlike `Comment.date` (UTC offset-less), `Post.date` / `Post.modified` are
 * the site-timezone (Asia/Shanghai) local time serialized WITHOUT an offset
 * (e.g. "2026-08-27T09:36:00", GMT is "2026-08-27T01:36:00"). A publish date is
 * a site-side fact, so all visitors see the same value: parse it explicitly as
 * Asia/Shanghai instead of letting the visitor's browser re-interpret it.
 */
export function formatPostDate(date: string, withTime = false): string {
  const local = dayjs.tz(date, "Asia/Shanghai");
  return withTime ? local.format("YYYY-MM-DD HH:mm") : local.format("YYYY-MM-DD");
}

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;
const MONTH_MS = 30 * DAY_MS;
const YEAR_MS = 365 * DAY_MS;

/**
 * Relative time for post cards. Same tz rationale as `formatPostDate`:
 * `post.date` is site-timezone local without offset, so parse as
 * Asia/Shanghai before diffing against the visitor's clock.
 */
export function formatPostRelative(date: string, now: Date = new Date()): string {
  const then = dayjs.tz(date, "Asia/Shanghai").valueOf();
  const diff = now.getTime() - then;
  if (diff < MINUTE_MS) return "刚刚";
  if (diff < HOUR_MS) return `${Math.floor(diff / MINUTE_MS)} 分钟前`;
  if (diff < DAY_MS) return `${Math.floor(diff / HOUR_MS)} 小时前`;
  if (diff < MONTH_MS) return `${Math.floor(diff / DAY_MS)} 天前`;
  if (diff < YEAR_MS) return `${Math.floor(diff / MONTH_MS)} 个月前`;
  return dayjs.tz(date, "Asia/Shanghai").format("YYYY-MM-DD");
}

/** "New" badge threshold for post cards (within 7 days). */
export function isPostNew(date: string, now: Date = new Date()): boolean {
  const then = dayjs.tz(date, "Asia/Shanghai").valueOf();
  return now.getTime() - then < 7 * DAY_MS;
}
