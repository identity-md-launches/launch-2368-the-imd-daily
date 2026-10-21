import { describe, expect, it } from "vitest";
import { countdown, dateInputToTimestamp, formatETH, formatIMD, parseIMDAmount, parseQuantity } from "../src/lib/format";
import { _resetLatch, latchClosed, mintDeadline, windowState } from "../src/lib/mint";
import { indexPublications, searchIssues, type Issue } from "../src/lib/issues";
import { buildMetadata, checkMetadata } from "../src/lib/metadata";
import { DEPLOY_BLOCK, EXPECTED_PRICE } from "../src/config";

describe("token arithmetic is integer only", () => {
  it("formats exact IMD", () => {
    expect(formatIMD(EXPECTED_PRICE)).toBe("0.1");
    expect(formatIMD(EXPECTED_PRICE * 3n)).toBe("0.3");
    expect(formatIMD(EXPECTED_PRICE * 12345n)).toBe("1,234.5");
  });
  it("parses quantities strictly", () => {
    expect(parseQuantity("3")).toBe(3n);
    for (const bad of ["0", "-1", "1.5", "1e3", "", "abc", "10001"]) expect(parseQuantity(bad)).toBeNull();
  });
  it("parses decimal IMD without floats", () => {
    expect(parseIMDAmount("0.3")).toBe(300000000000000000n);
    expect(parseIMDAmount("0.000000000000000001")).toBe(1n);
    for (const bad of ["0", "1e18", "0.1234567890123456789", "-1", "."]) expect(parseIMDAmount(bad)).toBeNull();
  });
  it("rounds gas up", () => { expect(formatETH(1n)).toBe("0.000001"); expect(formatETH(10n ** 18n)).toBe("1"); });
});

describe("mint window", () => {
  const pub = 1_000_000n, close = pub + 86_400n;
  it("is open on [publishedAt, closesAt)", () => {
    expect(windowState(pub - 1n, pub, close)).toBe("upcoming");
    expect(windowState(pub, pub, close)).toBe("open");
    expect(windowState(close - 1n, pub, close)).toBe("open");
    expect(windowState(close, pub, close)).toBe("closed");
  });
  it("deadline never reaches closesAt", () => {
    expect(mintDeadline(pub, close)).toBe(pub + 600n);
    expect(mintDeadline(close - 5n, close)).toBe(close - 1n);
    expect(mintDeadline(close, close)).toBeNull();
  });
  it("never reopens once closed", () => {
    _resetLatch();
    expect(latchClosed(7n, "closed")).toBe("closed");
    expect(latchClosed(7n, "open")).toBe("closed");
    expect(latchClosed(8n, "open")).toBe("open");
  });
  it("countdown", () => { expect(countdown(3661n)).toBe("1:01:01"); expect(countdown(-4n)).toBe("0:00:00"); });
});

describe("dates", () => {
  it("maps a date input to midnight UTC", () => {
    expect(dateInputToTimestamp("2026-10-21")).toBe(1792540800n);
    expect(dateInputToTimestamp("2026-02-30")).toBeNull();
  });
});

const issue = (id: bigint, title: string): Issue => ({
  id, title, editorialDate: 1792540800n, pdfURL: "https://f/x.pdf", coverURL: "https://f/x.png", metadataURI: "https://f/x.json",
  pdfHash: `0x${id.toString().padStart(64, "0")}`, coverHash: "0x01", metadataHash: "0x02", publishedAt: 1n, closesAt: 2n, supply: 0n, price: EXPECTED_PRICE, available: false,
});

describe("search", () => {
  it("matches titles, summaries and dates", () => {
    const list = [issue(1n, "Harbour strike ends"), issue(2n, "Budget day")];
    const sums = { [list[1].pdfHash]: "Ministers present the autumn budget" };
    const d = () => "Wednesday, October 21, 2026 2026-10-21";
    expect(searchIssues(list, "harbour", sums, d).map((i) => i.id)).toEqual([1n]);
    expect(searchIssues(list, "autumn", sums, d).map((i) => i.id)).toEqual([2n]);
    expect(searchIssues(list, "october 2026", sums, d)).toHaveLength(2);
    expect(searchIssues(list, "no. 2", sums, d).map((i) => i.id)).toEqual([2n]);
  });
});

describe("metadata", () => {
  it("round-trips the schema cross-field checks", () => {
    const p = { issueId: 1n, title: "T", editorialDate: 1792540800n, pdfURL: "https://f/a.pdf", coverURL: "https://f/a.png", pdfHash: `0x${"a".repeat(64)}`, coverHash: `0x${"b".repeat(64)}` };
    const bytes = buildMetadata(p);
    expect(checkMetadata(bytes.buffer as ArrayBuffer, p)).toEqual([]);
    expect(checkMetadata(bytes.buffer as ArrayBuffer, { ...p, issueId: 2n })).toContain("issue_id is not the next issue number");
  });
});

describe("event indexer", () => {
  it("pages ranges, halves on refusal and resumes from saved progress", async () => {
    const calls: [bigint, bigint][] = [];
    const head = DEPLOY_BLOCK + 250_000n;
    let refuse = true;
    const client = {
      getBlockNumber: async () => head,
      getLogs: async ({ fromBlock, toBlock }: { fromBlock: bigint; toBlock: bigint }) => {
        calls.push([fromBlock, toBlock]);
        if (refuse && toBlock - fromBlock + 1n > 20_000n) throw new Error("range too large");
        if (fromBlock <= DEPLOY_BLOCK + 5n && DEPLOY_BLOCK + 5n <= toBlock)
          return [{ args: { issueId: 1n, pdfHash: "0xab" }, transactionHash: "0xtx", blockNumber: DEPLOY_BLOCK + 5n, blockHash: "0xbh", logIndex: 0 }];
        return [];
      },
    };
    const mem = new Map<string, string>();
    const store = { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v) };
    const pubs = await indexPublications(client as never, { store });
    expect(pubs).toHaveLength(1);
    expect(pubs[0].txHash).toBe("0xtx");
    expect(calls.every(([f, t]) => t >= f)).toBe(true);
    refuse = false; calls.length = 0;
    await indexPublications(client as never, { store });
    expect(calls[0][0]).toBe(head - 64n); // resumes, re-scanning only the unfinalised tail
  });
});
