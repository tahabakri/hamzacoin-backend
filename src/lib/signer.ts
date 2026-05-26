// ============================================================================
// signer.ts — produces the EIP-712 signatures the HamzaFaucet contract trusts
// ----------------------------------------------------------------------------
// The contract reconstructs the same digest and recovers the signer address.
// Domain and types here MUST match the contract's CLAIM_TYPEHASH and
// EIP712("HamzaFaucet", "1") declarations EXACTLY — even whitespace matters.
// ============================================================================

import { Wallet, type TypedDataDomain, type TypedDataField } from "ethers";
import { config } from "../config";

const wallet = new Wallet(config.SIGNER_PRIVATE_KEY);

const DOMAIN: TypedDataDomain = {
  name: "HamzaFaucet",
  version: "1",
  chainId: config.CHAIN_ID,
  verifyingContract: config.FAUCET_CONTRACT_ADDRESS,
};

const TYPES: Record<string, TypedDataField[]> = {
  Claim: [
    { name: "user", type: "address" },
    { name: "score", type: "uint8" },
    { name: "articleHash", type: "bytes32" },
  ],
};

export async function signClaim(
  user: string,
  score: number,
  articleHash: string,
): Promise<string> {
  if (score < 1 || score > 5) {
    throw new Error(`Refusing to sign invalid score: ${score}`);
  }
  const value = { user, score, articleHash };
  return wallet.signTypedData(DOMAIN, TYPES, value);
}

export function signerAddress(): string {
  return wallet.address;
}
