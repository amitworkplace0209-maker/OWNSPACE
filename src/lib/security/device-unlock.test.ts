import { describe, expect, it } from "vitest";
import {
  formatDevicePin,
  hasValidAssertionFlags,
  parseBiometric,
  parseDevicePin,
  readAssertionCounter,
} from "@/lib/security/device-unlock.client";

/**
 * The stored records on this device are the security boundary between "this
 * device has a PIN" and "it does not". Every malformed shape must read as
 * absent, because treating a corrupt record as a match is an unlock nobody
 * earned, and treating one as a mismatch locks somebody out of their own
 * workspace.
 */
describe("parseDevicePin", () => {
  const valid = `pbkdf2$${210000}$${"ab".repeat(16)}$${"cd".repeat(32)}`;

  it("accepts a well-formed record", () => {
    const record = parseDevicePin(valid);
    expect(record?.iterations).toBe(210_000);
    expect(record?.saltHex).toBe("ab".repeat(16));
    expect(record?.hashHex).toBe("cd".repeat(32));
  });

  it("normalises hex case", () => {
    const upper = `pbkdf2$210000$${"AB".repeat(16)}$${"CD".repeat(32)}`;
    expect(parseDevicePin(upper)?.hashHex).toBe("cd".repeat(32));
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
    expect(parseDevicePin(raw)).toBeNull();
  });

  it("round-trips through format", () => {
    const record = parseDevicePin(valid)!;
    expect(parseDevicePin(formatDevicePin(record))).toEqual(record);
  });
});

describe("parseBiometric", () => {
  const valid = JSON.stringify({
    credentialId: "Y3JlZA",
    publicKey: "cHVibGlj",
    algorithm: -7,
    counter: 3,
    transports: ["internal"],
  });

  it("accepts a well-formed record", () => {
    const record = parseBiometric(valid);
    expect(record?.credentialId).toBe("Y3JlZA");
    expect(record?.algorithm).toBe(-7);
    expect(record?.counter).toBe(3);
    expect(record?.transports).toEqual(["internal"]);
  });

  it("defaults a missing counter to zero", () => {
    const record = parseBiometric(
      JSON.stringify({ credentialId: "a", publicKey: "b", algorithm: -7 })
    );
    expect(record?.counter).toBe(0);
    expect(record?.transports).toEqual([]);
  });

  it("accepts RS256 credentials as well as ES256", () => {
    expect(
      parseBiometric(JSON.stringify({ credentialId: "a", publicKey: "b", algorithm: -257 }))
        ?.algorithm
    ).toBe(-257);
  });

  it.each([
    ["null", null],
    ["empty", ""],
    ["not json", "{"],
    ["no credential id", JSON.stringify({ publicKey: "b", algorithm: -7 })],
    ["no public key", JSON.stringify({ credentialId: "a", algorithm: -7 })],
    ["unknown algorithm", JSON.stringify({ credentialId: "a", publicKey: "b", algorithm: -99 })],
  ])("rejects %s", (_label, raw) => {
    expect(parseBiometric(raw)).toBeNull();
  });
});

describe("WebAuthn assertion data", () => {
  function authenticatorData(flags: number, counter = 0): Uint8Array {
    const data = new Uint8Array(37);
    data[32] = flags;
    data[33] = (counter >>> 24) & 0xff;
    data[34] = (counter >>> 16) & 0xff;
    data[35] = (counter >>> 8) & 0xff;
    data[36] = counter & 0xff;
    return data;
  }

  it("requires both user presence and user verification", () => {
    expect(hasValidAssertionFlags(authenticatorData(0x05))).toBe(true);
    expect(hasValidAssertionFlags(authenticatorData(0x01))).toBe(false);
    expect(hasValidAssertionFlags(authenticatorData(0x04))).toBe(false);
    expect(hasValidAssertionFlags(new Uint8Array(36))).toBe(false);
  });

  it("reads the counter from bytes 33-36 regardless of the AT flag", () => {
    expect(readAssertionCounter(authenticatorData(0x05, 42))).toBe(42);
    expect(readAssertionCounter(authenticatorData(0x45, 7))).toBe(7);
    expect(readAssertionCounter(new Uint8Array(37))).toBe(0);
  });
});
