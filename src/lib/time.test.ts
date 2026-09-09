import { describe, expect, it } from "vitest";
import { commentDateTime, commentDateValue, formatCommentTime } from "./time";

describe("comment timestamps", () => {
  it("prefers dateGmt as canonical UTC over site-local date", () => {
    const timestamp = {
      date: "2026-09-09T12:00:00",
      dateGmt: "2026-09-09T04:00:00",
    };

    expect(commentDateTime(timestamp)).toBe("2026-09-09T04:00:00.000Z");
    expect(commentDateValue(timestamp)).toBe(Date.parse("2026-09-09T04:00:00.000Z"));
  });

  it("parses date fallback as Asia/Shanghai site-local time", () => {
    const timestamp = { date: "2026-09-09T12:00:00" };

    expect(commentDateTime(timestamp)).toBe("2026-09-09T04:00:00.000Z");
  });

  it("formats using dateGmt precedence", () => {
    const timestamp = {
      date: "2026-09-09T20:00:00",
      dateGmt: "2026-09-09T04:00:00",
    };
    const now = new Date("2026-09-09T05:00:00.000Z");

    expect(formatCommentTime(timestamp, now).display).toBe("1 小时前");
  });

  it("includes visitor-local clock time for yesterday comments", () => {
    const timestamp = { dateGmt: "2026-09-08T04:34:00" };
    const now = new Date("2026-09-09T05:34:00.000Z");

    expect(formatCommentTime(timestamp, now)).toMatchObject({
      display: "昨天 12:34",
      relative: "昨天 12:34",
    });
  });

  it("includes visitor-local clock time for day-before-yesterday comments", () => {
    const timestamp = { dateGmt: "2026-09-07T04:34:00" };
    const now = new Date("2026-09-09T05:34:00.000Z");

    expect(formatCommentTime(timestamp, now)).toMatchObject({
      display: "前天 12:34",
      relative: "前天 12:34",
    });
  });

  it("includes visitor-local clock time for older day-relative comments", () => {
    const timestamp = { dateGmt: "2026-09-06T04:34:00" };
    const now = new Date("2026-09-09T05:34:00.000Z");

    expect(formatCommentTime(timestamp, now)).toMatchObject({
      display: "3 天前 12:34",
      relative: "3 天前 12:34",
    });
  });
});
