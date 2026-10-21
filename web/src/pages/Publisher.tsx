import { useEffect, useMemo, useState } from "react";
import { useAccount, useSignMessage, useWalletClient } from "wagmi";
import { decodeEventLog, type Hex } from "viem";
import { CHAIN_ID, DAILY, PUBLISHER, SERVICE_STORAGE_KEY, dailyAbi, txUrl } from "../config";
import { publicClient } from "../lib/chain";
import { describeError } from "../lib/errors";
import { dateInputToTimestamp, plural } from "../lib/format";
import { sha256Hex } from "../lib/hash";
import { buildMetadata, checkMetadata } from "../lib/metadata";
import { renderCover } from "../lib/pdf";
import { Service, normalizeOrigin, resolveServiceOrigin, verifyPublic } from "../lib/service";
import { useData } from "../lib/store";
import { Reader } from "../components/Reader";
import { ConnectSheet } from "../wallet/ConnectSheet";

const MAX_PDF_BYTES = 200 * 1024 * 1024;
const PENDING_KEY = `imd-daily:pending-publication:${DAILY.toLowerCase()}`;

type Content = {
  title: string; editorialDate: bigint; pdfURL: string; coverURL: string; metadataURI: string;
  pdfHash: Hex; coverHash: Hex; metadataHash: Hex;
};
type Pending = { predictedId: string; content: Record<keyof Content, string>; hash?: Hex; startedAt: number };
type Prepared = { content: Content; predictedId: bigint; summary: string };

const toStored = (c: Content) => Object.fromEntries(Object.entries(c).map(([k, v]) => [k, String(v)])) as Pending["content"];
const readPending = (): Pending | null => { try { return JSON.parse(localStorage.getItem(PENDING_KEY) ?? "null"); } catch { return null; } };

export function Publisher() {
  const { address, chainId } = useAccount();
  const isPublisher = address?.toLowerCase() === PUBLISHER.toLowerCase();
  const [origin, setOrigin] = useState<string | null | undefined>(undefined);
  const [originText, setOriginText] = useState("");
  const [health, setHealth] = useState<"unknown" | "ok" | "down">("unknown");
  const service = useMemo(() => (origin ? new Service(origin) : null), [origin]);
  const [signedIn, setSignedIn] = useState(false);
  const [authMsg, setAuthMsg] = useState("");
  const { signMessageAsync } = useSignMessage();

  useEffect(() => { resolveServiceOrigin().then(setOrigin); }, []);
  useEffect(() => {
    setHealth("unknown"); setSignedIn(false);
    service?.health().then((h) => setHealth(h.ok ? "ok" : "down"), () => setHealth("down"));
  }, [service]);

  async function signIn() {
    if (!service || !address) return;
    setAuthMsg("Requesting a challenge…");
    try {
      const c = await service.challenge(address);
      setAuthMsg("Sign the challenge in your wallet. It costs nothing and sends no transaction.");
      const signature = await signMessageAsync({ message: c.message });
      await service.verify(c.message, signature);
      setSignedIn(true); setAuthMsg("");
    } catch (e) { setAuthMsg(describeError(e)); }
  }

  return (
    <section className="desk" aria-labelledby="desk-h">
      <h2 id="desk-h" className="h-section">Publisher desk</h2>
      <p className="fine">Only the publisher wallet {PUBLISHER} can upload or publish. Readers never need this page.</p>
      <PendingRecovery />

      <h3 className="h-sub">1. Upload service</h3>
      {origin === undefined && <p role="status">Looking for the upload service…</p>}
      {origin === null && (
        <div className="setup">
          <p><strong>Publishing is not set up yet.</strong> The upload service in <code>server/</code> runs on the publisher's own server; see docs/VPS_SETUP.md. Until it does, the public site keeps working and nothing can be uploaded.</p>
        </div>
      )}
      {origin && <p className="num">Service: {origin} · {health === "ok" ? "healthy" : health === "down" ? <span className="err">not answering its health check</span> : "checking…"}</p>}
      <form className="inline-form" onSubmit={(e) => {
        e.preventDefault();
        const o = normalizeOrigin(originText);
        if (!o) { setAuthMsg("Enter an https:// origin, for example https://files.example.duckdns.org"); return; }
        localStorage.setItem(SERVICE_STORAGE_KEY, o); setOrigin(o); setOriginText(""); setAuthMsg("");
      }}>
        <label htmlFor="origin">Service origin for this browser</label>
        <input id="origin" className="field" type="url" placeholder="https://files.example.duckdns.org" value={originText} onChange={(e) => setOriginText(e.target.value)} />
        <button className="btn">Save origin</button>
      </form>

      <h3 className="h-sub">2. Publisher wallet</h3>
      {!address && <ConnectSheet />}
      {address && !isPublisher && <p className="err">This wallet is not the publisher. Uploads and publication are refused for it.</p>}
      {address && isPublisher && chainId !== CHAIN_ID && <ConnectSheet />}
      {isPublisher && chainId === CHAIN_ID && service && health === "ok" && !signedIn && <button className="btn btn-primary" onClick={signIn}>Sign in to the upload service</button>}
      {signedIn && <p className="ok">Signed in as the publisher for this session.</p>}
      {authMsg && <p role="status" className="note">{authMsg}</p>}

      {signedIn && service && <Compose service={service} />}
    </section>
  );
}

