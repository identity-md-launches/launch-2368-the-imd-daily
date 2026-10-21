import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { publicClient, syncChainTime } from "./chain";
import { indexPublications, loadIssues, type Issue, type Publication } from "./issues";
import { fetchSummaries } from "./summaries";

type Data = {
  status: "loading" | "ready" | "error";
  error: string;
  issues: Issue[];
  block: bigint | null;
  loadedAt: number | null;
  summaries: Record<string, string>;
  publications: Record<string, Publication>;
  indexStatus: "idle" | "running" | "done" | "error";
  indexProgress: number;
  reload: () => void;
};

const Ctx = createContext<Data | null>(null);

export function DataProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<Omit<Data, "reload">>({
    status: "loading", error: "", issues: [], block: null, loadedAt: null, summaries: {}, publications: {}, indexStatus: "idle", indexProgress: 0,
  });

  const load = useCallback(async () => {
    setState((s) => ({ ...s, status: s.issues.length ? s.status : "loading", error: "" }));
    try {
      const [{ issues, block }] = await Promise.all([loadIssues(publicClient), syncChainTime()]);
      setState((s) => ({ ...s, status: "ready", issues, block, loadedAt: Date.now() }));
      fetchSummaries(issues).then((summaries) => setState((s) => ({ ...s, summaries })));
      if (issues.length) {
        setState((s) => ({ ...s, indexStatus: "running" }));
        indexPublications(publicClient, { onProgress: (d, t) => setState((s) => ({ ...s, indexProgress: Number((d * 100n) / (t || 1n)) })) })
          .then((pubs) => setState((s) => ({ ...s, indexStatus: "done", publications: Object.fromEntries(pubs.map((p) => [p.id, p])) })))
          .catch(() => setState((s) => ({ ...s, indexStatus: "error" })));
      }
    } catch (e) {
      setState((s) => ({ ...s, status: s.issues.length ? "ready" : "error", error: e instanceof Error ? e.message.split("\n")[0] : String(e) }));
    }
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 60_000);
    return () => clearInterval(t);
  }, [load]);

  return <Ctx.Provider value={{ ...state, reload: load }}>{children}</Ctx.Provider>;
}

export function useData(): Data {
  const v = useContext(Ctx);
  if (!v) throw new Error("DataProvider missing");
  return v;
}

/** Re-renders every second for countdowns. */
export function useTick(ms = 1000) {
  const [, set] = useState(0);
  useEffect(() => { const t = setInterval(() => set((n) => n + 1), ms); return () => clearInterval(t); }, [ms]);
}
