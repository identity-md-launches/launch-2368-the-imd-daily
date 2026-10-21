import { useEffect, useState } from "react";
import { useAccount, useWalletClient } from "wagmi";
import type { Hex } from "viem";
import { addressUrl, CHAIN_ID, DAILY, IMD, PUBLISHER, VAULT, dailyAbi, tokenAbi, txUrl, vaultAbi } from "../config";
import { publicClient } from "../lib/chain";
import { describeError } from "../lib/errors";
import { formatIMD, parseIMDAmount } from "../lib/format";

type Figures = { collected: bigint; withdrawn: bigint; balance: bigint; tokenBalance: bigint; block: bigint };

/** Public revenue figures from contract accounting, plus the publisher's partial withdrawal. */
export function VaultPage() {
  const [f, setF] = useState<Figures | null>(null);
  const [error, setError] = useState("");
  const load = async () => {
    setError("");
    try {
      const block = await publicClient.getBlockNumber();
      const [collected, withdrawn, balance, tokenBalance] = (await Promise.all([
        publicClient.readContract({ address: DAILY, abi: dailyAbi, functionName: "totalCollected", blockNumber: block }),
        publicClient.readContract({ address: VAULT, abi: vaultAbi, functionName: "totalWithdrawn", blockNumber: block }),
        publicClient.readContract({ address: VAULT, abi: vaultAbi, functionName: "balance", blockNumber: block }),
        publicClient.readContract({ address: IMD, abi: tokenAbi, functionName: "balanceOf", args: [VAULT], blockNumber: block }),
      ])) as bigint[];
      setF({ collected, withdrawn, balance, tokenBalance, block });
    } catch (e) { setError(e instanceof Error ? e.message.split("\n")[0] : String(e)); }
  };
  useEffect(() => { load(); }, []);

  // With an exact-transfer token: balance + withdrawn = collected + direct transfers to the vault.
  const donations = f ? f.balance + f.withdrawn - f.collected : null;

  return (
    <section className="columns" aria-labelledby="vault-h">
      <h2 id="vault-h" className="h-section">Vault</h2>
      <div className="col-body">
        {error && <p className="err">The vault could not be read: {error} <button className="link" onClick={load}>Retry</button></p>}
        {!f && !error && <p role="status">Reading the vault…</p>}
        {f && (
          <table className="figures num">
            <caption className="sr-only">Vault accounting at block {f.block.toString()}</caption>
            <tbody>
              <tr><th scope="row">Collected from copies</th><td>{formatIMD(f.collected)} IMD</td><td className="fine">IMDDaily.totalCollected</td></tr>
              <tr><th scope="row">Withdrawn by the publisher</th><td>{formatIMD(f.withdrawn)} IMD</td><td className="fine">IMDDailyVault.totalWithdrawn</td></tr>
              <tr><th scope="row">Held in the vault now</th><td>{formatIMD(f.balance)} IMD</td><td className="fine">IMDDailyVault.balance</td></tr>
              <tr><th scope="row">Sent directly (donations)</th><td>{donations !== null && donations >= 0n ? `${formatIMD(donations)} IMD` : "Not derivable"}</td><td className="fine">balance + withdrawn − collected</td></tr>
            </tbody>
          </table>
        )}
        {f && <p className="fine num">Read at block {f.block.toString()}. IMD balanceOf(vault) reports {formatIMD(f.tokenBalance)} IMD. Donations are IMD sent to the vault outside a mint; they never count as collected revenue.</p>}
        <p className="fine">Withdrawals go only to the publisher wallet <a href={addressUrl(PUBLISHER)} target="_blank" rel="noopener">{PUBLISHER}</a>; the contract has no other recipient. Nothing is withdrawn automatically.</p>
      </div>
      <aside className="col-side"><Withdraw max={f?.balance ?? null} onDone={load} /></aside>
    </section>
  );
}

function Withdraw({ max, onDone }: { max: bigint | null; onDone: () => void }) {
  const { address, chainId } = useAccount();
  const { data: wallet } = useWalletClient();
  const [text, setText] = useState("");
  const [review, setReview] = useState<bigint | null>(null);
  const [msg, setMsg] = useState<{ kind: "busy" | "ok" | "err"; text: string; hash?: Hex } | null>(null);
  const isPublisher = address?.toLowerCase() === PUBLISHER.toLowerCase();
  if (!isPublisher) return <p className="fine">The publisher withdraws from here after connecting the publisher wallet.</p>;
  if (chainId !== CHAIN_ID) return <p className="note">Switch the wallet to Ethereum to withdraw.</p>;
  const amount = parseIMDAmount(text);
  const tooMuch = amount !== null && max !== null && amount > max;

  async function simulateReview() {
    if (amount === null || !address) return;
    setMsg({ kind: "busy", text: "Simulating the withdrawal…" });
    try {
      await publicClient.simulateContract({ address: VAULT, abi: vaultAbi, functionName: "withdraw", args: [amount], account: address });
      setReview(amount); setMsg(null);
    } catch (e) { setMsg({ kind: "err", text: describeError(e) }); }
  }
  async function send() {
    if (review === null || !wallet || !address) return;
    let hash: Hex | undefined;
    try {
      const { request } = await publicClient.simulateContract({ address: VAULT, abi: vaultAbi, functionName: "withdraw", args: [review], account: address });
      setMsg({ kind: "busy", text: "Confirm the withdrawal in your wallet." });
      hash = await wallet.writeContract(request);
      setMsg({ kind: "busy", text: "Withdrawal sent. Waiting for confirmation…", hash });
      const r = await publicClient.waitForTransactionReceipt({ hash });
      if (r.status !== "success") throw new Error("The withdrawal reverted.");
      setMsg({ kind: "ok", text: `Withdrew ${formatIMD(review)} IMD to the publisher wallet.`, hash });
      setReview(null); setText(""); onDone();
    } catch (e) { setMsg({ kind: "err", text: describeError(e), hash }); }
  }

  return (
    <div className="withdraw">
      <h3 className="h-sub">Withdraw to the publisher</h3>
      <label htmlFor="wd">Amount in IMD</label>
      <input id="wd" className="field num" inputMode="decimal" value={text} aria-invalid={text !== "" && (amount === null || tooMuch)}
        onChange={(e) => { setText(e.target.value); setReview(null); }} placeholder="0.0" />
      {max !== null && <button className="link" onClick={() => { setText(formatIMD(max).replace(/,/g, "")); setReview(null); }}>Use the full balance</button>}
      {tooMuch && <p className="err">The vault holds {formatIMD(max!)} IMD.</p>}
      {review === null ? (
        <button className="btn" disabled={amount === null || tooMuch || msg?.kind === "busy"} onClick={simulateReview}>Review withdrawal</button>
      ) : (
        <div className="review">
          <p>Send <strong className="num">{formatIMD(review)} IMD</strong> from the vault to {PUBLISHER}. Simulation passed.</p>
          <button className="btn btn-primary" onClick={send} disabled={msg?.kind === "busy"}>Withdraw {formatIMD(review)} IMD</button>
          <button className="btn btn-quiet" onClick={() => setReview(null)}>Cancel</button>
        </div>
      )}
      {msg && <p role="status" className={msg.kind === "err" ? "err" : msg.kind === "ok" ? "ok" : ""}>{msg.text} {msg.hash && <a href={txUrl(msg.hash)} target="_blank" rel="noopener">Etherscan receipt</a>}</p>}
    </div>
  );
}
