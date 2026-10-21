import { useData, useTick } from "../lib/store";

/** Says when chain data is old or the last refresh failed, instead of silently showing stale numbers. */
export function Stale() {
  useTick(5000);
  const { loadedAt, error, block, reload } = useData();
  const age = loadedAt ? Math.floor((Date.now() - loadedAt) / 1000) : 0;
  if (!error && age < 150) return null;
  return (
    <p className="stale" role="status">
      {error ? "The last refresh failed" : "These figures are over two minutes old"}
      {block !== null && <> (block {block.toString()})</>}. <button className="link" onClick={reload}>Refresh</button>
    </p>
  );
}