function PendingRecovery() {
  const { issues, reload } = useData();
  const [pending, setPending] = useState<Pending | null>(readPending);
  const [msg, setMsg] = useState("");
  useEffect(() => {
    if (!pending) return;
    let off = false;
    (async () => {
      const onChain = issues.find((i) => i.pdfHash.toLowerCase() === pending.content.pdfHash.toLowerCase());
      if (onChain) { setMsg(`Published as No. ${onChain.id}.`); localStorage.removeItem(PENDING_KEY); reload(); return; }
      if (!pending.hash) { setMsg("A publication was started but no transaction hash was recorded. Check your wallet's activity before publishing again; the desk also refuses while the publisher has a pending transaction."); return; }
      setMsg("Waiting for the publication transaction recorded before the reload…");
      const r = await publicClient.waitForTransactionReceipt({ hash: pending.hash, timeout: 600_000 });
      if (off) return;
      if (r.status === "success") { setMsg("The publication confirmed."); localStorage.removeItem(PENDING_KEY); reload(); }
      else { setMsg("The recorded publication reverted. Nothing was published."); localStorage.removeItem(PENDING_KEY); }
    })().catch((e) => setMsg(describeError(e)));
    return () => { off = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pending, issues.length]);
  if (!pending) return null;
  return (
    <div className="setup" role="status">
      <p><strong>Pending publication:</strong> {pending.content.title} (predicted No. {pending.predictedId}). {msg}
        {pending.hash && <> <a href={txUrl(pending.hash)} target="_blank" rel="noopener">Transaction</a></>}</p>
      {!pending.hash && <button className="btn btn-quiet" onClick={() => { localStorage.removeItem(PENDING_KEY); setPending(null); }}>I checked my wallet: clear this record</button>}
    </div>
  );
}

type Check = { label: string; state: "wait" | "run" | "ok" | "err"; detail?: string };

function Compose({ service }: { service: Service }) {
  const { address } = useAccount();
  const { data: wallet } = useWalletClient();
  const { issues, reload } = useData();
  const [file, setFile] = useState<File | null>(null);
  const [pdfBytes, setPdfBytes] = useState<Uint8Array | null>(null);
  const [title, setTitle] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [summary, setSummary] = useState("");
  const [fileErr, setFileErr] = useState("");
  const [checks, setChecks] = useState<Check[]>([]);
  const [prepared, setPrepared] = useState<Prepared | null>(null);
  const [preview, setPreview] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [pubMsg, setPubMsg] = useState<{ kind: "busy" | "ok" | "err"; text: string; hash?: Hex } | null>(null);
  const source = useMemo(() => (pdfBytes ? { data: pdfBytes } : null), [pdfBytes]);

  async function pick(f: File | null) {
    setFile(null); setPdfBytes(null); setPrepared(null); setFileErr(""); setChecks([]);
    if (!f) return;
    if (f.size > MAX_PDF_BYTES) { setFileErr(`The file is ${(f.size / 1048576).toFixed(0)} MB; the limit is 200 MB.`); return; }
    const bytes = new Uint8Array(await f.arrayBuffer());
    if (new TextDecoder().decode(bytes.slice(0, 5)) !== "%PDF-") { setFileErr("This file is not a PDF."); return; }
    setFile(f); setPdfBytes(bytes);
  }

  const editorial = dateInputToTimestamp(date);
  const canPrepare = !!pdfBytes && title.trim().length > 0 && title.length <= 200 && editorial !== null && summary.length <= 1000;

  async function prepare() {
    if (!pdfBytes || editorial === null) return;
    const list: Check[] = [
      { label: "Hash the PDF", state: "wait" }, { label: "Draw the cover from page 1", state: "wait" },
      { label: "Upload PDF and cover", state: "wait" }, { label: "Write and upload metadata", state: "wait" },
      { label: "Fetch all three public URLs and match hashes", state: "wait" }, { label: "Save the draft summary", state: "wait" },
    ];
    const set = (i: number, state: Check["state"], detail?: string) => { list[i] = { ...list[i], state, detail }; setChecks([...list]); };
    setPrepared(null); setConfirm(false);
    let i = 0;
    try {
      set(0, "run"); const pdfHash = await sha256Hex(pdfBytes);
      const dup = issues.find((x) => x.pdfHash.toLowerCase() === pdfHash);
      if (dup) throw new Error(`This PDF is already No. ${dup.id}. Published files cannot be republished.`);
      set(0, "ok", pdfHash); i = 1;
      set(1, "run"); const cover = await renderCover(pdfBytes); const coverBytes = new Uint8Array(await cover.blob.arrayBuffer());
      const coverHash = await sha256Hex(coverBytes); set(1, "ok", `${cover.width}×${cover.height} PNG`); i = 2;
      set(2, "run");
      const up = await service.upload("pdf", pdfBytes, pdfHash);
      const upCover = await service.upload("cover", coverBytes, coverHash);
      if (up.sha256 !== pdfHash || upCover.sha256 !== coverHash) throw new Error("The service stored different bytes than were sent.");
      set(2, "ok", up.existed ? "PDF was already stored; reused unchanged" : undefined); i = 3;
      set(3, "run");
      const count = (await publicClient.readContract({ address: DAILY, abi: dailyAbi, functionName: "issueCount" })) as bigint;
      const predictedId = count + 1n;
      const metaBytes = buildMetadata({ issueId: predictedId, title: title.trim(), editorialDate: editorial, pdfURL: up.url, coverURL: upCover.url, pdfHash, coverHash });
      const metadataHash = await sha256Hex(metaBytes);
      const upMeta = await service.upload("metadata", metaBytes, metadataHash);
      set(3, "ok", `for No. ${predictedId}`); i = 4;
      set(4, "run");
      const h = async (b: ArrayBuffer) => sha256Hex(b);
      await verifyPublic(up.url, pdfHash, "application/pdf", h);
      await verifyPublic(upCover.url, coverHash, "image/png", h);
      const fetchedMeta = await verifyPublic(upMeta.url, metadataHash, "application/json", h);
      const problems = checkMetadata(fetchedMeta, { issueId: predictedId, title: title.trim(), editorialDate: editorial, pdfURL: up.url, coverURL: upCover.url, pdfHash, coverHash });
      if (problems.length) throw new Error(`Metadata check failed: ${problems.join("; ")}`);
      set(4, "ok"); i = 5;
      set(5, "run");
      const saved = await service.saveDraft({ pdfHash, coverHash, metadataHash, title: title.trim(), editorialDate: editorial.toString(), summary, predictedId: predictedId.toString() });
      set(5, "ok");
      setPrepared({ predictedId, summary: saved.summary, content: { title: title.trim(), editorialDate: editorial, pdfURL: up.url, coverURL: upCover.url, metadataURI: upMeta.url, pdfHash, coverHash, metadataHash } });
    } catch (e) { set(i, "err", describeError(e)); }
  }

  async function publish() {
    if (!prepared || !wallet || !address) return;
    let hash: Hex | undefined;
    try {
      setPubMsg({ kind: "busy", text: "Checking the chain before publishing…" });
      const [count, latestNonce, pendingNonce] = await Promise.all([
        publicClient.readContract({ address: DAILY, abi: dailyAbi, functionName: "issueCount" }) as Promise<bigint>,
        publicClient.getTransactionCount({ address, blockTag: "latest" }),
        publicClient.getTransactionCount({ address, blockTag: "pending" }),
      ]);
      if (pendingNonce > latestNonce) throw new Error("The publisher wallet has a pending transaction. Wait for it to confirm before publishing.");
      if (count + 1n !== prepared.predictedId) throw new Error(`The next issue is now No. ${count + 1n}; prepare the files again so the metadata matches.`);
      if (issues.some((x) => x.pdfHash.toLowerCase() === prepared.content.pdfHash)) throw new Error("This PDF is already published.");
      const { request } = await publicClient.simulateContract({ address: DAILY, abi: dailyAbi, functionName: "createIssue", args: [prepared.content], account: address });
      const record: Pending = { predictedId: prepared.predictedId.toString(), content: toStored(prepared.content), startedAt: Date.now() };
      localStorage.setItem(PENDING_KEY, JSON.stringify(record));
      setPubMsg({ kind: "busy", text: "Confirm the publication in your wallet." });
      hash = await wallet.writeContract(request);
      localStorage.setItem(PENDING_KEY, JSON.stringify({ ...record, hash }));
      setPubMsg({ kind: "busy", text: "Publication sent. Waiting for confirmation…", hash });
      const r = await publicClient.waitForTransactionReceipt({ hash });
      if (r.status !== "success") throw new Error("The publication reverted. Nothing was published.");
      const ev = r.logs.filter((l) => l.address.toLowerCase() === DAILY.toLowerCase()).map((l) => {
        try { return decodeEventLog({ abi: dailyAbi, data: l.data, topics: l.topics }); } catch { return null; }
      }).find((x) => x?.eventName === "IssuePublished");
      const id = (ev?.args as { issueId?: bigint } | undefined)?.issueId;
      if (id !== prepared.predictedId) throw new Error(`Published, but as No. ${id}; the metadata names No. ${prepared.predictedId}. The record cannot be edited.`);
      const onchain = (await publicClient.readContract({ address: DAILY, abi: dailyAbi, functionName: "getIssue", args: [id] })) as { content: Content };
      const mismatch = (Object.keys(prepared.content) as (keyof Content)[]).filter((k) => String(onchain.content[k]).toLowerCase() !== String(prepared.content[k]).toLowerCase());
      if (mismatch.length) throw new Error(`On-chain fields differ: ${mismatch.join(", ")}`);
      localStorage.removeItem(PENDING_KEY);
      await service.markPublished(prepared.content.pdfHash, id.toString(), hash).catch(() => undefined);
      setPubMsg({ kind: "ok", text: `Published No. ${id}. Its 24-hour collecting window has started.`, hash });
      setPrepared(null); reload();
    } catch (e) {
      if (!hash) localStorage.removeItem(PENDING_KEY);
      setPubMsg({ kind: "err", text: describeError(e), hash });
    }
  }

  return (
    <div className="compose">
      <h3 className="h-sub">3. Prepare the edition</h3>
      <div className="form-grid">
        <label htmlFor="pdf">PDF file, up to 200 MB</label>
        <input id="pdf" type="file" accept="application/pdf,.pdf" onChange={(e) => pick(e.target.files?.[0] ?? null)} aria-describedby="pdf-err" />
        {fileErr && <p id="pdf-err" className="err">{fileErr}</p>}
        <label htmlFor="title">Title</label>
        <input id="title" className="field" maxLength={200} value={title} onChange={(e) => setTitle(e.target.value)} />
        <label htmlFor="date">Editorial date (UTC)</label>
        <input id="date" className="field" type="date" value={date} onChange={(e) => setDate(e.target.value)} aria-invalid={editorial === null} />
        <label htmlFor="summary">Summary, plain text, up to 1,000 characters</label>
        <textarea id="summary" className="field" rows={4} maxLength={1000} value={summary} onChange={(e) => setSummary(e.target.value)} />
      </div>
      <p className="fine">Preparing uploads the files and checks them. It does not publish and does not open a collecting window.</p>
      <p className="read-actions">
        <button className="btn btn-primary" disabled={!canPrepare} onClick={prepare}>Upload and verify files</button>
        <button className="btn" disabled={!pdfBytes} onClick={() => setPreview(true)}>Preview in the reader</button>
      </p>
      {file && <p className="fine num">{file.name}, {(file.size / 1048576).toFixed(1)} MB</p>}
      {checks.length > 0 && (
        <ol className="checks">
          {checks.map((c) => <li key={c.label} className={`check-${c.state}`}>{c.label}: {c.state === "ok" ? "done" : c.state === "run" ? "working…" : c.state === "err" ? "failed" : "waiting"}{c.detail && <span className="hash"> {c.detail}</span>}</li>)}
        </ol>
      )}
      {preview && source && (
        <div className="preview-overlay"><Reader source={source} title={`Preview · ${title || file?.name || "Draft"}`} onClose={() => setPreview(false)} /></div>
      )}
      {prepared && (
        <div className="publish-box">
          <h3 className="h-sub">4. Publish on chain</h3>
          <dl className="record num">
            <dt>Issue</dt><dd>No. {prepared.predictedId.toString()}</dd>
            <dt>PDF</dt><dd className="hash">{prepared.content.pdfURL}</dd>
            <dt>Cover</dt><dd className="hash">{prepared.content.coverURL}</dd>
            <dt>Metadata</dt><dd className="hash">{prepared.content.metadataURI}</dd>
            <dt>PDF SHA-256</dt><dd className="hash">{prepared.content.pdfHash}</dd>
          </dl>
          <label className="check"><input type="checkbox" checked={confirm} onChange={(e) => setConfirm(e.target.checked)} />
            I understand this records the files permanently and opens a 24-hour collecting window that cannot be edited, extended or reopened.</label>
          <button className="btn btn-primary" disabled={!confirm || pubMsg?.kind === "busy"} onClick={publish}>Publish No. {prepared.predictedId.toString()} on Ethereum</button>
        </div>
      )}
      {pubMsg && <p role="status" className={pubMsg.kind === "err" ? "err" : pubMsg.kind === "ok" ? "ok" : ""}>{pubMsg.text} {pubMsg.hash && <a href={txUrl(pubMsg.hash)} target="_blank" rel="noopener">Etherscan</a>}</p>}
      <p className="fine">{plural(BigInt(issues.length), "issue is", "issues are")} on chain now.</p>
    </div>
  );
}
