import type { PaymentProtocol } from "./interface.js";
import type { PaymentChallenge, VerificationResult } from "../types.js";
import { ErrorCode } from "../types.js";
import { generateNonce } from "../security/nonce.js";

export interface MppProtocolOptions { apiUrl: string; network: string; }

export class MppProtocol implements PaymentProtocol {
  name = "mpp";
  private apiUrl: string;
  private network: string;
  private consecutiveFailures = 0;
  private circuitOpenUntil = 0;

  constructor(options: MppProtocolOptions) { this.apiUrl = options.apiUrl; this.network = options.network; }

  createChallenge(tool: string, amountCents: number, currency: string, payTo: string): PaymentChallenge {
    return { version: 1, protocol: this.name, amount: amountCents, currency, nonce: generateNonce(), payTo, network: this.network, token: "USD", expiresAt: Date.now() + 300_000 };
  }

  async verifyPayment(challenge: PaymentChallenge, proof: string): Promise<VerificationResult> {
    if (Date.now() < this.circuitOpenUntil) return { verified: false, error: "MPP API temporarily unavailable (circuit open)", errorCode: ErrorCode.VERIFICATION_UNAVAILABLE };
    try {
      const response = await fetch(this.apiUrl, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ payment: proof, challenge: { nonce: challenge.nonce, amount: challenge.amount, currency: challenge.currency, payTo: challenge.payTo, network: challenge.network } }) });
      if (!response.ok) { this.recordFailure(); return { verified: false, error: `MPP API returned HTTP ${response.status}`, errorCode: ErrorCode.VERIFICATION_UNAVAILABLE }; }
      const data = (await response.json()) as { success: boolean; txHash?: string; confirmations?: number; error?: string; };
      this.consecutiveFailures = 0;
      if (data.success) return { verified: true, txHash: data.txHash, confirmations: data.confirmations };
      return { verified: false, error: data.error ?? "MPP verification failed", errorCode: ErrorCode.PAYMENT_INVALID };
    } catch (err) { this.recordFailure(); return { verified: false, error: err instanceof Error ? err.message : "MPP request failed", errorCode: ErrorCode.VERIFICATION_UNAVAILABLE }; }
  }

  private recordFailure(): void { this.consecutiveFailures++; if (this.consecutiveFailures >= 3) this.circuitOpenUntil = Date.now() + 60_000; }
}
