import { useEffect, useRef, useState } from "react";
import { useAccount, useConnect, useDisconnect, useSwitchChain, type Connector } from "wagmi";
import { CHAIN_ID, CHAIN_NAME, WALLET_ADD_CHAIN } from "../config";
import { shortAddress } from "../lib/format";
import { isRejection } from "../lib/errors";
import { WALLET_ICONS, svgData } from "./icons";
import { OPEN_IN, isMobileBrowser } from "./open-in";

/** The single connect control and its sheet, in the newspaper's own type and colours. */
export function ConnectSheet() {
  const mobile = isMobileBrowser();
  const { address, isConnected, chainId, connector: active } = useAccount();
  const { connectors, connect, isPending, variables } = useConnect();
  const { disconnect } = useDisconnect();
  const { switchChainAsync, isPending: switching } = useSwitchChain();
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  const opener = useRef<HTMLButtonElement>(null);
  const sheet = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    addEventListener("keydown", onKey);
    sheet.current?.querySelector<HTMLElement>("button, a")?.focus();
    return () => { removeEventListener("keydown", onKey); opener.current?.focus(); };
  }, [open]);
  useEffect(() => { if (isConnected) setOpen(false); }, [isConnected]);

  const named = connectors.some((c) => c.type === "injected" && c.id !== "injected");
  const listed = [...connectors.filter((c) => c.type === "injected"), ...connectors.filter((c) => c.type !== "injected")]
    .filter((c) => !(c.id === "injected" && named));
  const label = (c: Connector) => (c.id === "injected" ? "Browser wallet" : c.id === "coinbaseWalletSDK" && mobile ? "Coinbase Smart Wallet" : c.name);
  const icon = (c: Connector) => c.icon ?? (WALLET_ICONS[c.id] ? svgData(WALLET_ICONS[c.id]) : undefined);

  async function switchNetwork() {
    setNote("");
    try {
      await switchChainAsync({ chainId: CHAIN_ID });
    } catch (e) {
      if (isRejection(e)) { setNote("Network switch declined."); return; }
      try {
        const provider = (await active?.getProvider()) as { request(a: { method: string; params: unknown[] }): Promise<unknown> } | undefined;
        await provider?.request({ method: "wallet_addEthereumChain", params: [WALLET_ADD_CHAIN] });
      } catch { setNote(`Switch to ${CHAIN_NAME} in your wallet.`); }
    }
  }

  if (isConnected && address) {
    if (chainId !== CHAIN_ID)
      return (
        <span className="wallet">
          <button className="btn btn-primary" onClick={switchNetwork} disabled={switching}>{switching ? "Switching…" : `Switch to ${CHAIN_NAME}`}</button>
          {note && <span className="note" role="status">{note}</span>}
        </span>
      );
    return <button className="btn" onClick={() => disconnect()} title="Disconnect this wallet">{shortAddress(address)} · Disconnect</button>;
  }
  return (
    <>
      <button ref={opener} className="btn btn-primary" onClick={() => { setNote(""); setOpen(true); }}>Connect</button>
      {open && (
        <div className="sheet-bg" onClick={() => setOpen(false)}>
          <div ref={sheet} className="sheet" role="dialog" aria-modal="true" aria-labelledby="sheet-title" onClick={(e) => e.stopPropagation()}>
            <div className="sheet-head">
              <h2 id="sheet-title">Connect a wallet</h2>
              <button className="x" aria-label="Close" onClick={() => setOpen(false)}>×</button>
            </div>
            {mobile && OPEN_IN.map((w) => (
              <a key={w.id} className="row" href={w.href(location.href)}>
                <span className="ic">{WALLET_ICONS[w.id] ? <img width={28} height={28} src={svgData(WALLET_ICONS[w.id])} alt="" /> : null}</span>
                <span>Open in {w.name}</span>
              </a>
            ))}
            {listed.filter((c) => !mobile || c.type !== "injected").map((c) => (
              <button key={c.uid} className="row" disabled={isPending}
                onClick={() => connect({ connector: c }, { onError: (e) => setNote(isRejection(e) ? "Connection declined." : "That wallet could not connect.") })}>
                <span className="ic">{icon(c) ? <img width={28} height={28} src={icon(c)} alt="" /> : null}</span>
                <span>{label(c)}{isPending && variables?.connector === c ? " · opening…" : ""}</span>
              </button>
            ))}
            {note && <p className="note" role="status">{note}</p>}
            <p className="fine">Reading and downloads never need a wallet. Connect only to collect a copy.</p>
          </div>
        </div>
      )}
    </>
  );
}
