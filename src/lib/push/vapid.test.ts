import { describe, expect, it } from "vitest";
import { base64UrlToBytes, bytesToBase64Url } from "@/lib/push/vapid";

/**
 * These exercise the encoding primitives the push transport is built on.
 *
 * The encryption and signing themselves need a live VAPID key pair in the
 * environment and a network to push to, so they are covered by
 * `scripts/generate-vapid.cjs` failing loudly instead — what is tested here is
 * the part that silently corrupts a message when it is wrong.
 */

describe("base64url round trip", () => {
  it("survives a round trip for every byte value", () => {
    const bytes = new Uint8Array(256);
    for (let index = 0; index < 256; index += 1) bytes[index] = index;

    const encoded = bytesToBase64Url(bytes);
    expect(encoded).not.toContain("+");
    expect(encoded).not.toContain("/");
    expect(encoded).not.toContain("=");

    const decoded = base64UrlToBytes(encoded);
    expect(Array.from(decoded)).toEqual(Array.from(bytes));
  });

  it("emits unpadded output, which every push header requires", () => {
    // 1 byte encodes to "AA==" in padded base64.
    expect(bytesToBase64Url(new Uint8Array([0]))).toBe("AA");
    expect(bytesToBase64Url(new Uint8Array([1, 2]))).toBe("AQI");
  });

  it("decodes input that is missing its padding", () => {
    expect(Array.from(base64UrlToBytes("AQI"))).toEqual([1, 2]);
  });

  it("accepts padded input too, since some sources include it", () => {
    expect(Array.from(base64UrlToBytes("AQI="))).toEqual([1, 2]);
  });

  it("handles an empty input", () => {
    expect(bytesToBase64Url(new Uint8Array(0))).toBe("");
    expect(base64UrlToBytes("").length).toBe(0);
  });

  it("handles the length of a real P-256 public key", () => {
    // The uncompressed point is 0x04 + 32-byte X + 32-byte Y.
    const point = new Uint8Array(65);
    point[0] = 0x04;
    for (let index = 1; index < 65; index += 1) point[index] = index;

    expect(base64UrlToBytes(bytesToBase64Url(point)).length).toBe(65);
  });
});