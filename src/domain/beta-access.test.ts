import { describe, expect, it } from "vitest";

import { maskBetaContact, normalizeBetaContact } from "./beta-access";

describe("beta access contacts", () => {
  it("normalizes an email and Telegram username", () => {
    expect(normalizeBetaContact("EMAIL", " Owner@Example.COM ")).toBe("owner@example.com");
    expect(normalizeBetaContact("TELEGRAM", "@Owner_123")).toBe("owner_123");
  });

  it("rejects invalid contacts and masks email in public UI", () => {
    expect(normalizeBetaContact("TELEGRAM", "@a")).toBeNull();
    expect(normalizeBetaContact("EMAIL", "not-an-email")).toBeNull();
    expect(maskBetaContact("EMAIL", "owner@example.com")).toBe("ow***@example.com");
  });
});
