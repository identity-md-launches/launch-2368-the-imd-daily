/** Window rules mirror IMDDaily.mint: open while publishedAt <= now < closesAt, using chain time. */
export type WindowState = "upcoming" | "open" | "closed";

export function windowState(now: bigint, publishedAt: bigint, closesAt: bigint): WindowState {
  if (now < publishedAt) return "upcoming";
  if (now >= closesAt) return "closed";
  return "open";
}

/** Mint deadline: ten minutes from the latest block, capped one second before the issue closes. */
export const DEADLINE_SLACK = 600n;
export function mintDeadline(latestBlockTime: bigint, closesAt: bigint): bigint | null {
  if (latestBlockTime >= closesAt) return null;
  const short = latestBlockTime + DEADLINE_SLACK;
  return short < closesAt ? short : closesAt - 1n;
}

/**
 * Once the site has seen an issue closed it stays closed in this session even if a lagging RPC
 * reports an older block: closesAt is immutable and the contract never reopens a window.
 */
const closedSeen = new Set<string>();
export function latchClosed(id: bigint, state: WindowState): WindowState {
  const k = id.toString();
  if (state === "closed") closedSeen.add(k);
  return closedSeen.has(k) ? "closed" : state;
}
export const _resetLatch = () => closedSeen.clear();
