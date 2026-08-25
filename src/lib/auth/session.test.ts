import { describe, it, expect } from "vitest";
import { createWpSessionToken, verifySessionToken } from "./session";

describe("createWpSessionToken", () => {
  it("mints a verifiable session with wp provider and synthesized sub", () => {
    const token = createWpSessionToken({
      wpUserId: "42",
      email: "user@example.com",
      name: "Test User",
    });

    const decoded = verifySessionToken(token);
    expect(decoded).not.toBeNull();
    expect(decoded?.provider).toBe("wp");
    expect(decoded?.sub).toBe("wp-42");
    expect(decoded?.wpUserId).toBe("42");
    expect(decoded?.email).toBe("user@example.com");
    expect(decoded?.name).toBe("Test User");
  });

  it("round-trips through verifySessionToken (valid signature, not expired)", () => {
    const token = createWpSessionToken({ wpUserId: "7", name: "A" });
    expect(verifySessionToken(token)?.wpUserId).toBe("7");
  });
});
