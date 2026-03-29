import { keccak_256 } from "@noble/hashes/sha3.js";
import { bytesToHex } from "@noble/hashes/utils.js";

/**
 * Validate an Ethereum address against EIP-55 checksum.
 * Uses keccak256 via @noble/hashes (audited, zero-dependency).
 * IMPORTANT: Node.js crypto.createHash("sha3-256") is NOT keccak256.
 */
export function isValidEIP55Address(address: string): boolean {
  if (!/^0x[0-9a-fA-F]{40}$/.test(address)) return false;
  const hex = address.slice(2);
  if (hex === hex.toLowerCase() || hex === hex.toUpperCase()) return false;
  const hash = bytesToHex(keccak_256(new TextEncoder().encode(hex.toLowerCase())));
  for (let i = 0; i < 40; i++) {
    const hashNibble = parseInt(hash[i], 16);
    const char = hex[i];
    if (hashNibble > 7) {
      if (char !== char.toUpperCase()) return false;
    } else {
      if (char !== char.toLowerCase()) return false;
    }
  }
  return true;
}

export function validatePayTo(address: string): void {
  if (!isValidEIP55Address(address)) {
    throw new Error(`Invalid payTo address: "${address}". Must be a valid EIP-55 checksummed Ethereum address.`);
  }
}

export function validateAmount(paidCents: number, requiredCents: number): boolean {
  return paidCents >= requiredCents;
}
