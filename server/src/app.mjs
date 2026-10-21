// The IMD Daily upload and file service. Node's own http module plus viem for signature recovery.
// Objects are content-addressed by SHA-256 and never overwritten or deleted through the API.
import http from "node:http";
import crypto from "node:crypto";
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { getAddress, recoverMessageAddress } from "viem";

export const PUBLISHER = "0x48E4E74fE1d0c14404cEB57B9fec5b21329C6ec9";
export const CHAIN_ID = 1;
const KINDS = {
  pdf: { ext: "pdf", type: "application/pdf" },
  cover: { ext: "png", type: "image/png" },
  metadata: { ext: "json", type: "application/json" },
};
const TYPE_BY_EXT = { pdf: "application/pdf", png: "image/png", json: "application/json" };
const HEX64 = /^0x[0-9a-f]{64}$/;

/** Plain text only: tags, control characters and bidi overrides removed, whitespace collapsed. */
export function sanitizeSummary(v) {
  if (typeof v !== "string") return "";
  return v
    .replace(/<[^>]*>/g, "")
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f‪-‮⁦-⁩]/g, "")
    .replace(/[<>]/g, "")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, 1000);
}

function rateLimiter(limit, windowMs) {
  const hits = new Map();
  return (key) => {
    const now = Date.now();
    const h = hits.get(key);
    if (!h || now - h.start > windowMs) { hits.set(key, { start: now, n: 1 }); return true; }
    h.n += 1;
    return h.n <= limit;
  };
}

