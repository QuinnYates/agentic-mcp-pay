import { describe, it, expect } from "vitest";
import { MockProtocol } from "../src/protocols/mock.js";

describe("MockProtocol", () => {
  it("creates a challenge with correct fields", () => {
    const mock = new MockProtocol({ shouldVerify: true });
    const challenge = mock.createChallenge("test-tool", 50, "usd", "0xABC");
    expect(challenge.version).toBe(1);
    expect(challenge.protocol).toBe("mock");
    expect(challenge.amount).toBe(50);
    expect(challenge.currency).toBe("usd");
    expect(challenge.payTo).toBe("0xABC");
    expect(challenge.nonce).toMatch(/^[a-f0-9]{64}$/);
    expect(challenge.expiresAt).toBeGreaterThan(Date.now());
  });
  it("verifies successfully when configured to", async () => {
    const mock = new MockProtocol({ shouldVerify: true });
    const challenge = mock.createChallenge("test-tool", 50, "usd", "0xABC");
    const result = await mock.verifyPayment(challenge, "any-proof");
    expect(result.verified).toBe(true);
    expect(result.txHash).toBeTruthy();
  });
  it("rejects when configured to", async () => {
    const mock = new MockProtocol({ shouldVerify: false });
    const challenge = mock.createChallenge("test-tool", 50, "usd", "0xABC");
    const result = await mock.verifyPayment(challenge, "any-proof");
    expect(result.verified).toBe(false);
    expect(result.errorCode).toBe("PAYMENT_INVALID");
  });
});
