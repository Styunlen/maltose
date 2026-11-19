import { describe, expect, it } from "vitest";
import {
  isDeepOrigin,
  keyboardTarget,
  shouldAbsorbUpward,
  switchTarget,
} from "./banner-snap";

const H = 800; // banner height used across cases
const THRESHOLD = 1200; // px/s
const FAST = 2400;
const SLOW = 600;

describe("isDeepOrigin", () => {
  it("only treats starts clearly below the content top as deep", () => {
    expect(isDeepOrigin(0, H)).toBe(false);
    expect(isDeepOrigin(H, H)).toBe(false);
    expect(isDeepOrigin(H + 16, H)).toBe(false);
    expect(isDeepOrigin(H + 17, H)).toBe(true);
    expect(isDeepOrigin(5000, H)).toBe(true);
  });
});

describe("switchTarget", () => {
  it("switches down to H for a fast gesture that began in the banner", () => {
    expect(switchTarget(0, 0, H, 1, FAST, THRESHOLD)).toBe(H);
    expect(switchTarget(0, 300, H, 1, FAST, THRESHOLD)).toBe(H);
    expect(switchTarget(H - 10, H - 40, H, 1, FAST, THRESHOLD)).toBe(H);
  });

  it("switches up to 0 from the banner zone or the content top", () => {
    expect(switchTarget(0, 300, H, -1, FAST, THRESHOLD)).toBe(0);
    expect(switchTarget(H - 300, 300, H, -1, FAST, THRESHOLD)).toBe(0);
    expect(switchTarget(H, H, H, -1, FAST, THRESHOLD)).toBe(0);
  });

  it("keeps slow gestures and unknown directions free", () => {
    expect(switchTarget(0, 300, H, 1, SLOW, THRESHOLD)).toBeNull();
    expect(switchTarget(0, 300, H, 0, FAST, THRESHOLD)).toBeNull();
  });

  it("never hijacks gestures that began inside the content", () => {
    expect(switchTarget(H + 200, 1200, H, 1, FAST, THRESHOLD)).toBeNull();
    expect(switchTarget(H + 200, 300, H, -1, FAST, THRESHOLD)).toBeNull();
  });

  it("absorbs deep-content upward gestures at H (fresh gesture needed)", () => {
    expect(switchTarget(5000, H, H, -1, FAST, THRESHOLD)).toBeNull();
  });

  it("does nothing when already at the target rest position", () => {
    expect(switchTarget(0, 0, H, -1, FAST, THRESHOLD)).toBeNull();
    expect(switchTarget(0, H, H, 1, FAST, THRESHOLD)).toBeNull();
    expect(switchTarget(H, H - 10, H, 1, FAST, THRESHOLD)).toBeNull();
  });

  it("never switches without a banner", () => {
    expect(switchTarget(0, 0, 0, 1, FAST, THRESHOLD)).toBeNull();
  });
});

describe("shouldAbsorbUpward", () => {
  it("swallows upward input once a deep-origin gesture reached the top", () => {
    expect(shouldAbsorbUpward(H, 5000, -1, H)).toBe(true);
    expect(shouldAbsorbUpward(H, 5000, -1, H - 50)).toBe(true);
  });

  it("does not swallow for banner-origin gestures (top swipe must switch)", () => {
    expect(shouldAbsorbUpward(H, 0, -1, H)).toBe(false);
    expect(shouldAbsorbUpward(H, H, -1, H)).toBe(false);
  });

  it("does not swallow while the target is still below the content top", () => {
    expect(shouldAbsorbUpward(H, 5000, -1, H + 100)).toBe(false);
  });

  it("does not swallow downward movement", () => {
    expect(shouldAbsorbUpward(H, 5000, 1, H)).toBe(false);
    expect(shouldAbsorbUpward(H, 5000, 0, H)).toBe(false);
  });
});

describe("keyboardTarget", () => {
  const step = 700;
  const maxY = 6000;

  it("switches down from the banner or the zone", () => {
    expect(keyboardTarget("PageDown", false, 0, H, maxY, step)).toBe(H);
    expect(keyboardTarget(" ", false, 200, H, maxY, step)).toBe(H);
  });

  it("steps down normally inside the content", () => {
    expect(keyboardTarget("PageDown", false, H + 100, H, maxY, step)).toBe(
      H + 100 + step,
    );
    expect(keyboardTarget("PageDown", false, 5900, H, maxY, step)).toBe(maxY);
  });

  it("switches back up only at the content top", () => {
    expect(keyboardTarget("PageUp", false, H, H, maxY, step)).toBe(0);
    expect(keyboardTarget("PageUp", false, H + 10, H, maxY, step)).toBe(0);
    expect(keyboardTarget(" ", true, H, H, maxY, step)).toBe(0);
  });

  it("steps up but absorbs at the content top when deep", () => {
    // 到顶后再滑
    expect(keyboardTarget("PageUp", false, H + 600, H, maxY, step)).toBe(H);
    expect(keyboardTarget("PageUp", false, 3000, H, maxY, step)).toBe(
      3000 - step,
    );
  });

  it("ignores unrelated keys and absent banner", () => {
    expect(keyboardTarget("a", false, 0, H, maxY, step)).toBeNull();
    expect(keyboardTarget("ArrowDown", false, 0, 0, maxY, step)).toBeNull();
  });

  it("supports arrow keys like page keys", () => {
    expect(keyboardTarget("ArrowDown", false, 0, H, maxY, step)).toBe(H);
    expect(keyboardTarget("ArrowUp", false, H, H, maxY, step)).toBe(0);
    expect(keyboardTarget("ArrowUp", false, 3000, H, maxY, step)).toBe(
      3000 - step,
    );
  });
});
