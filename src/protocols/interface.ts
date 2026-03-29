import type { PaymentChallenge, VerificationResult } from "../types.js";

export interface PaymentProtocol {
  name: string;
  createChallenge(tool: string, amountCents: number, currency: string, payTo: string): PaymentChallenge;
  verifyPayment(challenge: PaymentChallenge, proof: string): Promise<VerificationResult>;
}
