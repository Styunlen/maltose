import { describe, expect, it } from "vitest";

import {
  MC_AVATAR_HIDDEN_VALUE,
  MC_AVATAR_VISIBILITY_STORAGE_KEY,
  MC_AVATAR_VISIBLE_VALUE,
  parseMcAvatarVisibility,
  readMcAvatarVisibility,
  serializeMcAvatarVisibility,
  writeMcAvatarVisibility,
} from "./mc-avatar-visibility";

function createMemoryStorage(initial?: string): Pick<Storage, "getItem" | "setItem"> {
  const values = new Map<string, string>();
  if (initial !== undefined) {
    values.set(MC_AVATAR_VISIBILITY_STORAGE_KEY, initial);
  }

  return {
    getItem(key) {
      return values.get(key) ?? null;
    },
    setItem(key, value) {
      values.set(key, value);
    },
  };
}

describe("mc avatar visibility helpers", () => {
  it("defaults to visible for missing and unknown storage values", () => {
    expect(parseMcAvatarVisibility(null)).toBe(true);
    expect(parseMcAvatarVisibility("unexpected")).toBe(true);
    expect(parseMcAvatarVisibility(MC_AVATAR_VISIBLE_VALUE)).toBe(true);
  });

  it("parses the hidden storage value", () => {
    expect(parseMcAvatarVisibility(MC_AVATAR_HIDDEN_VALUE)).toBe(false);
  });

  it("serializes visible and hidden states", () => {
    expect(serializeMcAvatarVisibility(true)).toBe(MC_AVATAR_VISIBLE_VALUE);
    expect(serializeMcAvatarVisibility(false)).toBe(MC_AVATAR_HIDDEN_VALUE);
  });

  it("reads and writes the persisted preference", () => {
    const storage = createMemoryStorage();

    expect(readMcAvatarVisibility(storage)).toBe(true);
    expect(writeMcAvatarVisibility(storage, false)).toBe(true);
    expect(readMcAvatarVisibility(storage)).toBe(false);
    expect(writeMcAvatarVisibility(storage, true)).toBe(true);
    expect(readMcAvatarVisibility(storage)).toBe(true);
  });

  it("falls back to visible when storage reads fail", () => {
    const storage: Pick<Storage, "getItem"> = {
      getItem() {
        throw new Error("blocked storage");
      },
    };

    expect(readMcAvatarVisibility(storage)).toBe(true);
  });

  it("reports failed writes without throwing", () => {
    const storage: Pick<Storage, "setItem"> = {
      setItem() {
        throw new Error("blocked storage");
      },
    };

    expect(writeMcAvatarVisibility(storage, false)).toBe(false);
  });
});