export function createApp(opts) {
  const cfg = {
    dataDir: opts.dataDir,
    publicFileOrigin: opts.publicFileOrigin.replace(/\/$/, ""),
    allowedOrigins: new Set(opts.allowedOrigins),
    publisher: getAddress(opts.publisher ?? PUBLISHER),
    maxPdfBytes: opts.maxPdfBytes ?? 200 * 1024 * 1024,
    maxSmallBytes: 5 * 1024 * 1024,
    challengeTtlMs: opts.challengeTtlMs ?? 5 * 60_000,
    sessionTtlMs: opts.sessionTtlMs ?? 2 * 60 * 60_000,
    trustProxy: !!opts.trustProxy,
  };
  const objects = path.join(cfg.dataDir, "objects");
  const tmp = path.join(cfg.dataDir, "tmp");
  const draftsFile = path.join(cfg.dataDir, "drafts.json");
  fs.mkdirSync(objects, { recursive: true });
  fs.mkdirSync(tmp, { recursive: true });
  let drafts = {};
  try { drafts = JSON.parse(fs.readFileSync(draftsFile, "utf8")); } catch { drafts = {}; }
  const saveDrafts = async () => {
    const t = path.join(tmp, `drafts-${crypto.randomUUID()}.json`);
    await fsp.writeFile(t, JSON.stringify(drafts, null, 2));
    await fsp.rename(t, draftsFile);
  };

  const nonces = new Map(); // nonce -> { address, origin, expiresAt }
  const sessions = new Map(); // token -> { address, expiresAt }
  const authLimit = rateLimiter(opts.authLimit ?? 20, 60_000);
  const uploadLimit = rateLimiter(opts.uploadLimit ?? 30, 60_000);

  const ip = (req) => (cfg.trustProxy && req.headers["x-forwarded-for"]?.split(",")[0].trim()) || req.socket.remoteAddress || "?";

  function cors(req, res) {
    const origin = req.headers.origin;
    if (origin && cfg.allowedOrigins.has(origin)) {
      res.setHeader("Access-Control-Allow-Origin", origin);
      res.setHeader("Vary", "Origin");
      res.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type, X-Content-SHA256");
      res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
      res.setHeader("Access-Control-Max-Age", "600");
    }
  }
  const json = (res, status, body) => {
    res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" });
    res.end(JSON.stringify(body));
  };
  const fail = (res, status, error) => json(res, status, { error });

  function readBody(req, limit) {
    return new Promise((resolve, reject) => {
      const declared = Number(req.headers["content-length"] ?? "NaN");
      if (Number.isFinite(declared) && declared > limit) { reject(Object.assign(new Error("File too large"), { status: 413 })); req.resume(); return; }
      const chunks = []; let size = 0;
      req.on("data", (c) => {
        size += c.length;
        if (size > limit) { reject(Object.assign(new Error("File too large"), { status: 413 })); req.destroy(); return; }
        chunks.push(c);
      });
      req.on("end", () => resolve(Buffer.concat(chunks)));
      req.on("error", reject);
    });
  }
  async function readJson(req) {
    const b = await readBody(req, 64 * 1024);
    try { return JSON.parse(b.toString("utf8")); } catch { throw Object.assign(new Error("Invalid JSON"), { status: 400 }); }
  }

  /** Every write is re-authorised: a live session for the publisher, from an allowed origin. */
  function requirePublisher(req) {
    const origin = req.headers.origin;
    if (!origin || !cfg.allowedOrigins.has(origin)) throw Object.assign(new Error("Origin not allowed"), { status: 403 });
    const m = /^Bearer ([0-9a-f]{64})$/.exec(req.headers.authorization ?? "");
    const s = m && sessions.get(m[1]);
    if (!s || s.expiresAt < Date.now()) throw Object.assign(new Error("Sign in again"), { status: 401 });
    if (s.address !== cfg.publisher) throw Object.assign(new Error("Only the publisher may upload"), { status: 403 });
    return s;
  }

  function challengeMessage(address, origin, nonce, issuedAt, expiresAt) {
    const host = new URL(origin).host;
    return [
      `${host} wants you to sign in with your Ethereum account:`,
      address,
      "",
      "Sign in to The IMD Daily upload service. This signature sends no transaction and costs nothing.",
      "",
      `URI: ${origin}`,
      "Version: 1",
      `Chain ID: ${CHAIN_ID}`,
      `Nonce: ${nonce}`,
      `Issued At: ${new Date(issuedAt).toISOString()}`,
      `Expiration Time: ${new Date(expiresAt).toISOString()}`,
    ].join("\n");
  }

  async function storeObject(kind, body, claimed) {
    const k = KINDS[kind];
    if (kind === "pdf" && body.subarray(0, 5).toString("latin1") !== "%PDF-") throw Object.assign(new Error("Not a PDF"), { status: 415 });
    if (kind === "cover" && !body.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) throw Object.assign(new Error("Not a PNG"), { status: 415 });
    if (kind === "metadata") {
      try { JSON.parse(body.toString("utf8")); } catch { throw Object.assign(new Error("Metadata is not JSON"), { status: 415 }); }
    }
    const sha = `0x${crypto.createHash("sha256").update(body).digest("hex")}`;
    if (claimed && claimed.toLowerCase() !== sha) throw Object.assign(new Error("SHA-256 does not match the uploaded bytes"), { status: 422 });
    const name = `${sha.slice(2)}.${k.ext}`;
    const final = path.join(objects, name);
    let existed = fs.existsSync(final);
    if (!existed) {
      const t = path.join(tmp, `${crypto.randomUUID()}.part`);
      await fsp.writeFile(t, body, { mode: 0o444 });
      try { await fsp.link(t, final); } catch (e) { if (e.code !== "EEXIST") throw e; existed = true; }
      await fsp.unlink(t);
    }
    return { sha256: sha, url: `${cfg.publicFileOrigin}/files/${name}`, size: body.length, existed };
  }

  async function serveFile(req, res, name) {
    const m = /^([0-9a-f]{64})\.(pdf|png|json)$/.exec(name);
    if (!m) return fail(res, 404, "Not found");
    const file = path.join(objects, name);
    let st;
    try { st = await fsp.stat(file); } catch { return fail(res, 404, "Not found"); }
    const headers = {
      "Content-Type": TYPE_BY_EXT[m[2]],
      "Accept-Ranges": "bytes",
      "Cache-Control": "public, max-age=31536000, immutable",
      ETag: `"${m[1]}"`,
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Expose-Headers": "Accept-Ranges, Content-Range, Content-Length, ETag",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "sandbox; default-src 'none'",
      "Cross-Origin-Resource-Policy": "cross-origin",
    };
    if (req.headers["if-none-match"] === headers.ETag) { res.writeHead(304, headers); return res.end(); }
    const range = req.headers.range;
    if (range) {
      const r = /^bytes=(\d*)-(\d*)$/.exec(range);
      let start = r && r[1] !== "" ? Number(r[1]) : NaN;
      let end = r && r[2] !== "" ? Number(r[2]) : st.size - 1;
      if (r && r[1] === "" && r[2] !== "") { start = Math.max(0, st.size - Number(r[2])); end = st.size - 1; }
      if (!r || !Number.isFinite(start) || start > end || start >= st.size) {
        res.writeHead(416, { ...headers, "Content-Range": `bytes */${st.size}` }); return res.end();
      }
      end = Math.min(end, st.size - 1);
      res.writeHead(206, { ...headers, "Content-Range": `bytes ${start}-${end}/${st.size}`, "Content-Length": end - start + 1 });
      if (req.method === "HEAD") return res.end();
      return fs.createReadStream(file, { start, end }).pipe(res);
    }
    res.writeHead(200, { ...headers, "Content-Length": st.size });
    if (req.method === "HEAD") return res.end();
    fs.createReadStream(file).pipe(res);
  }

  async function handle(req, res) {
    cors(req, res);
    const url = new URL(req.url ?? "/", "http://local");
    const p = url.pathname;
    if (req.method === "OPTIONS") { res.writeHead(204); return res.end(); }

    if ((req.method === "GET" || req.method === "HEAD") && p.startsWith("/files/")) {
      const name = p.slice("/files/".length);
      if (name.includes("/") || name.includes("\\") || name.includes("..")) return fail(res, 404, "Not found");
      return serveFile(req, res, name);
    }
    if (req.method === "GET" && p === "/health") {
      try { await fsp.access(objects, fs.constants.W_OK); } catch { return json(res, 503, { ok: false }); }
      return json(res, 200, { ok: true, version: "1.0.0", publicFileOrigin: cfg.publicFileOrigin });
    }
    if (req.method === "GET" && p === "/api/summaries") {
      res.setHeader("Access-Control-Allow-Origin", "*");
      const summaries = {};
      for (const [h, d] of Object.entries(drafts)) if (d.publishedIssueId) summaries[h] = { summary: d.summary, title: d.title, issueId: d.publishedIssueId };
      return json(res, 200, { summaries });
    }

    if (req.method === "POST" && p === "/api/auth/challenge") {
      if (!authLimit(ip(req))) return fail(res, 429, "Too many requests");
      const origin = req.headers.origin;
      if (!origin || !cfg.allowedOrigins.has(origin)) return fail(res, 403, "Origin not allowed");
      const body = await readJson(req);
      let address;
      try { address = getAddress(String(body.address)); } catch { return fail(res, 400, "Invalid address"); }
      if (address !== cfg.publisher) return fail(res, 403, "Only the publisher may sign in");
      const nonce = crypto.randomBytes(16).toString("hex");
      const issuedAt = Date.now();
      const expiresAt = issuedAt + cfg.challengeTtlMs;
      nonces.set(nonce, { address, origin, expiresAt });
      return json(res, 200, { message: challengeMessage(address, origin, nonce, issuedAt, expiresAt), expiresAt });
    }
    if (req.method === "POST" && p === "/api/auth/verify") {
      if (!authLimit(ip(req))) return fail(res, 429, "Too many requests");
      const origin = req.headers.origin;
      if (!origin || !cfg.allowedOrigins.has(origin)) return fail(res, 403, "Origin not allowed");
      const { message, signature } = await readJson(req);
      if (typeof message !== "string" || typeof signature !== "string" || !/^0x[0-9a-fA-F]{130}$/.test(signature)) return fail(res, 400, "Invalid signature");
      const nonce = /\nNonce: ([0-9a-f]{32})\n/.exec(message)?.[1];
      const rec = nonce && nonces.get(nonce);
      if (!rec) return fail(res, 401, "Unknown or used challenge");
      nonces.delete(nonce); // single use, even when verification fails
      if (rec.expiresAt < Date.now()) return fail(res, 401, "Challenge expired");
      if (rec.origin !== origin) return fail(res, 403, "Challenge was issued to another origin");
      const expected = challengeMessage(rec.address, rec.origin, nonce,
        Date.parse(/\nIssued At: (.+)\n/.exec(message)?.[1] ?? ""), rec.expiresAt);
      if (expected !== message) return fail(res, 401, "Challenge text was altered");
      let signer;
      try { signer = getAddress(await recoverMessageAddress({ message, signature })); } catch { return fail(res, 401, "Invalid signature"); }
      if (signer !== rec.address || signer !== cfg.publisher) return fail(res, 403, "Signature is not from the publisher");
      const token = crypto.randomBytes(32).toString("hex");
      const expiresAt = Date.now() + cfg.sessionTtlMs;
      sessions.set(token, { address: signer, expiresAt });
      return json(res, 200, { token, expiresAt });
    }

    const obj = /^\/api\/objects\/(pdf|cover|metadata)$/.exec(p);
    if (req.method === "POST" && obj) {
      if (!uploadLimit(ip(req))) return fail(res, 429, "Too many requests");
      requirePublisher(req);
      const kind = obj[1];
      const type = (req.headers["content-type"] ?? "").split(";")[0].trim();
      if (type !== KINDS[kind].type) return fail(res, 415, `Expected ${KINDS[kind].type}`);
      const claimed = String(req.headers["x-content-sha256"] ?? "");
      if (!HEX64.test(claimed.toLowerCase())) return fail(res, 400, "X-Content-SHA256 is required");
      const body = await readBody(req, kind === "pdf" ? cfg.maxPdfBytes : cfg.maxSmallBytes);
      return json(res, 201, await storeObject(kind, body, claimed));
    }
    if (req.method === "POST" && p === "/api/drafts") {
      requirePublisher(req);
      const b = await readJson(req);
      const pdfHash = String(b.pdfHash ?? "").toLowerCase();
      if (!HEX64.test(pdfHash) || !fs.existsSync(path.join(objects, `${pdfHash.slice(2)}.pdf`))) return fail(res, 400, "Upload the PDF first");
      const title = sanitizeSummary(String(b.title ?? "")).slice(0, 200);
      if (!title) return fail(res, 400, "Title required");
      const prev = drafts[pdfHash];
      if (prev?.publishedIssueId) return fail(res, 409, `Already published as issue ${prev.publishedIssueId}`);
      drafts[pdfHash] = {
        title, summary: sanitizeSummary(b.summary), editorialDate: String(b.editorialDate ?? ""),
        coverHash: String(b.coverHash ?? ""), metadataHash: String(b.metadataHash ?? ""), predictedId: String(b.predictedId ?? ""),
        updatedAt: new Date().toISOString(),
      };
      await saveDrafts();
      return json(res, 200, { ok: true, summary: drafts[pdfHash].summary });
    }
    const pub = /^\/api\/drafts\/(0x[0-9a-f]{64})\/published$/.exec(p);
    if (req.method === "POST" && pub) {
      requirePublisher(req);
      const b = await readJson(req);
      const d = drafts[pub[1]];
      if (!d) return fail(res, 404, "No draft for this PDF");
      if (!/^[1-9]\d*$/.test(String(b.issueId)) || !HEX64.test(String(b.txHash).toLowerCase())) return fail(res, 400, "Invalid publication record");
      if (!d.publishedIssueId) { d.publishedIssueId = String(b.issueId); d.txHash = String(b.txHash); await saveDrafts(); }
      return json(res, 200, { ok: true });
    }
    return fail(res, 404, "Not found");
  }

  const server = http.createServer((req, res) => {
    handle(req, res).catch((e) => {
      if (!res.headersSent) fail(res, e.status ?? 500, e.status ? e.message : "Internal error");
      else res.destroy();
      if (!e.status) console.error(e);
    });
  });
  server.requestTimeout = 15 * 60_000;
  return server;
}
