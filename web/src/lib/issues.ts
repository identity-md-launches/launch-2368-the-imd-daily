import type { Hex, PublicClient } from "viem";
import { DAILY, DEPLOY_BLOCK, dailyAbi } from "../config";

export type Issue = {
  id: bigint;
  title: string;
  editorialDate: bigint;
  pdfURL: string;
  coverURL: string;
  metadataURI: string;
  pdfHash: Hex;
  coverHash: Hex;
  metadataHash: Hex;
  publishedAt: bigint;
  closesAt: bigint;
  supply: bigint;
  price: bigint;
  available: boolean;
};

type RawIssue = {
  content: {
    title: string; editorialDate: bigint; pdfURL: string; coverURL: string; metadataURI: string;
    pdfHash: Hex; coverHash: Hex; metadataHash: Hex;
  };
  publishedAt: bigint;
  closesAt: bigint;
};

export const PAGE_SIZE = 40n;

/** Reads issueCount at one block, then pages getIssue/issueStatus in bounded multicalls. */
export async function loadIssues(client: PublicClient): Promise<{ issues: Issue[]; block: bigint }> {
  const block = await client.getBlockNumber();
  const count = (await client.readContract({ address: DAILY, abi: dailyAbi, functionName: "issueCount", blockNumber: block })) as bigint;
  const issues: Issue[] = [];
  for (let start = 1n; start <= count; start += PAGE_SIZE) {
    const end = start + PAGE_SIZE - 1n < count ? start + PAGE_SIZE - 1n : count;
    const ids: bigint[] = [];
    for (let i = start; i <= end; i++) ids.push(i);
    const res = await client.multicall({
      blockNumber: block,
      allowFailure: false,
      contracts: ids.flatMap((id) => [
        { address: DAILY, abi: dailyAbi, functionName: "getIssue", args: [id] },
        { address: DAILY, abi: dailyAbi, functionName: "issueStatus", args: [id] },
      ]),
    });
    ids.forEach((id, k) => {
      const raw = res[2 * k] as unknown as RawIssue;
      const st = res[2 * k + 1] as unknown as [bigint, bigint, bigint, bigint, boolean];
      issues.push({
        id, ...raw.content, publishedAt: raw.publishedAt, closesAt: raw.closesAt,
        supply: st[0], price: st[3], available: st[4],
      });
    });
  }
  return { issues: issues.reverse(), block };
}

export type Publication = { id: string; txHash: Hex; blockNumber: string; blockHash: Hex; logIndex: number; pdfHash: Hex };
type IndexState = { version: 1; contract: string; nextBlock: string; publications: Publication[] };
const INDEX_KEY = `imd-daily:index:1:${DAILY.toLowerCase()}`;

export type Storage = { getItem(k: string): string | null; setItem(k: string, v: string): void };

function readState(store: Storage | undefined): IndexState {
  try {
    const raw = store?.getItem(INDEX_KEY);
    if (raw) {
      const s = JSON.parse(raw) as IndexState;
      if (s.version === 1 && s.contract === DAILY.toLowerCase()) return s;
    }
  } catch { /* a corrupt cache is rebuilt from the deployment block */ }
  return { version: 1, contract: DAILY.toLowerCase(), nextBlock: DEPLOY_BLOCK.toString(), publications: [] };
}

const FINALITY = 64n; // blocks re-scanned on every run so a reorganised log is replaced

/**
 * Indexes IssuePublished logs from the deployment block in bounded ranges. The range halves
 * when a provider refuses it and grows again after successes. Progress is saved after each
 * range, so a reload or a failed provider resumes instead of starting over.
 */
export async function indexPublications(
  client: PublicClient,
  opts: { store?: Storage; toBlock?: bigint; onProgress?: (done: bigint, total: bigint) => void; maxRange?: bigint } = {},
): Promise<Publication[]> {
  const store = opts.store ?? (typeof localStorage !== "undefined" ? localStorage : undefined);
  const state = readState(store);
  const head = opts.toBlock ?? (await client.getBlockNumber());
  let from = BigInt(state.nextBlock);
  const rewind = head > FINALITY ? head - FINALITY : 0n;
  if (from > rewind) {
    from = rewind < DEPLOY_BLOCK ? DEPLOY_BLOCK : rewind;
    state.publications = state.publications.filter((p) => BigInt(p.blockNumber) < from);
  }
  const maxRange = opts.maxRange ?? 50_000n;
  let range = maxRange;
  const event = (dailyAbi as readonly { type: string; name?: string }[]).find((x) => x.type === "event" && x.name === "IssuePublished");
  while (from <= head) {
    const to = from + range - 1n < head ? from + range - 1n : head;
    try {
      const logs = await client.getLogs({ address: DAILY, event: event as never, fromBlock: from, toBlock: to, strict: true });
      for (const l of logs as unknown as { args: { issueId: bigint; pdfHash: Hex }; transactionHash: Hex; blockNumber: bigint; blockHash: Hex; logIndex: number }[]) {
        const id = l.args.issueId.toString();
        state.publications = state.publications.filter((p) => p.id !== id);
        state.publications.push({ id, txHash: l.transactionHash, blockNumber: l.blockNumber.toString(), blockHash: l.blockHash, logIndex: l.logIndex, pdfHash: l.args.pdfHash });
      }
      from = to + 1n;
      state.nextBlock = from.toString();
      store?.setItem(INDEX_KEY, JSON.stringify(state));
      opts.onProgress?.(from - DEPLOY_BLOCK, head - DEPLOY_BLOCK + 1n);
      if (range < maxRange) range = range * 2n > maxRange ? maxRange : range * 2n;
    } catch (e) {
      if (range <= 500n) throw e;
      range = range / 2n;
    }
  }
  return state.publications;
}

/** Search what exists for scanned PDFs: titles, summaries, issue numbers and dates. */
export function searchIssues(issues: Issue[], query: string, summaries: Record<string, string>, dateText: (i: Issue) => string): Issue[] {
  const byNumber = /^\s*(?:no\.?|#|issue)\s*(\d+)\s*$/i.exec(query);
  if (byNumber) return issues.filter((i) => i.id === BigInt(byNumber[1]));
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (!terms.length) return issues;
  return issues.filter((i) => {
    const hay = [i.title, summaries[i.pdfHash.toLowerCase()] ?? "", dateText(i), `no. ${i.id}`, `#${i.id}`, `issue ${i.id}`].join(" ").toLowerCase();
    return terms.every((t) => hay.includes(t));
  });
}
