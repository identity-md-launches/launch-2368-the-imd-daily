import { useEffect, useState } from "react";
import { useAccount } from "wagmi";
import { DAILY, dailyAbi } from "../config";
import { publicClient } from "../lib/chain";
import { editorialDate, plural } from "../lib/format";
import { useData } from "../lib/store";
import { ConnectSheet } from "../wallet/ConnectSheet";

/** Real ERC-1155 balances for the connected wallet, read with balanceOfBatch in pages. */
export function Collection() {
  const { address } = useAccount();
  const { issues, status } = useData();
  const [balances, setBalances] = useState<Record<string, bigint> | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    setBalances(null); setError("");
    if (!address || status !== "ready") return;
    (async () => {
      const out: Record<string, bigint> = {};
      for (let i = 0; i < issues.length; i += 100) {
        const ids = issues.slice(i, i + 100).map((x) => x.id);
        const res = (await publicClient.readContract({ address: DAILY, abi: dailyAbi, functionName: "balanceOfBatch", args: [ids.map(() => address), ids] })) as bigint[];
        ids.forEach((id, k) => { out[id.toString()] = res[k]; });
      }
      setBalances(out);
    })().catch((e) => setError(e instanceof Error ? e.message.split("\n")[0] : String(e)));
  }, [address, issues, status]);

  const owned = issues.filter((i) => (balances?.[i.id.toString()] ?? 0n) > 0n);
  return (
    <section className="page-narrow" aria-labelledby="col-h">
      <h2 id="col-h" className="h-section">My Collection</h2>
      {!address && <><p>Connect a wallet to see the copies it holds. Reading never needs one.</p><ConnectSheet /></>}
      {address && error && <p className="err">Balances could not be read: {error}</p>}
      {address && !error && balances === null && <p role="status">Reading balances…</p>}
      {address && balances && owned.length === 0 && <p>This wallet holds no copies of The IMD Daily{issues.length ? "" : " yet; no edition has been published"}.</p>}
      {owned.length > 0 && (
        <ol className="stack">
          {owned.map((i) => (
            <li key={i.id.toString()} className="stack-row">
              <a href={`#/issue/${i.id}`} className="stack-cover" tabIndex={-1} aria-hidden="true"><img src={i.coverURL} alt="" loading="lazy" /></a>
              <div>
                <p className="dateline num">No. {i.id.toString()} · {editorialDate(i.editorialDate)}</p>
                <h3 className="h-sub"><a href={`#/issue/${i.id}`}>{i.title}</a></h3>
                <p className="num">You hold {plural(balances![i.id.toString()], "copy", "copies")} of {i.supply.toString()} collected.</p>
              </div>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
