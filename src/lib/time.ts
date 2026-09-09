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
const SITE_TIMEZONE = "Asia/Shanghai";

export interface CommentTimestampInput {
  date?: string | null;
  dateGmt?: string | null;
}

export type CommentTimestamp = string | CommentTimestampInput;

function normalizeCommentTimestamp(input: CommentTimestamp): CommentTimestampInput {
  return typeof input === "string" ? { date: input } : input;
}

/**
 * Parse a WP comment timestamp.
 *
 * `Comment.dateGmt` is the canonical UTC timestamp from WPGraphQL. `Comment.date`
 * is the WordPress site-local wall time without an offset; keep it only as an
 * Asia/Shanghai fallback instead of letting the browser/server timezone guess.
 * (ADR-0036 Update 2026-09-09.)
 */
export function parseCommentDate(input: CommentTimestamp): dayjs.Dayjs {
  const { date, dateGmt } = normalizeCommentTimestamp(input);
  if (dateGmt) return dayjs.utc(dateGmt);
  return dayjs.tz(date || "", SITE_TIMEZONE);
}

/** Canonical UTC ISO string for machine-readable comment timestamps. */
export function commentDateTime(input: CommentTimestamp): string {
  return parseCommentDate(input).toISOString();
}

/**
 * Format a WP comment timestamp for display:
 *  - <7 days -> relative ("刚刚" / "X 分钟前" / "X 小时前" / "昨天 HH:mm" / "X 天前 HH:mm")
 *  - >=7 days -> absolute visitor-local time; cross-year includes the year
 * Returns { display, title, relative }: display for the visible text, title
 * the full absolute local time, relative a relative-phrase always (used as a
 * secondary line in the hover tooltip).
 */
export function formatCommentTime(input: CommentTimestamp, now: Date = new Date()): { display: string; title: string; relative: string } {
  const local = parseCommentDate(input).local();
  const title = local.format("YYYY-MM-DD HH:mm");
  const diff = now.getTime() - local.valueOf();
  const time = local.format("HH:mm");
  const dayRelative = (label: string) => `${label} ${time}`;

  const relative = (() => {
    if (diff < 0) return title;
    if (diff < 60_000) return "刚刚";
    if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} 分钟前`;
    if (diff < DAY) return `${Math.floor(diff / 3_600_000)} 小时前`;
    if (diff < 2 * DAY) return dayRelative("昨天");
    if (diff < 3 * DAY) return dayRelative("前天");
    if (diff < 7 * DAY) return dayRelative(`${Math.floor(diff / DAY)} 天前`);
    if (diff < 30 * DAY) return dayRelative(`${Math.floor(diff / DAY)} 天前`);
    if (diff < 365 * DAY) return `${Math.floor(diff / (30 * DAY))} 个月前`;
    return `${Math.floor(diff / (365 * DAY))} 年前`;
  })();

  if (diff < 0) {
    return { display: title, title, relative };
  }
  if (diff < DAY) {
    if (diff < 60_000) return { display: "刚刚", title, relative };
    if (diff < 3_600_000) return { display: `${Math.floor(diff / 60_000)} 分钟前`, title, relative };
    return { display: `${Math.floor(diff / 3_600_000)} 小时前`, title, relative };
  }
  if (diff < 2 * DAY) {
    // 24-48h -> "昨天" (regardless of calendar boundary)
    const display = dayRelative("昨天");
    return { display, title, relative };
  }
  if (diff < 3 * DAY) {
    const display = dayRelative("前天");
    return { display, title, relative };
  }
  if (diff < 7 * DAY) {
    const display = dayRelative(`${Math.floor(diff / DAY)} 天前`);
    return { display, title, relative };
  }
  // Absolute; include year when the date is in a different calendar year.
  const crossYear = local.year() !== dayjs(now).year();
  const display = crossYear ? local.format("YYYY-MM-DD HH:mm") : local.format("MM-DD HH:mm");
  return { display, title, relative };
}

/** Sortable millisecond value for a WP comment timestamp. */
export function commentDateValue(input: CommentTimestamp): number {
  return parseCommentDate(input).valueOf();
}

/**
 * Format a WP post date for display.
 *
 * Unlike comment timestamps with canonical `dateGmt`, `Post.date` /
 * `Post.modified` are the site-timezone (Asia/Shanghai) local time serialized
 * WITHOUT an offset (e.g. "2026-08-27T09:36:00", GMT is
 * "2026-08-27T01:36:00"). A publish date is a site-side fact, so all visitors
 * see the same value: parse it explicitly as Asia/Shanghai instead of letting
 * the visitor's browser re-interpret it.
 */
export function formatPostDate(date: string, withTime = false): string {
  const local = dayjs.tz(date, SITE_TIMEZONE);
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
  const then = dayjs.tz(date, SITE_TIMEZONE).valueOf();
  const diff = now.getTime() - then;
  if (diff < MINUTE_MS) return "刚刚";
  if (diff < HOUR_MS) return `${Math.floor(diff / MINUTE_MS)} 分钟前`;
  if (diff < DAY_MS) return `${Math.floor(diff / HOUR_MS)} 小时前`;
  if (diff < MONTH_MS) return `${Math.floor(diff / DAY_MS)} 天前`;
  if (diff < YEAR_MS) return `${Math.floor(diff / MONTH_MS)} 个月前`;
  return dayjs.tz(date, SITE_TIMEZONE).format("YYYY-MM-DD");
}

/** "New" badge threshold for post cards (within 7 days). */
export function isPostNew(date: string, now: Date = new Date()): boolean {
  const then = dayjs.tz(date, SITE_TIMEZONE).valueOf();
  return now.getTime() - then < 7 * DAY_MS;
}
