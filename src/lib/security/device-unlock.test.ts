import { describe, expect, it } from "vitest";
import {
  formatDevicePin,
  parseBiometric,
  parseDevicePin,
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
