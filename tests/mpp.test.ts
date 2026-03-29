import { describe, it, expect, vi, beforeEach } from "vitest";
import { MppProtocol } from "../src/protocols/mpp.js";

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

describe("MppProtocol", () => {
  const protocol = new MppProtocol({ apiUrl: "https://mpp.example.com/verify", network: "ethereum" });

  beforeEach(() => { mockFetch.mockReset(); });

  it("creates a challenge with mpp fields", () => {
    const challenge = protocol.createChallenge("test-tool", 100, "usd", "0xDEF");
    expect(challenge.protocol).toBe("mpp");
    expect(challenge.network).toBe("ethereum");
    expect(challenge.token).toBe("USD");
    expect(challenge.amount).toBe(100);
  });

  it("verifies payment via API (mock fetch)", async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({ success: true, txHash: "0xdef456", confirmations: 2 }) });
    const challenge = protocol.createChallenge("test-tool", 100, "usd", "0xDEF");
    const result = await protocol.verifyPayment(challenge, "signed-mpp-payment");
    expect(result.verified).toBe(true);
    expect(result.txHash).toBe("0xdef456");
    expect(mockFetch).toHaveBeenCalledOnce();
  });

  it("handles rejection", async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({ success: false, error: "Invalid MPP proof" }) });
    const challenge = protocol.createChallenge("test-tool", 100, "usd", "0xDEF");
    const result = await protocol.verifyPayment(challenge, "bad-proof");
    expect(result.verified).toBe(false);
    expect(result.errorCode).toBe("PAYMENT_INVALID");
  });

  it("handles downtime", async () => {
    mockFetch.mockRejectedValueOnce(new Error("Connection refused"));
    const challenge = protocol.createChallenge("test-tool", 100, "usd", "0xDEF");
    const result = await protocol.verifyPayment(challenge, "signed-data");
    expect(result.verified).toBe(false);
    expect(result.errorCode).toBe("VERIFICATION_UNAVAILABLE");
  });

  it("circuit breaker after 3 failures", async () => {
    for (let i = 0; i < 3; i++) {
      mockFetch.mockRejectedValueOnce(new Error("Connection refused"));
      const ch = protocol.createChallenge("test-tool", 100, "usd", "0xDEF");
      await protocol.verifyPayment(ch, "data");
    }
    mockFetch.mockClear();
    const ch = protocol.createChallenge("test-tool", 100, "usd", "0xDEF");
    const result = await protocol.verifyPayment(ch, "data");
    expect(result.verified).toBe(false);
    expect(result.errorCode).toBe("VERIFICATION_UNAVAILABLE");
    expect(result.error).toContain("circuit open");
    expect(mockFetch).not.toHaveBeenCalled();
  });
});
