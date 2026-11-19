import { describe, expect, it } from "vitest";
import {
  formatAnnouncementDate,
  sortAnnouncements,
  stripHtml,
  type Announcement,
} from "./site-config";

const ann = (id: string, date: string, sticky = false): Announcement => ({
  id,
  date,
  content: "",
  sticky,
});

describe("sortAnnouncements", () => {
  it("puts sticky announcements first, then newest first", () => {
    const list = [
      ann("a", "2026-11-01T00:00:00"),
      ann("b", "2026-11-03T00:00:00", true),
      ann("c", "2026-11-05T00:00:00", true),
      ann("d", "2026-11-02T00:00:00"),
    ];
    expect(sortAnnouncements(list).map((x) => x.id)).toEqual([
      "c",
      "b",
      "d",
      "a",
    ]);
  });

  it("does not mutate the input", () => {
    const list = [ann("a", "2026-11-01"), ann("b", "2026-11-02")];
    sortAnnouncements(list);
    expect(list.map((x) => x.id)).toEqual(["a", "b"]);
  });
});

describe("formatAnnouncementDate", () => {
  it("formats ISO timestamps to YYYY-MM-DD", () => {
    expect(formatAnnouncementDate("2026-11-19T12:34:56")).toBe("2026-11-19");
    expect(formatAnnouncementDate("2026-01-05T00:00:00Z")).toBe("2026-01-05");
  });

  it("falls back to the raw value when unparseable", () => {
    expect(formatAnnouncementDate("not-a-date")).toBe("not-a-date");
  });
});

describe("stripHtml", () => {
  it("strips tags and collapses whitespace", () => {
    expect(stripHtml("<p>Hello <strong>world</strong></p>")).toBe(
      "Hello world",
    );
    expect(stripHtml("<div>a</div> <div>b</div>", 100)).toBe("a b");
  });

  it("decodes common entities", () => {
    expect(stripHtml("Tom &amp; Jerry &quot;quote&quot;", 100)).toBe(
      'Tom & Jerry "quote"',
    );
  });

  it("caps long text with an ellipsis", () => {
    expect(stripHtml("abcdefghij", 5)).toBe("abcd…");
  });
});
