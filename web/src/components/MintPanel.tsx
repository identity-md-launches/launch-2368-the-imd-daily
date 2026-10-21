import { useEffect, useState } from "react";
import { useAccount, useWalletClient } from "wagmi";
import { isAddress, type Address, type Hex } from "viem";
import { CHAIN_ID, CHAIN_NAME, DAILY, IMD, dailyAbi, tokenAbi, txUrl } from "../config";
import { publicClient, chainNow, syncChainTime } from "../lib/chain";
import { describeError } from "../lib/errors";
import { countdown, formatETH, formatIMD, parseQuantity, plural } from "../lib/format";
import { latchClosed, mintDeadline, windowState } from "../lib/mint";
import type { Issue } from "../lib/issues";
import { useData, useTick } from "../lib/store";
import { ConnectSheet } from "../wallet/ConnectSheet";

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
    if (!wallet || !address || quantity === null || total === null || !to) return;
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
      <h3 id={`mint-${issue.id}`} className="h-sub">Collect this edition</h3>
      <p className="mint-status num">
        {state === "open" && <><strong className="accent">Open</strong> · closes in {countdown(closesIn)}</>}
        {state === "closed" && <><strong>Closed</strong> · the 24-hour window ended</>}
        {state === "upcoming" && <>Opens at publication</>}
        {" · "}{plural(issue.supply, "copy", "copies")} collected
      </p>
      {state === "open" ? (
        <>
          <p className="mint-price num">{formatIMD(issue.price)} IMD per copy. No copy limit per wallet; buy again any time before close.</p>
          <div className="mint-form">
            <label htmlFor={`qty-${issue.id}`}>Copies</label>
            <input id={`qty-${issue.id}`} className="qty num" inputMode="numeric" autoComplete="off" value={qtyText}
              aria-invalid={quantity === null} aria-describedby={`qty-help-${issue.id}`}
              onChange={(e) => setQtyText(e.target.value.replace(/\D/g, "").slice(0, 6))} disabled={busy} />
            <span id={`qty-help-${issue.id}`} className="num total">
              {total !== null ? <>Total <strong>{formatIMD(total)} IMD</strong></> : "Enter 1 to 10,000 copies"}
            </span>
          </div>
          <p className="fine num">
            Gas is paid separately in ETH{gas !== null ? `: about ${formatETH(gas)} ETH` : ""}. No ETH goes to the newspaper.
            {balance !== null && <> Your balance: {formatIMD(balance)} IMD.</>}
            {allowance !== null && total !== null && allowance < total && <> An exact approval of {formatIMD(total)} IMD comes first.</>}
          </p>
          <label className="check"><input type="checkbox" checked={gift} onChange={(e) => setGift(e.target.checked)} disabled={busy} /> Send to another address</label>
          {gift && (
            <input className="field" aria-label="Recipient address" placeholder="0x…" spellCheck={false} value={recipient}
              aria-invalid={!recipientOk} onChange={(e) => setRecipient(e.target.value)} disabled={busy} />
          )}
          <div className="mint-actions">
            {!isConnected ? <ConnectSheet /> : wrongChain ? <ConnectSheet /> : (
              <button className="btn btn-primary" disabled={busy || quantity === null || !recipientOk || (balance !== null && total !== null && balance < total)} onClick={collect}>
                {busy ? "Working…" : `Collect ${quantity !== null ? plural(quantity, "copy", "copies") : ""}`}
              </button>
            )}
            {wrongChain && <span className="note">Collecting needs {CHAIN_NAME}.</span>}
            {balance !== null && total !== null && balance < total && <span className="note">This wallet holds too little IMD for the total.</span>}
          </div>
        </>
      ) : null}
      <div role="status" aria-live="polite" className="mint-step">
        {step.kind === "busy" && <p>{step.text} {step.hash && <a href={txUrl(step.hash)} target="_blank" rel="noopener">View on Etherscan</a>}</p>}
        {step.kind === "done" && <p className="ok">Confirmed: {plural(step.quantity, "copy", "copies")} collected. <a href={txUrl(step.hash)} target="_blank" rel="noopener">Receipt on Etherscan</a></p>}
        {step.kind === "error" && <p className="err">{step.text} {step.hash && <a href={txUrl(step.hash)} target="_blank" rel="noopener">Transaction on Etherscan</a>}</p>}
      </div>
      <p className="fine">A copy is a collectible that supports the paper. It carries no copyright and no promise of any return.</p>
    </section>
  );
}
