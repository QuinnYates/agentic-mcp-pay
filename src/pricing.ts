import { toCents, type ToolPricing } from "./types.js";

export interface ResolvedPrice { amountCents: number; currency: string; }

export class PricingTable {
  private prices: Map<string, ResolvedPrice>;

  constructor(pricing: Record<string, ToolPricing>) {
    this.prices = new Map();
    for (const [tool, config] of Object.entries(pricing)) {
      this.prices.set(tool, { amountCents: toCents(config.amount), currency: config.currency });
    }
  }

  getPrice(tool: string): ResolvedPrice | null {
    return this.prices.get(tool) ?? null;
  }

  isPaid(tool: string): boolean {
    return this.prices.has(tool);
  }
}
