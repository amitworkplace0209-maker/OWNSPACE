import { describe, expect, it } from "vitest";
import {
  deriveLocalMpin,
  formatStoredMpin,
  parseStoredMpin,
  safeEqualHex,
} from "@/lib/security/local-mpin.client";

/**
 * The stored record's parsing is the security boundary between "this device has
 * an MPIN" and "it does not". Every one of these malformed shapes must read as
 * absent, because treating a corrupt record as a match is an unlock nobody
 * earned and treating one as a mismatch locks a user out of their own data.
 */
describe("parseStoredMpin", () => {
  const valid = `pbkdf2$${210000}$${"ab".repeat(16)}$${"cd".repeat(32)}`;

  it("accepts a well-formed record", () => {
    const record = parseStoredMpin(valid);
    expect(record).not.toBeNull();
    expect(record?.iterations).toBe(210_000);
    expect(record?.saltHex).toBe("ab".repeat(16));
    expect(record?.hashHex).toBe("cd".repeat(32));
  });

  it("normalises hex case", () => {
    const upper = `pbkdf2$210000$${"AB".repeat(16)}$${"CD".repeat(32)}`;
    expect(parseStoredMpin(upper)?.hashHex).toBe("cd".repeat(32));
  });

  it.each([
    ["null", null],
    ["empty", ""],
    ["wrong prefix", `scrypt$210000$${"ab".repeat(16)}$${"cd".repeat(32)}`],
    ["too few parts", `pbkdf2$210000$${"ab".repeat(16)}`],
    ["non-numeric iterations", `pbkdf2$many$${"ab".repeat(16)}$${"cd".repeat(32)}`],
    ["zero iterations", `pbkdf2$0$${"ab".repeat(16)}$${"cd".repeat(32)}`],
    ["absurd cost", `pbkdf2$99999999$${"ab".repeat(16)}$${"cd".repeat(32)}`],
    ["non-hex salt", `pbkdf2$210000$${"zz".repeat(16)}$${"cd".repeat(32)}`],
    ["short salt", `pbkdf2$210000$${"ab".repeat(4)}$${"cd".repeat(32)}`],
    ["short hash", `pbkdf2$210000$${"ab".repeat(16)}${"cd".repeat(8)}`],
  ])("rejects %s", (_label, raw) => {
    expect(parseStoredMpin(raw)).toBeNull();
  });

  it("round-trips through format", () => {
    const record = parseStoredMpin(valid)!;
    expect(parseStoredMpin(formatStoredMpin(record))).toEqual(record);
  });
});

describe("safeEqualHex", () => {
  it("matches identical strings", () => {
    expect(safeEqualHex("abcdef", "abcdef")).toBe(true);
  });

  it("rejects a difference in the last character", () => {
    expect(safeEqualHex("abcdef", "abcdeg")).toBe(false);
  });

  it("rejects a difference in the first character", () => {
    expect(safeEqualHex("abcdef", "zbcdef")).toBe(false);
  });

  it("rejects different lengths", () => {
    expect(safeEqualHex("abcdef", "abcde")).toBe(false);
  });
});

/**
 * Node's global WebCrypto is the same `subtle` the browser exposes, so this
 * exercises the real derivation rather than a stub. The cost is deliberately
 * overridden — the shipped 210k iterations is right for a phone unlocking and
 * wrong for a unit test that runs on every save.
 */
describe("deriveLocalMpin", () => {
  const salt = "ab".repeat(16);

  it("is deterministic for the same PIN, salt and cost", async () => {
    const first = await deriveLocalMpin("482913", salt, 1_000);
    const second = await deriveLocalMpin("482913", salt, 1_000);
    expect(first).toBe(second);
  });

  it("produces a different digest for a different PIN", async () => {
    const a = await deriveLocalMpin("482913", salt, 1_000);
    const b = await deriveLocalMpin("482914", salt, 1_000);
    expect(a).not.toBe(b);
  });

  it("produces a different digest for a different salt", async () => {
    const a = await deriveLocalMpin("482913", salt, 1_000);
    const b = await deriveLocalMpin("482913", "cd".repeat(16), 1_000);
    expect(a).not.toBe(b);
  });

  it("is 256 bits wide, hex encoded", async () => {
    expect(await deriveLocalMpin("482913", salt, 1_000)).toHaveLength(64);
  });
});