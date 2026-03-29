import { describe, it, expect } from "vitest";
import { PricingTable } from "../src/pricing.js";

describe("PricingTable", () => {
  const table = new PricingTable({
    "format-manuscript": { amount: 0.50, currency: "usd" },
    "check-compliance": { amount: 0.02, currency: "usd" },
  });

  it("returns price in cents for a paid tool", () => {
    const price = table.getPrice("format-manuscript");
    expect(price).toEqual({ amountCents: 50, currency: "usd" });
  });
  it("returns null for a free (unlisted) tool", () => {
    expect(table.getPrice("free-tool")).toBeNull();
  });
  it("identifies paid tools", () => {
    expect(table.isPaid("format-manuscript")).toBe(true);
    expect(table.isPaid("free-tool")).toBe(false);
  });
});
