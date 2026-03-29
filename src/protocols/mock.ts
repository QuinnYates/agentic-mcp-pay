import type { PaymentProtocol } from "./interface.js";
import type { PaymentChallenge, VerificationResult } from "../types.js";
import { generateNonce } from "../security/nonce.js";

export interface MockProtocolOptions { shouldVerify: boolean; delayMs?: number; }

export class MockProtocol implements PaymentProtocol {
  name = "mock";
  private shouldVerify: boolean;
  private delayMs: number;

  constructor(options: MockProtocolOptions) {
    this.shouldVerify = options.shouldVerify;
    this.delayMs = options.delayMs ?? 0;
  }

  createChallenge(tool: string, amountCents: number, currency: string, payTo: string): PaymentChallenge {
    return { version: 1, protocol: this.name, amount: amountCents, currency, nonce: generateNonce(), payTo, network: "mock-network", token: "MOCK", expiresAt: Date.now() + 300_000 };
  }

  async verifyPayment(_challenge: PaymentChallenge, _proof: string): Promise<VerificationResult> {
    if (this.delayMs > 0) await new Promise((r) => setTimeout(r, this.delayMs));
    if (this.shouldVerify) return { verified: true, txHash: "0xmock_" + generateNonce().slice(0, 16), confirmations: 1 };
    return { verified: false, error: "Mock verification failed", errorCode: "PAYMENT_INVALID" };
  }
}
