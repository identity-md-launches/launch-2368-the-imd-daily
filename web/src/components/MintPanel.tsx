import { useEffect, useState } from "react";
import { useAccount, useWalletClient } from "wagmi";
import { isAddress, type Address, type Hex } from "viem";
import { CHAIN_ID, CHAIN_NAME, DAILY, IMD, dailyAbi, tokenAbi, txUrl } from "../config";
import { publicClient, chainNow, syncChainTime } from "../lib/chain";
import { describeError } from "../lib/errors";
import { countdown, dateTime, formatETH, formatIMD, MAX_QUANTITY, parseQuantity, plural } from "../lib/format";
import { latchClosed, mintDeadline, windowState } from "../lib/mint";
import type { Issue } from "../lib/issues";
import { useData, useTick } from "../lib/store";
import { ConnectSheet } from "../wallet/ConnectSheet";
import { Artwork } from "./Artwork";

type Step =
  | { kind: "idle" }
  | { kind: "busy"; text: string; hash?: Hex }
  | { kind: "done"; hash: Hex; quantity: bigint }
  | { kind: "error"; text: string; hash?: Hex };

/** Collect copies of one issue: exact-amount IMD approval, then mint, both through the visitor's wallet. */
export function MintPanel({ issue }: { issue: Issue }) {
  useTick();
  const { reload } = useData();
  const { address, isConnected, chainId } = useAccount();
  const { data: wallet } = useWalletClient();
  const [qtyText, setQtyText] = useState("1");
  const [recipient, setRecipient] = useState("");
  const [gift, setGift] = useState(false);
  const [balance, setBalance] = useState<bigint | null>(null);
  const [allowance, setAllowance] = useState<bigint | null>(null);
  const [gas, setGas] = useState<bigint | null>(null);
  const [step, setStep] = useState<Step>({ kind: "idle" });

  const now = chainNow();
  const state = latchClosed(issue.id, windowState(now, issue.publishedAt, issue.closesAt));
  const quantity = parseQuantity(qtyText);
  const total = quantity !== null ? quantity * issue.price : null;
  const wrongChain = isConnected && chainId !== CHAIN_ID;
  const to = (gift ? recipient.trim() : address) as Address | undefined;
  const recipientOk = !gift || isAddress(recipient.trim());

  async function refreshWallet() {
    if (!address) return;
    try {
      const [b, a] = await Promise.all([
        publicClient.readContract({ address: IMD, abi: tokenAbi, functionName: "balanceOf", args: [address] }) as Promise<bigint>,
        publicClient.readContract({ address: IMD, abi: tokenAbi, functionName: "allowance", args: [address, DAILY] }) as Promise<bigint>,
      ]);
      setBalance(b); setAllowance(a);
    } catch { setBalance(null); setAllowance(null); }
  }
  useEffect(() => { refreshWallet(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [address, step.kind]);

  // Gas is shown in ETH, separately from the IMD total. It is an estimate at the current gas price.
  useEffect(() => {
    setGas(null);
    if (!address || total === null || state !== "open" || wrongChain) return;
    let off = false;
    (async () => {
      const price = await publicClient.getGasPrice();
      const needApprove = allowance === null || allowance < total;
      const approveGas = needApprove
        ? await publicClient.estimateContractGas({ address: IMD, abi: tokenAbi, functionName: "approve", args: [DAILY, total], account: address }).catch(() => 60_000n)
        : 0n;
      // Mint cannot be simulated before the allowance exists; 200k is a conservative ceiling then.
      const mintGas = needApprove ? 200_000n : await publicClient.estimateContractGas({
        address: DAILY, abi: dailyAbi, functionName: "mint", args: [issue.id, quantity!, to ?? address, issue.closesAt - 1n], account: address,
      }).catch(() => 200_000n);
      if (!off) setGas((approveGas + mintGas) * price);
    })().catch(() => undefined);
    return () => { off = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [address, total, allowance, state, wrongChain, issue.id]);

  async function collect() {
    if (!wallet || !address || quantity === null || total === null || !to || state !== "open" || wrongChain || !recipientOk) return;
    let hash: Hex | undefined;
    try {
      setStep({ kind: "busy", text: "Checking the edition and your IMD balance…" });
      const cost = (await publicClient.readContract({ address: DAILY, abi: dailyAbi, functionName: "quote", args: [quantity] })) as bigint;
      if (cost !== total) throw new Error("The contract quote differs from the displayed total. Reload the page.");
      const bal = (await publicClient.readContract({ address: IMD, abi: tokenAbi, functionName: "balanceOf", args: [address] })) as bigint;
      if (bal < cost) throw new Error(`This wallet holds ${formatIMD(bal)} IMD; the total is ${formatIMD(cost)} IMD.`);
      const allow = (await publicClient.readContract({ address: IMD, abi: tokenAbi, functionName: "allowance", args: [address, DAILY] })) as bigint;
      if (allow < cost) {
        setStep({ kind: "busy", text: `Approve exactly ${formatIMD(cost)} IMD in your wallet.` });
        const { request } = await publicClient.simulateContract({ address: IMD, abi: tokenAbi, functionName: "approve", args: [DAILY, cost], account: address });
        hash = await wallet.writeContract(request);
        setStep({ kind: "busy", text: "Approval sent. Waiting for confirmation…", hash });
        const r = await publicClient.waitForTransactionReceipt({ hash });
        if (r.status !== "success") throw new Error("The approval reverted.");
      }
      const latest = await syncChainTime();
      const deadline = mintDeadline(latest, issue.closesAt);
      if (deadline === null) throw new Error("This edition closed while you were approving. No copies were bought; the approval stays until you spend or reset it.");
      setStep({ kind: "busy", text: `Confirm the purchase of ${plural(quantity, "copy", "copies")} in your wallet.` });
      const { request } = await publicClient.simulateContract({ address: DAILY, abi: dailyAbi, functionName: "mint", args: [issue.id, quantity, to, deadline], account: address });
      hash = await wallet.writeContract(request);
      setStep({ kind: "busy", text: "Purchase sent. Waiting for confirmation…", hash });
      const r = await publicClient.waitForTransactionReceipt({ hash });
      if (r.status !== "success") throw new Error("The purchase reverted. Nothing was charged.");
      setStep({ kind: "done", hash, quantity });
      reload();
    } catch (e) {
      setStep({ kind: "error", text: describeError(e), hash });
    }
  }

  const closesIn = issue.closesAt - now;
  const busy = step.kind === "busy";

  return (
    <section className="mint" aria-labelledby={`mint-${issue.id}`}>
      <div className="collector-heading">
        <div><p className="collector-kicker">Support the independent press</p><h3 id={`mint-${issue.id}`} className="h-sub">Collect this edition</h3></div>
        <Artwork name="emblem" className="collector-stamp" />
      </div>
      <p className="edition-label"><span className={`status-dot ${state === "open" ? "is-open" : ""}`} />24-hour open edition</p>
      <div className="collector-price num"><strong>{formatIMD(issue.price)} <span>IMD</span></strong><span className="fine">per copy</span></div>
      <div className="window-clock num">
        <span className="fine">{state === "open" ? "Collecting closes in" : state === "closed" ? "Collecting has ended" : "Opens at publication"}</span>
        <strong className={state === "open" ? "accent" : ""}>{state === "open" ? countdown(closesIn) : state === "closed" ? "Closed" : "Upcoming"}</strong>
        <time className="fine" dateTime={new Date(Number(issue.closesAt) * 1000).toISOString()}>Closes {dateTime(issue.closesAt)}</time>
      </div>
      {state === "open" ? <>
        <div className="mint-form">
          <label htmlFor={`qty-${issue.id}`}>Quantity</label>
          <div className="quantity-stepper">
            <button className="stepper-btn" aria-label="Decrease quantity" disabled={busy || quantity === null || quantity <= 1n}
              onClick={() => setQtyText(String(quantity! - 1n))}>−</button>
            <input id={`qty-${issue.id}`} className="qty num" inputMode="numeric" autoComplete="off" value={qtyText}
              aria-invalid={quantity === null} aria-describedby={`qty-help-${issue.id}`}
              onChange={e => setQtyText(e.target.value.replace(/\D/g, "").slice(0, 6))} disabled={busy} />
            <button className="stepper-btn" aria-label="Increase quantity" disabled={busy || quantity === null || quantity >= MAX_QUANTITY}
              onClick={() => setQtyText(String(quantity! + 1n))}>+</button>
          </div>
        </div>
        <p id={`qty-help-${issue.id}`} className="collector-total num">
          {total !== null ? <><span>Total</span><strong>{formatIMD(total)} IMD</strong></> : <span className="err">Enter 1 to 10,000 copies per transaction.</span>}
        </p>
        <div className="mint-actions">
          {!isConnected || wrongChain ? <ConnectSheet label="Connect to collect" /> : (
            <button className="btn btn-primary" disabled={busy || quantity === null || !recipientOk || (balance !== null && total !== null && balance < total)} onClick={collect}>
              {busy ? "Working…" : `Collect ${quantity !== null ? plural(quantity, "copy", "copies") : ""}`}<span aria-hidden="true">↗</span>
            </button>
          )}
          {wrongChain && <span className="note">Collecting needs {CHAIN_NAME}.</span>}
          {balance !== null && total !== null && balance < total && <span className="note">This wallet holds too little IMD for the total.</span>}
        </div>
        <p className="gas-note fine num">ETH is only for gas{gas !== null ? `: about ${formatETH(gas)} ETH` : ""}.
          {balance !== null && <> Balance: {formatIMD(balance)} IMD.</>}
          {allowance !== null && total !== null && allowance < total && <> Exact approval: {formatIMD(total)} IMD.</>}
        </p>
        <details className="recipient-options">
          <summary>Send to another address</summary>
          <label className="check"><input type="checkbox" checked={gift} onChange={e => setGift(e.target.checked)} disabled={busy} />Choose a recipient</label>
          {gift && <><label htmlFor={`recipient-${issue.id}`}>Recipient address</label><input id={`recipient-${issue.id}`} className="field" placeholder="0x…" spellCheck={false} autoComplete="off" value={recipient}
            aria-invalid={!recipientOk} onChange={e => setRecipient(e.target.value)} disabled={busy} /></>}
        </details>
      </> : <p className="fine closed-note">This edition stays free to read and download.</p>}
      <div role="status" aria-live="polite" className="mint-step">
        {step.kind === "busy" && <p>{step.text} {step.hash && <a href={txUrl(step.hash)} target="_blank" rel="noopener">View on Etherscan</a>}</p>}
        {step.kind === "done" && <p className="ok">Confirmed: {plural(step.quantity, "copy", "copies")} collected. <a href={txUrl(step.hash)} target="_blank" rel="noopener">Receipt on Etherscan</a></p>}
        {step.kind === "error" && <p className="err">{step.text} {step.hash && <a href={txUrl(step.hash)} target="_blank" rel="noopener">Transaction on Etherscan</a>}</p>}
      </div>
      <div className="collector-foot"><p className="num"><strong>{issue.supply.toString()}</strong> {issue.supply === 1n ? "copy" : "copies"} minted <span>· Uncapped edition</span></p>
        <p className="fine">A collectible to support the paper. No copyright or promise of return.</p></div>
    </section>
  );
}
