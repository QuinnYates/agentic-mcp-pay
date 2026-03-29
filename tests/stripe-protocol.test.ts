import { describe, it, expect, vi, beforeEach } from "vitest";
import { StripeProtocol } from "../src/protocols/stripe-protocol.js";
import { ErrorCode } from "../src/types.js";

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

describe("StripeProtocol", () => {
  const protocol = new StripeProtocol({ secretKey: "sk_test_fake123" });

  beforeEach(() => { mockFetch.mockReset(); });

  it("creates a challenge with stripe fields", () => {
    const challenge = protocol.createChallenge("test-tool", 999, "usd", "acct_test");
    expect(challenge.protocol).toBe("stripe");
    expect(challenge.amount).toBe(999);
    expect(challenge.currency).toBe("usd");
    expect(challenge.payTo).toBe("acct_test");
    expect(challenge.nonce).toHaveLength(64);
    expect(challenge.expiresAt).toBeGreaterThan(Date.now());
  });

  it("verifies a succeeded PaymentIntent", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ id: "pi_abc123", status: "succeeded", amount: 999, currency: "usd" }),
    });
    const challenge = protocol.createChallenge("test-tool", 999, "usd", "acct_test");
    const result = await protocol.verifyPayment(challenge, "pi_abc123");
    expect(result.verified).toBe(true);
    expect(result.txHash).toBe("pi_abc123");
    expect(result.paidCents).toBe(999);
    expect(mockFetch).toHaveBeenCalledOnce();
    expect(mockFetch).toHaveBeenCalledWith(
      "https://api.stripe.com/v1/payment_intents/pi_abc123",
      expect.objectContaining({ headers: expect.objectContaining({ Authorization: "Bearer sk_test_fake123" }) })
    );
  });

  it("rejects a PaymentIntent that has not succeeded", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ id: "pi_abc123", status: "requires_payment_method", amount: 999, currency: "usd" }),
    });
    const challenge = protocol.createChallenge("test-tool", 999, "usd", "acct_test");
    const result = await protocol.verifyPayment(challenge, "pi_abc123");
    expect(result.verified).toBe(false);
    expect(result.errorCode).toBe(ErrorCode.PAYMENT_INVALID);
    expect(result.error).toContain("requires_payment_method");
  });

  it("rejects underpayment when paid amount is less than required", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ id: "pi_abc123", status: "succeeded", amount: 500, currency: "usd" }),
    });
    const challenge = protocol.createChallenge("test-tool", 999, "usd", "acct_test");
    const result = await protocol.verifyPayment(challenge, "pi_abc123");
    expect(result.verified).toBe(false);
    expect(result.errorCode).toBe(ErrorCode.PAYMENT_UNDERPAID);
    expect(result.paidCents).toBe(500);
    expect(result.error).toContain("500");
    expect(result.error).toContain("999");
  });

  it("handles Stripe API HTTP error (downtime)", async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 503 });
    const challenge = protocol.createChallenge("test-tool", 999, "usd", "acct_test");
    const result = await protocol.verifyPayment(challenge, "pi_abc123");
    expect(result.verified).toBe(false);
    expect(result.errorCode).toBe(ErrorCode.VERIFICATION_UNAVAILABLE);
    expect(result.error).toContain("503");
  });

  it("opens circuit breaker after 3 consecutive failures", async () => {
    // Use a fresh instance so circuit state is isolated
    const proto = new StripeProtocol({ secretKey: "sk_test_fake123" });

    for (let i = 0; i < 3; i++) {
      mockFetch.mockRejectedValueOnce(new Error("ECONNREFUSED"));
      const ch = proto.createChallenge("test-tool", 999, "usd", "acct_test");
      await proto.verifyPayment(ch, "pi_abc123");
    }

    mockFetch.mockClear();
    const ch = proto.createChallenge("test-tool", 999, "usd", "acct_test");
    const result = await proto.verifyPayment(ch, "pi_abc123");

    expect(result.verified).toBe(false);
    expect(result.errorCode).toBe(ErrorCode.VERIFICATION_UNAVAILABLE);
    expect(result.error).toContain("circuit open");
    expect(mockFetch).not.toHaveBeenCalled();
  });
});
