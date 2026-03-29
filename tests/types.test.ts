import { describe, it, expect } from "vitest";
import { toCents, fromCents } from "../src/types.js";

describe("toCents", () => {
  it("converts dollars to cents", () => {
    expect(toCents(0.50)).toBe(50);
    expect(toCents(1.00)).toBe(100);
    expect(toCents(0.02)).toBe(2);
    expect(toCents(99.99)).toBe(9999);
  });
  it("rounds to nearest cent", () => {
    expect(toCents(0.005)).toBe(1);
    expect(toCents(0.004)).toBe(0);
  });
});

describe("fromCents", () => {
  it("converts cents to dollars", () => {
    expect(fromCents(50)).toBe(0.50);
    expect(fromCents(100)).toBe(1.00);
    expect(fromCents(2)).toBe(0.02);
  });
});
