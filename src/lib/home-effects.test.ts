import { describe, expect, it } from "vitest";
import {
  parseHomeEffectsPreference,
  serializeHomeEffectsPreference,
} from "./home-effects";

describe("home effects preference", () => {
  it("defaults unknown values to enabled", () => {
    expect(parseHomeEffectsPreference(null)).toBe(true);
    expect(parseHomeEffectsPreference("unexpected")).toBe(true);
  });

  it("round-trips the explicit disabled preference", () => {
    expect(serializeHomeEffectsPreference(false)).toBe("disabled");
    expect(parseHomeEffectsPreference("disabled")).toBe(false);
    expect(serializeHomeEffectsPreference(true)).toBe("enabled");
  });
});
