import { describe, it, expect, vi, beforeEach } from "vitest";
import { X402Protocol } from "../src/protocols/x402.js";

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

describe("X402Protocol", () => {
  const protocol = new X402Protocol({ facilitatorUrl: "https://x402.org/facilitator", network: "base", token: "USDC" });

  beforeEach(() => { mockFetch.mockReset(); });

  it("creates a challenge with x402 fields", () => {
    const challenge = protocol.createChallenge("test-tool", 50, "usd", "0xABC");
    expect(challenge.protocol).toBe("x402");
    expect(challenge.network).toBe("base");
    expect(challenge.token).toBe("USDC");
    expect(challenge.amount).toBe(50);
  });

  it("verifies payment via facilitator HTTP API", async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({ success: true, txHash: "0xabc123", confirmations: 1 }) });
    const challenge = protocol.createChallenge("test-tool", 50, "usd", "0xABC");
    const result = await protocol.verifyPayment(challenge, "signed-payment-data");
    expect(result.verified).toBe(true);
    expect(result.txHash).toBe("0xabc123");
    expect(mockFetch).toHaveBeenCalledOnce();
  });

  it("handles facilitator rejection", async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({ success: false, error: "Invalid signature" }) });
    const challenge = protocol.createChallenge("test-tool", 50, "usd", "0xABC");
    const result = await protocol.verifyPayment(challenge, "bad-data");
    expect(result.verified).toBe(false);
    expect(result.errorCode).toBe("PAYMENT_INVALID");
  });

  it("handles facilitator downtime", async () => {
    mockFetch.mockRejectedValueOnce(new Error("Connection refused"));
    const challenge = protocol.createChallenge("test-tool", 50, "usd", "0xABC");
    const result = await protocol.verifyPayment(challenge, "signed-data");
    expect(result.verified).toBe(false);
    expect(result.errorCode).toBe("VERIFICATION_UNAVAILABLE");
  });

  it("opens circuit breaker after 3 consecutive failures", async () => {
    for (let i = 0; i < 3; i++) {
      mockFetch.mockRejectedValueOnce(new Error("Connection refused"));
      const ch = protocol.createChallenge("test-tool", 50, "usd", "0xABC");
      await protocol.verifyPayment(ch, "data");
    }
    mockFetch.mockClear();
    const ch = protocol.createChallenge("test-tool", 50, "usd", "0xABC");
    const result = await protocol.verifyPayment(ch, "data");
    expect(result.verified).toBe(false);
    expect(result.errorCode).toBe("VERIFICATION_UNAVAILABLE");
    expect(result.error).toContain("circuit open");
    expect(mockFetch).not.toHaveBeenCalled();
  });
});
