import { describe, expect, it } from "vitest";
import {
  CONTENT_HEADER_HEIGHT,
  clampHeaderProgress,
  getSiteHeaderScrollModel,
} from "./SiteHeader";

const DESKTOP_VIEWPORT_HEIGHT = 900;
const VIEWPORT_INTRO_RANGE = DESKTOP_VIEWPORT_HEIGHT - CONTENT_HEADER_HEIGHT;

describe("SiteHeader scroll model", () => {
  it("keeps the desktop homepage banner state at zero scroll", () => {
    const model = getSiteHeaderScrollModel({
      homepageIntroChrome: true,
      isDesktop: true,
      scrollY: 0,
      transitionRange: VIEWPORT_INTRO_RANGE,
    });

    expect(model).toEqual({ state: "banner", progress: 0 });
  });

  it("switches the desktop homepage to content state on positive scroll", () => {
    const model = getSiteHeaderScrollModel({
      homepageIntroChrome: true,
      isDesktop: true,
      scrollY: 1,
      transitionRange: VIEWPORT_INTRO_RANGE,
    });

    expect(model).toEqual({
      state: "content",
      progress: 1 / VIEWPORT_INTRO_RANGE,
    });
  });

  it("uses viewport-minus-content-header range for desktop homepage progress", () => {
    expect(clampHeaderProgress(418, VIEWPORT_INTRO_RANGE)).toBe(0.5);
    expect(clampHeaderProgress(836, VIEWPORT_INTRO_RANGE)).toBe(1);
    expect(clampHeaderProgress(900, VIEWPORT_INTRO_RANGE)).toBe(1);
  });

  it("progresses monotonically to the midpoint and clamps oversized scroll", () => {
    const midpoint = CONTENT_HEADER_HEIGHT / 2;

    expect(clampHeaderProgress(midpoint, CONTENT_HEADER_HEIGHT)).toBe(0.5);
    expect(clampHeaderProgress(CONTENT_HEADER_HEIGHT, CONTENT_HEADER_HEIGHT)).toBe(1);
    expect(clampHeaderProgress(CONTENT_HEADER_HEIGHT * 2, CONTENT_HEADER_HEIGHT)).toBe(1);
  });

  it("clamps negative scroll and invalid ranges to transparent progress", () => {
    expect(clampHeaderProgress(-1, CONTENT_HEADER_HEIGHT)).toBe(0);
    expect(clampHeaderProgress(1, 0)).toBe(0);
    expect(clampHeaderProgress(1, -CONTENT_HEADER_HEIGHT)).toBe(0);
  });

  it("keeps non-home pages in content state regardless of scroll", () => {
    const model = getSiteHeaderScrollModel({
      homepageIntroChrome: false,
      isDesktop: true,
      scrollY: 0,
      transitionRange: CONTENT_HEADER_HEIGHT,
    });

    expect(model).toEqual({ state: "content", progress: 1 });
  });

  it("keeps non-desktop homepage chrome in content state for unchanged mobile visuals", () => {
    const model = getSiteHeaderScrollModel({
      homepageIntroChrome: true,
      isDesktop: false,
      scrollY: 0,
      transitionRange: CONTENT_HEADER_HEIGHT,
    });

    expect(model).toEqual({ state: "content", progress: 1 });
  });
});
