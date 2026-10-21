import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { createApp, sanitizeSummary } from "../src/app.mjs";

// Keys are generated per run and exist only in memory; none is a real or reusable key.
const publisher = privateKeyToAccount(generatePrivateKey());
const stranger = privateKeyToAccount(generatePrivateKey());
const ORIGIN = "https://the-imd-daily.example";
let base, server, dir;

before(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "imd-daily-"));
  server = createApp({ dataDir: dir, publicFileOrigin: "https://files.example", allowedOrigins: [ORIGIN], publisher: publisher.address, maxPdfBytes: 64 * 1024 * 1024, authLimit: 1000, uploadLimit: 1000 });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => { server.close(); fs.rmSync(dir, { recursive: true, force: true }); });

const post = (p, body, headers = {}) => fetch(base + p, { method: "POST", headers: { Origin: ORIGIN, "Content-Type": "application/json", ...headers }, body: typeof body === "string" || body instanceof Uint8Array ? body : JSON.stringify(body) });
const sha = (b) => `0x${crypto.createHash("sha256").update(b).digest("hex")}`;

async function login(account, origin = ORIGIN) {
  const c = await (await post("/api/auth/challenge", { address: publisher.address }, { Origin: origin })).json();
  const signature = await account.signMessage({ message: c.message });
  return { c, signature, res: await post("/api/auth/verify", { message: c.message, signature }, { Origin: origin }) };
}

test("health answers", async () => {
  const r = await fetch(`${base}/health`);
  assert.equal(r.status, 200);
  assert.equal((await r.json()).ok, true);
});

test("challenge refused for non-publisher address and foreign origin", async () => {
  assert.equal((await post("/api/auth/challenge", { address: stranger.address })).status, 403);
  assert.equal((await post("/api/auth/challenge", { address: publisher.address }, { Origin: "https://evil.example" })).status, 403);
});

test("signature from another wallet is refused", async () => {
  const { res } = await login(stranger);
  assert.equal(res.status, 403);
});

test("publisher signs in; challenge cannot be replayed", async () => {
  const { c, signature, res } = await login(publisher);
  assert.equal(res.status, 200);
  const replay = await post("/api/auth/verify", { message: c.message, signature });
  assert.equal(replay.status, 401);
});

test("altered or expired challenge is refused", async () => {
  const c = await (await post("/api/auth/challenge", { address: publisher.address })).json();
  const altered = c.message.replace("Chain ID: 1", "Chain ID: 5");
  const signature = await publisher.signMessage({ message: altered });
  assert.equal((await post("/api/auth/verify", { message: altered, signature })).status, 401);
});

test("uploads need a publisher session; PDFs are validated, stored by hash and served with ranges", async () => {
  const pdf = new Uint8Array(Buffer.concat([Buffer.from("%PDF-1.7\n"), crypto.randomBytes(300_000)]));
  const h = sha(pdf);
  const anon = await post("/api/objects/pdf", pdf, { "Content-Type": "application/pdf", "X-Content-SHA256": h });
  assert.equal(anon.status, 401);
  const token = (await (await login(publisher)).res.json()).token;
  const auth = { Authorization: `Bearer ${token}`, "Content-Type": "application/pdf" };
  assert.equal((await post("/api/objects/pdf", new Uint8Array(Buffer.from("hello")), { ...auth, "X-Content-SHA256": sha(Buffer.from("hello")) })).status, 415);
  assert.equal((await post("/api/objects/pdf", pdf, { ...auth, "X-Content-SHA256": sha(Buffer.from("other")) })).status, 422);
  assert.equal((await post("/api/objects/pdf", pdf, { ...auth, Origin: "https://evil.example", "X-Content-SHA256": h })).status, 403);
  const up = await post("/api/objects/pdf", pdf, { ...auth, "X-Content-SHA256": h });
  assert.equal(up.status, 201);
  const j = await up.json();
  assert.equal(j.sha256, h);
  assert.equal(j.url, `https://files.example/files/${h.slice(2)}.pdf`);
  const again = await (await post("/api/objects/pdf", pdf, { ...auth, "X-Content-SHA256": h })).json();
  assert.equal(again.existed, true);
  const full = await fetch(`${base}/files/${h.slice(2)}.pdf`);
  assert.equal(full.headers.get("content-type"), "application/pdf");
  assert.equal(sha(new Uint8Array(await full.arrayBuffer())), h);
  const part = await fetch(`${base}/files/${h.slice(2)}.pdf`, { headers: { Range: "bytes=0-9" } });
  assert.equal(part.status, 206);
  assert.equal(part.headers.get("content-range"), `bytes 0-9/${pdf.length}`);
  assert.deepEqual(new Uint8Array(await part.arrayBuffer()), pdf.slice(0, 10));
  assert.equal((await fetch(`${base}/files/${h.slice(2)}.pdf`, { headers: { Range: "bytes=999999999-" } })).status, 416);
});

test("oversized PDF is refused", async () => {
  const token = (await (await login(publisher)).res.json()).token;
  const big = new Uint8Array(65 * 1024 * 1024); big.set(Buffer.from("%PDF-"));
  const r = await post("/api/objects/pdf", big, { Authorization: `Bearer ${token}`, "Content-Type": "application/pdf", "X-Content-SHA256": sha(big) });
  assert.equal(r.status, 413);
});

test("path traversal and non-hash names are not served", async () => {
  for (const p of ["/files/..%2Fdrafts.json", "/files/../drafts.json", "/files/drafts.json", "/files/%2e%2e/%2e%2e/etc/passwd"]) {
    const r = await fetch(base + p);
    assert.equal(r.status, 404, p);
  }
});

test("summaries are sanitized and public only after publication", async () => {
  assert.equal(sanitizeSummary("<script>alert(1)</script>Hello‮ <b>world</b>"), "alert(1)Hello world");
  const token = (await (await login(publisher)).res.json()).token;
  const auth = { Authorization: `Bearer ${token}` };
  const pdf = new Uint8Array(Buffer.from("%PDF-1.4 summary test"));
  const h = sha(pdf);
  await post("/api/objects/pdf", pdf, { ...auth, "Content-Type": "application/pdf", "X-Content-SHA256": h });
  const d = await post("/api/drafts", { pdfHash: h, title: "T", summary: "<img src=x onerror=alert(1)>Plain", editorialDate: "0", predictedId: "1" }, auth);
  assert.equal((await d.json()).summary, "Plain");
  let s = await (await fetch(`${base}/api/summaries`)).json();
  assert.equal(s.summaries[h], undefined);
  await post(`/api/drafts/${h}/published`, { issueId: "1", txHash: `0x${"a".repeat(64)}` }, auth);
  s = await (await fetch(`${base}/api/summaries`)).json();
  assert.equal(s.summaries[h].summary, "Plain");
  assert.equal((await post("/api/drafts", { pdfHash: h, title: "T2", summary: "x" }, auth)).status, 409);
});
