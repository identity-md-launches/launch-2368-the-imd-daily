import { BaseError, ContractFunctionRevertedError, UserRejectedRequestError } from "viem";

const MESSAGES: Record<string, string> = {
  MintClosed: "This edition's 24-hour window has closed. Nothing was charged.",
  DeadlineExpired: "Your quote expired before the transaction was included. Nothing was charged; quote again.",
  ZeroQuantity: "Choose at least one copy.",
  InvalidRecipient: "The recipient address is not valid.",
  UnknownIssue: "This issue number does not exist on chain.",
  InexactPayment: "The IMD transfer did not move the exact amount, so the mint was reverted.",
  PaymentDecimalsMismatch: "The IMD token reported unexpected decimals, so the mint was refused.",
  InvalidVault: "The vault check failed, so the mint was refused.",
  OnlyPublisher: "Only the publisher wallet can do this.",
  InvalidContent: "The issue fields are incomplete: every URL and hash must be set.",
  ZeroAmount: "Enter an amount above zero.",
  InsufficientFunds: "The vault holds less IMD than requested.",
  ERC20InsufficientAllowance: "The approved IMD allowance is lower than the total. Approve the exact total first.",
  ERC20InsufficientBalance: "This wallet does not hold enough IMD for the total.",
  ERC1155InvalidReceiver: "The recipient contract does not accept ERC-1155 tokens. Nothing was charged.",
};

export function errorName(e: unknown): string | undefined {
  if (e instanceof BaseError) {
    const r = e.walk((x) => x instanceof ContractFunctionRevertedError);
    if (r instanceof ContractFunctionRevertedError) return r.data?.errorName ?? r.reason ?? undefined;
  }
  return undefined;
}

export function isRejection(e: unknown): boolean {
  if (e instanceof BaseError && e.walk((x) => x instanceof UserRejectedRequestError)) return true;
  const code = (e as { code?: number })?.code;
  return code === 4001;
}

/** One plain sentence for a failed read, simulation or transaction. */
export function describeError(e: unknown): string {
  if (isRejection(e)) return "You declined the request in your wallet. Nothing was sent.";
  const name = errorName(e);
  if (name && MESSAGES[name]) return MESSAGES[name];
  if (name) return `The contract refused the transaction (${name}).`;
  const msg = e instanceof BaseError ? e.shortMessage : e instanceof Error ? e.message : String(e);
  if (/insufficient funds/i.test(msg)) return "This wallet does not hold enough ETH for gas.";
  if (/receiver|ERC1155/i.test(msg)) return MESSAGES.ERC1155InvalidReceiver;
  return msg.length > 220 ? `${msg.slice(0, 217)}…` : msg;
}
