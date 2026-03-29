import { describe, it, expect } from "vitest";
import { generateNonce } from "../src/security/nonce.js";

describe("generateNonce", () => {
  it("returns a 64-character hex string (32 bytes)", () => {
    const nonce = generateNonce();
    expect(nonce).toMatch(/^[a-f0-9]{64}$/);
  });
  it("generates unique nonces", () => {
    const nonces = new Set(Array.from({ length: 100 }, () => generateNonce()));
    expect(nonces.size).toBe(100);
  });
});
