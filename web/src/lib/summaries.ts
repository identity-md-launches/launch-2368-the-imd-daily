import type { Issue } from "./issues";

/**
 * Summaries are not stored on chain. The publishing service keeps them keyed by the PDF's
 * SHA-256, and the site asks the same origin that serves each issue's PDF. A summary is shown
 * only for the hash the contract committed to, so a server cannot attach one to another issue.
 */
export async function fetchSummaries(issues: Issue[]): Promise<Record<string, string>> {
  const origins = new Map<string, string[]>();
  for (const i of issues) {
    try {
      const u = new URL(i.pdfURL);
      if (u.protocol !== "https:" && u.hostname !== "localhost" && u.hostname !== "127.0.0.1") continue;
      const list = origins.get(u.origin) ?? [];
      list.push(i.pdfHash.toLowerCase());
      origins.set(u.origin, list);
    } catch { /* an unparsable URL has no summary origin */ }
  }
  const out: Record<string, string> = {};
  await Promise.all([...origins].map(async ([origin, hashes]) => {
    try {
      const r = await fetch(`${origin}/api/summaries`, { credentials: "omit" });
      if (!r.ok) return;
      const body = (await r.json()) as { summaries?: Record<string, { summary?: unknown }> };
      for (const h of hashes) {
        const s = body.summaries?.[h]?.summary;
        if (typeof s === "string") out[h] = s.slice(0, 1200);
      }
    } catch { /* summaries are optional; titles and dates still search */ }
  }));
  return out;
}
