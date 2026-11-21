import { describe, expect, it } from "vitest";
import { timingSafeEqualText } from "@/lib/security/timing-safe";

describe("timingSafeEqualText", () => {
  it("accepts an exact match", () => {
    expect(timingSafeEqualText("secret", "secret")).toBe(true);
  });

  it("rejects a different value of the same length", () => {
    expect(timingSafeEqualText("secret", "secrex")).toBe(false);
  });

  it("rejects a different length", () => {
    expect(timingSafeEqualText("secret", "secret2")).toBe(false);
    expect(timingSafeEqualText("secret", "")).toBe(false);
  });
});
