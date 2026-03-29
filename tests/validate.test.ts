import { describe, it, expect } from "vitest";
import { isValidEIP55Address, validatePayTo, validateAmount } from "../src/security/validate.js";

describe("isValidEIP55Address", () => {
  it("accepts valid checksummed address", () => {
    expect(isValidEIP55Address("0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045")).toBe(true);
  });
  it("rejects all-lowercase (not checksummed)", () => {
    expect(isValidEIP55Address("0xd8da6bf26964af9d7eed9e03e53415d37aa96045")).toBe(false);
  });
  it("rejects wrong length", () => {
    expect(isValidEIP55Address("0x1234")).toBe(false);
  });
  it("rejects non-hex characters", () => {
    expect(isValidEIP55Address("0xGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGG")).toBe(false);
  });
});

describe("validatePayTo", () => {
  it("throws on invalid address", () => {
    expect(() => validatePayTo("not-an-address")).toThrow("Invalid payTo address");
  });
  it("does not throw on valid address", () => {
    expect(() => validatePayTo("0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045")).not.toThrow();
  });
});

describe("validateAmount", () => {
  it("returns true when amounts match", () => {
    expect(validateAmount(50, 50)).toBe(true);
  });
  it("returns false when paid less than required", () => {
    expect(validateAmount(49, 50)).toBe(false);
  });
  it("returns true when overpaid", () => {
    expect(validateAmount(51, 50)).toBe(true);
  });
});
