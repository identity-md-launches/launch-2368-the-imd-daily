import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import crypto from "node:crypto";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
const { chromium, webkit } = await import(
  process.env.IMD_PLAYWRIGHT || "playwright"
);
process.chdir(fileURLToPath(new URL("../..", import.meta.url)));
import {
  decodeFunctionData,
  encodeFunctionResult,
  encodeEventTopics,
  encodeAbiParameters,
  parseAbi,
} from "viem";

// All chain, wallet and service data below are local fixtures. External requests are blocked.
const mode = process.argv[2] || "after";
const only = process.argv[3];
const out = path.resolve(
  process.env.IMD_VALIDATION_OUT || "test/scratch/revision-browser",
);
fs.mkdirSync(out, { recursive: true });
const abi = JSON.parse(fs.readFileSync("abi/IMDDaily.json"));
const vaultAbi = JSON.parse(fs.readFileSync("abi/IMDDailyVault.json"));
const tokenAbi = JSON.parse(fs.readFileSync("abi/IMD-payment.json"));
const multicall = parseAbi([
  "function aggregate3((address target, bool allowFailure, bytes callData)[] calls) payable returns ((bool success, bytes returnData)[] returnData)",
]);
const daily = "0xb8fd2b7fb37cbf03a26b4c4688ed5cce86c0a9c5";
const publisher = "0x48E4E74fE1d0c14404cEB57B9fec5b21329C6ec9";
const pendingKey = `imd-daily:pending-publication:${daily}`;
const tx = `0x${"a".repeat(64)}`,
  blockHash = `0x${"b".repeat(64)}`;
const price = 10n ** 17n;
const sha = (b) => `0x${crypto.createHash("sha256").update(b).digest("hex")}`;
function makePdf(label) {
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R 6 0 R 9 0 R 12 0 R] /Count 4 >>",
  ];
  for (let i = 0; i < 4; i++) {
    const stream = `1 0 0 rg 0 0 16 1191 re f 825 0 17 1191 re f 0 0 0 rg BT /F1 26 Tf 24 1110 Td (${label} - TEST FIXTURE ONLY - PAGE ${i + 1}) Tj ET`;
    objects.push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 842 1191] /Resources << /Font << /F1 ${5 + i * 3} 0 R >> >> /Contents ${4 + i * 3} 0 R >>`,
      `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
      "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    );
  }
  let pdf = "%PDF-1.4\n",
    offsets = [0];
  objects.forEach((o, i) => {
    offsets.push(Buffer.byteLength(pdf));
    pdf += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const xref = Buffer.byteLength(pdf);
  pdf +=
    `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n` +
    offsets
      .slice(1)
      .map((o) => `${String(o).padStart(10, "0")} 00000 n \n`)
      .join("") +
    `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(pdf);
}
const pdf = makePdf("A3 edge markers");
const draftPdf = makePdf("Unpublished draft");
function makeRasterPdf() {
  const side = 4200,
    pixels = Buffer.alloc(side * side * 3, 255);
  for (let y = 0; y < side; y++)
    for (let x = 0; x < 24; x++) {
      const p = (y * side + x) * 3;
      pixels[p + 1] = 0;
      pixels[p + 2] = 0;
    }
  const objects = [
    Buffer.from("<< /Type /Catalog /Pages 2 0 R >>"),
    Buffer.from("<< /Type /Pages /Kids [3 0 R 5 0 R 7 0 R 9 0 R] /Count 4 >>"),
  ];
  for (let i = 0; i < 4; i++) {
    const stream = "q 842 0 0 1191 0 0 cm /Im1 Do Q";
    objects.push(
      Buffer.from(
        `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 842 1191] /Resources << /XObject << /Im1 11 0 R >> >> /Contents ${4 + i * 2} 0 R >>`,
      ),
      Buffer.from(
        `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
      ),
    );
  }
  objects.push(
    Buffer.concat([
      Buffer.from(
        `<< /Type /XObject /Subtype /Image /Width ${side} /Height ${side} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Length ${pixels.length} >>\nstream\n`,
      ),
      pixels,
      Buffer.from("\nendstream"),
    ]),
  );
  const chunks = [Buffer.from("%PDF-1.4\n")],
    offsets = [0];
  let length = chunks[0].length;
  objects.forEach((object, i) => {
    offsets.push(length);
    const b = Buffer.concat([
      Buffer.from(`${i + 1} 0 obj\n`),
      object,
      Buffer.from("\nendobj\n"),
    ]);
    chunks.push(b);
    length += b.length;
  });
  chunks.push(
    Buffer.from(
      `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n` +
        offsets
          .slice(1)
          .map((o) => `${String(o).padStart(10, "0")} 00000 n \n`)
          .join("") +
        `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${length}\n%%EOF\n`,
    ),
  );
  return Buffer.concat(chunks);
}
fs.writeFileSync(path.join(out, "draft.pdf"), draftPdf);
const files = new Map(),
  drafts = new Map();
let base,
  issues = [],
  offline = false,
  markCalls = [],
  markFail = false,
  simulations = [],
  walletCalls = [],
  receiptReady = true,
  receiptOverride = null,
  walletMode = "reject",
  rangeRequests = 0;
function reset() {
  offline = false;
  markCalls = [];
  markFail = false;
  simulations = [];
  walletCalls = [];
  receiptReady = true;
  receiptOverride = null;
  walletMode = "reject";
  drafts.clear();
}
const content = (title, bytes = pdf) => ({
  title,
  editorialDate: 1792540800n,
  pdfURL: `${base}/files/${sha(bytes).slice(2)}.pdf`,
  coverURL: `${base}/cover.svg`,
  metadataURI: `${base}/meta.json`,
  pdfHash: sha(bytes),
  coverHash: sha(Buffer.from("cover")),
  metadataHash: sha(Buffer.from("meta")),
});
function contractCall(data) {
  for (const a of [multicall, abi, vaultAbi, tokenAbi]) {
    let decoded;
    try {
      decoded = decodeFunctionData({ abi: a, data });
    } catch {
      continue;
    }
    const { functionName: f, args = [] } = decoded;
    let result;
    switch (f) {
      case "aggregate3":
        result = args[0].map((c) => ({
          success: true,
          returnData: contractCall(c.callData),
        }));
        break;
      case "issueCount":
        result = BigInt(issues.length);
        break;
      case "getIssue":
        result = issues[Number(args[0]) - 1];
        break;
      case "issueStatus": {
        const i = issues[Number(args[0]) - 1];
        result = [0n, i.publishedAt, i.closesAt, price, false];
        break;
      }
      case "totalCollected":
        result = 3n * price;
        break;
      case "totalWithdrawn":
        result = price;
        break;
      case "balance":
      case "balanceOf":
        result = 10000n * 10n ** 18n;
        break;
      case "createIssue":
        simulations.push(args[0]);
        result = BigInt(issues.length + 1);
        break;
      case "PRICE":
        result = price;
        break;
      case "decimals":
        result = 18;
        break;
      case "allowance":
        result = 0n;
        break;
      default:
        throw new Error(`unhandled contract ${f}`);
    }
    return encodeFunctionResult({ abi: a, functionName: f, result });
  }
  throw new Error(`unknown calldata ${data.slice(0, 10)}`);
}
function logFor(id = 2, override = null) {
  const issue = override ?? issues[id - 1],
    c = issue.content;
  const event = abi.find((e) => e.name === "IssuePublished");
  return {
    address: daily,
    topics: encodeEventTopics({
      abi,
      eventName: "IssuePublished",
      args: { issueId: BigInt(id), editorialDate: c.editorialDate },
    }),
    data: encodeAbiParameters(
      event.inputs.filter((p) => !p.indexed),
      [
        issue.publishedAt,
        issue.closesAt,
        c.metadataURI,
        c.pdfHash,
        c.coverHash,
        c.metadataHash,
      ],
    ),
    transactionHash: tx,
    blockHash,
    blockNumber: "0x1906200",
    logIndex: "0x0",
    transactionIndex: "0x0",
    removed: false,
  };
}
function rpc(q) {
  let result;
  switch (q.method) {
    case "eth_chainId":
      result = "0x1";
      break;
    case "eth_blockNumber":
      result = "0x1906200";
      break;
    case "eth_getBlockByNumber":
      result = {
        number: "0x1906200",
        timestamp: "0x6ad74000",
        hash: blockHash,
        parentHash: blockHash,
        transactions: [],
        gasLimit: "0x1c9c380",
        gasUsed: "0x1",
        baseFeePerGas: "0x1",
        difficulty: "0x0",
        extraData: "0x",
        miner: publisher,
        nonce: "0x0000000000000000",
        size: "0x1",
        totalDifficulty: "0x0",
        uncles: [],
      };
      break;
    case "eth_call":
      result = contractCall(q.params[0].data);
      break;
    case "eth_getLogs":
      result = issues.length ? [logFor(issues.length)] : [];
      break;
    case "eth_getTransactionCount":
      result = "0x0";
      break;
    case "eth_estimateGas":
      result = "0x40000";
      break;
    case "eth_gasPrice":
    case "eth_maxPriorityFeePerGas":
      result = "0x1";
      break;
    case "eth_getTransactionReceipt":
      result = receiptReady
        ? {
            transactionHash: tx,
            transactionIndex: "0x0",
            blockHash,
            blockNumber: "0x1906200",
            from: publisher,
            to: daily,
            cumulativeGasUsed: "0x1",
            gasUsed: "0x1",
            contractAddress: null,
            logs: [
              receiptOverride
                ? logFor(receiptOverride.id, receiptOverride.issue)
                : logFor(issues.length),
            ],
            logsBloom: `0x${"0".repeat(512)}`,
            status: "0x1",
            effectiveGasPrice: "0x1",
            type: "0x2",
          }
        : null;
      break;
    default:
      throw new Error(`unhandled RPC ${q.method}`);
  }
  return { jsonrpc: "2.0", id: q.id, result };
}
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://local");
  const json = (status, j) => {
    res.writeHead(status, { "Content-Type": "application/json" });
    res.end(JSON.stringify(j));
  };
  const body = () =>
    new Promise((resolve) => {
      const b = [];
      req.on("data", (v) => b.push(v));
      req.on("end", () => resolve(Buffer.concat(b)));
    });
  if (url.pathname === "/health")
    return json(200, { ok: true, version: "fixture", publicFileOrigin: base });
  if (url.pathname === "/api/auth/challenge")
    return json(200, {
      message: "LOCAL TEST ONLY",
      expiresAt: Date.now() + 60000,
    });
  if (url.pathname === "/api/auth/verify")
    return json(200, { token: "local-test", expiresAt: Date.now() + 600000 });
  if (url.pathname.startsWith("/api/objects/")) {
    const kind = url.pathname.split("/").at(-1),
      bytes = await body(),
      h = sha(bytes),
      ext = { pdf: "pdf", cover: "png", metadata: "json" }[kind];
    files.set(`${h.slice(2)}.${ext}`, {
      bytes,
      type: {
        pdf: "application/pdf",
        png: "image/png",
        json: "application/json",
      }[ext],
    });
    return json(201, {
      sha256: h,
      url: `${base}/files/${h.slice(2)}.${ext}`,
      size: bytes.length,
      existed: false,
    });
  }
  if (url.pathname === "/api/drafts") {
    const d = JSON.parse(await body());
    drafts.set(d.pdfHash, d);
    return json(200, { ok: true, summary: d.summary });
  }
  if (url.pathname.endsWith("/published")) {
    const d = JSON.parse(await body());
    markCalls.push({ pdfHash: url.pathname.split("/")[3], ...d });
    if (markFail)
      return json(503, { error: "Temporary summary service failure" });
    const draft = drafts.get(url.pathname.split("/")[3]);
    if (draft) draft.publishedIssueId = d.issueId;
    return json(200, { ok: true });
  }
  if (url.pathname === "/api/summaries")
    return json(200, {
      summaries: Object.fromEntries(
        [...drafts]
          .filter(([, d]) => d.publishedIssueId)
          .map(([h, d]) => [h, { summary: d.summary }]),
      ),
    });
  if (url.pathname === "/cover.svg") {
    res.writeHead(200, { "Content-Type": "image/svg+xml" });
    return res.end(
      '<svg xmlns="http://www.w3.org/2000/svg" width="297" height="420"><rect width="297" height="420" fill="white"/><text x="20" y="40">TEST FIXTURE ONLY</text></svg>',
    );
  }
  if (url.pathname.startsWith("/files/")) {
    const f = files.get(url.pathname.slice(7));
    if (f) {
      const range = /^bytes=(\d+)-(\d*)$/.exec(req.headers.range ?? "");
      if (range) {
        rangeRequests++;
        const start = Number(range[1]),
          end = Math.min(
            Number(range[2] || f.bytes.length - 1),
            f.bytes.length - 1,
          );
        const part = f.bytes.subarray(start, end + 1);
        res.writeHead(206, {
          "Content-Type": f.type,
          "Accept-Ranges": "bytes",
          "Content-Range": `bytes ${start}-${end}/${f.bytes.length}`,
          "Content-Length": part.length,
        });
        return res.end(part);
      }
      res.writeHead(200, {
        "Content-Type": f.type,
        "Accept-Ranges": "bytes",
        "Content-Length": f.bytes.length,
      });
      return res.end(f.bytes);
    }
  }
  let file = path.resolve(
    "dist",
    url.pathname.replace(/^\/preview\/?/, "") || "index.html",
  );
  if (!file.startsWith(path.resolve("dist") + path.sep)) {
    res.writeHead(404);
    return res.end();
  }
  try {
    const bytes = fs.readFileSync(file);
    res.writeHead(200, {
      "Content-Type":
        {
          ".html": "text/html",
          ".js": "application/javascript",
          ".mjs": "application/javascript",
          ".css": "text/css",
          ".svg": "image/svg+xml",
          ".json": "application/json",
          ".png": "image/png",
          ".woff2": "font/woff2",
          ".woff": "font/woff",
        }[path.extname(file)] || "application/octet-stream",
    });
    res.end(bytes);
  } catch {
    res.writeHead(404);
    res.end();
  }
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
base = `http://127.0.0.1:${server.address().port}`;
files.set(`${sha(pdf).slice(2)}.pdf`, { bytes: pdf, type: "application/pdf" });
const setIssues = () => {
  issues = [
    {
      content: content("Fixture one"),
      publishedAt: 1792454400n,
      closesAt: 1792540800n,
    },
    {
      content: content("Fixture two"),
      publishedAt: 1792454400n,
      closesAt: 1792540800n,
    },
  ];
};
setIssues();
const results = [],
  pageErrors = [];
async function setup(browser, width = 390, wallet = false, pending = null) {
  const ctx = await browser.newContext({ viewport: { width, height: 844 } });
  await ctx.exposeBinding("__submitFixture", (_, request) => {
    walletCalls.push(request);
    if (walletMode !== "confirm") return null;
    const c = decodeFunctionData({ abi, data: request.data }).args[0];
    issues.push({
      content: c,
      publishedAt: 1792540800n,
      closesAt: 1792627200n,
    });
    return tx;
  });
  await ctx.route("**/*", async (route) => {
    const u = route.request().url();
    if (
      u.startsWith("https://ethereum-rpc.publicnode.com") ||
      u.startsWith("https://eth.drpc.org")
    ) {
      if (offline)
        return route.fulfill({ status: 503, body: "offline fixture" });
      try {
        const q = route.request().postDataJSON();
        return route.fulfill({ json: Array.isArray(q) ? q.map(rpc) : rpc(q) });
      } catch (e) {
        console.error("RPC error", e);
        return route.fulfill({ status: 500, body: String(e) });
      }
    }
    if (u.startsWith(base) || u.startsWith("blob:") || u.startsWith("data:"))
      return route.continue();
    return route.abort();
  });
  await ctx.addInitScript(
    ({ base, publisher, pendingKey, pending, wallet }) => {
      localStorage.setItem("imd-daily:service-origin", base);
      if (pending && !sessionStorage.getItem("seeded")) {
        localStorage.setItem(pendingKey, JSON.stringify(pending));
        sessionStorage.setItem("seeded", "yes");
      }
      if (wallet) {
        let connected = sessionStorage.getItem("walletAuthorized") === "yes";
        const p = {
          on() {},
          removeListener() {},
          async request({ method, params }) {
            if (method === "eth_requestAccounts") {
              connected = true;
              sessionStorage.setItem("walletAuthorized", "yes");
              return [publisher];
            }
            if (method === "eth_accounts") return connected ? [publisher] : [];
            if (method === "eth_chainId") return "0x1";
            if (method === "personal_sign") return `0x${"1".repeat(130)}`;
            if (method === "wallet_getCapabilities") return {};
            if (method === "eth_sendTransaction") {
              window.__sent = params[0];
              const hash = await window.__submitFixture(params[0]);
              if (hash) return hash;
              throw Object.assign(new Error("Local test rejection"), {
                code: 4001,
              });
            }
            throw new Error("wallet " + method);
          },
        };
        window.ethereum = p;
        const info = {
          uuid: "7ce12acb-11e1-4452-afc6-0aca6b83c55d",
          name: "Local fixture wallet",
          icon: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg"/>',
          rdns: "test.local",
        };
        const announce = () =>
          dispatchEvent(
            new CustomEvent("eip6963:announceProvider", {
              detail: { info, provider: p },
            }),
          );
        addEventListener("eip6963:requestProvider", announce);
        announce();
      }
    },
    { base, publisher, pendingKey, pending, wallet },
  );
  const page = await ctx.newPage();
  page.on("pageerror", (e) => pageErrors.push(e.message));
  return { ctx, page };
}
async function ready(page, route = "#/read/2") {
  await page.goto(`${base}/preview/${route}`);
  await page.locator(".pdf-page").first().waitFor();
  await page.locator(".pdf-page canvas").first().waitFor();
}
async function connect(page) {
  if (!(await page.getByRole("button", { name: /Disconnect/ }).count())) {
    await page
      .getByRole("button", { name: "Connect", exact: true })
      .first()
      .click();
    await page
      .getByRole("button", { name: /Local fixture wallet|Browser wallet/ })
      .first()
      .click();
  }
  await page
    .getByRole("button", { name: "Sign in to the upload service", exact: true })
    .click();
  await page
    .getByText("Signed in as the publisher for this session.")
    .waitFor();
}
const browsers = [];
try {
  for (const [name, type] of [
    ["chromium", chromium],
    ["webkit", webkit],
  ]) {
    if (only && name === "webkit") continue;
    let browser;
    try {
      browser = await type.launch({ headless: true });
      browsers.push(browser);
    } catch (e) {
      if (name !== "webkit") throw e;
      results.push({
        test: "browser-availability",
        browser: name,
        skipped: true,
        reason: String(e).slice(0, 400),
      });
      continue;
    }
    console.log("launched", name, mode, only);
    for (const width of [390, 1440]) {
      if (only) continue;
      reset();
      const { ctx, page } = await setup(browser, width);
      await ready(page);
      for (let i = 0; i < 3; i++)
        await page
          .getByRole("button", { name: "Zoom in", exact: true })
          .click();
      await page.waitForTimeout(300);
      const left = await page.locator(".reader-pages").evaluate((el) => {
        el.scrollLeft = -9999;
        const p = el.querySelector(".pdf-page").getBoundingClientRect();
        return {
          scrollLeft: el.scrollLeft,
          pageLeft: p.left,
          width: p.width,
          viewport: el.clientWidth,
        };
      });
      await page.screenshot({
        path: path.join(out, `${name}-reader-${width}.png`),
      });
      const nav = [];
      for (let i = 0; i < 3; i++) {
        await page
          .getByRole("button", { name: "Next page", exact: true })
          .click();
        await page.waitForTimeout(200);
        nav.push(await page.locator("#page-input").inputValue());
      }
      const scrolling = await page
        .locator(".reader-pages")
        .evaluate((el) => ({
          top: el.scrollTop,
          page: el.querySelector('[data-page="4"]').getBoundingClientRect().top,
        }));
      results.push({
        test: "reader",
        browser: name,
        width,
        left,
        nav,
        scrolling,
      });
      if (mode === "after") {
        assert(left.pageLeft >= 0);
        assert.deepEqual(nav, ["2", "3", "4"]);
        await page
          .getByRole("button", { name: "Previous page", exact: true })
          .click();
        assert.equal(await page.locator("#page-input").inputValue(), "3");
        const right = await page.locator(".reader-pages").evaluate((el) => {
          el.scrollLeft = 99999;
          return {
            edge: el.querySelector(".pdf-page").getBoundingClientRect().right,
            viewport: el.clientWidth,
          };
        });
        assert(right.edge <= right.viewport);
        results.push({
          test: "reader-right-edge",
          browser: name,
          width,
          ...right,
        });
        await page.locator(".reader-pages").evaluate((el) => {
          const p = el.querySelector('[data-page="2"]');
          el.scrollTop +=
            p.getBoundingClientRect().top - el.getBoundingClientRect().top - 12;
        });
        await page.waitForTimeout(100);
        assert.equal(await page.locator("#page-input").inputValue(), "2");
        await page
          .getByRole("button", { name: "Fit to width", exact: true })
          .click();
        await page.locator("#page-input").fill("1");
        await page.locator("#page-input").press("Enter");
        const fitNav = [];
        for (let i = 0; i < 3; i++) {
          await page
            .getByRole("button", { name: "Next page", exact: true })
            .click();
          await page.waitForTimeout(100);
          fitNav.push(await page.locator("#page-input").inputValue());
        }
        assert.deepEqual(fitNav, ["2", "3", "4"]);
        results.push({
          test: "fit-navigation",
          browser: name,
          width,
          pages: fitNav,
        });
        if (width === 390) {
          await page.locator("#page-input").fill("1");
          await page.locator("#page-input").press("Enter");
          await page
            .getByRole("button", { name: "Next page", exact: true })
            .focus();
          await page.keyboard.press("Space");
          assert.equal(await page.locator("#page-input").inputValue(), "2");
          await page.screenshot({
            path: path.join(out, "reader-keyboard-focus.png"),
          });
          await page
            .getByRole("button", { name: "Zoom out", exact: true })
            .click();
          await page
            .getByRole("button", { name: "Zoom out", exact: true })
            .click();
          await page.locator("#page-input").fill("1");
          await page.locator("#page-input").press("Enter");
          const small = [];
          for (let i = 0; i < 3; i++) {
            await page
              .getByRole("button", { name: "Next page", exact: true })
              .click();
            await page.waitForTimeout(50);
            small.push(await page.locator("#page-input").inputValue());
          }
          assert.deepEqual(small, ["2", "3", "4"]);
          results.push({ test: "small-page-navigation", pages: small });
          await page
            .getByRole("button", { name: "Fit to width", exact: true })
            .click();
          await page.locator("#page-input").fill("1");
          await page.locator("#page-input").press("Enter");
          await page.locator(".reader-pages").evaluate((el) => {
            const touches = [
              new Touch({
                identifier: 1,
                target: el,
                clientX: 80,
                clientY: 300,
              }),
              new Touch({
                identifier: 2,
                target: el,
                clientX: 180,
                clientY: 300,
              }),
            ];
            el.dispatchEvent(
              new TouchEvent("touchstart", { bubbles: true, touches }),
            );
          });
          await page.locator(".reader-pages").evaluate((el) => {
            const touches = [
              new Touch({
                identifier: 1,
                target: el,
                clientX: 55,
                clientY: 300,
              }),
              new Touch({
                identifier: 2,
                target: el,
                clientX: 205,
                clientY: 300,
              }),
            ];
            el.dispatchEvent(
              new TouchEvent("touchmove", { bubbles: true, touches }),
            );
          });
          await page.waitForTimeout(50);
          await page
            .locator(".reader-pages")
            .evaluate((el) =>
              el.dispatchEvent(
                new TouchEvent("touchend", { bubbles: true, touches: [] }),
              ),
            );
          await page
            .getByRole("button", { name: "Fit to width", exact: true })
            .filter({ hasText: "150%" })
            .waitFor();
          const pinchLeft = await page
            .locator(".reader-pages")
            .evaluate((el) => {
              el.scrollLeft = 0;
              return el.querySelector(".pdf-page").getBoundingClientRect().left;
            });
          assert(pinchLeft >= 0);
          results.push({
            test: "synthetic-pinch-zoom",
            zoom: "150%",
            left: pinchLeft,
          });
        }
      }
      await ctx.close();
    }
    for (const width of [320, 390]) {
      if (only) continue;
      reset();
      const { ctx, page } = await setup(browser, width);
      await page.goto(`${base}/preview/#/vault`);
      await page.getByText("0.3 IMD", { exact: true }).waitFor();
      const measure = await page.evaluate(() => ({
        scroll: document.documentElement.scrollWidth,
        client: document.documentElement.clientWidth,
        table: document.querySelector(".figures").getBoundingClientRect().width,
      }));
      await page.screenshot({
        path: path.join(out, `${name}-vault-${width}.png`),
        fullPage: true,
      });
      results.push({ test: "vault", browser: name, width, ...measure });
      if (mode === "after") assert.equal(measure.scroll, measure.client);
      await ctx.close();
    }
    if (name === "chromium") {
      if (mode === "after" && !only) {
        reset();
        issues = [];
        const empty = await setup(browser);
        await empty.page.goto(`${base}/preview/#/`);
        await empty.page
          .getByRole("heading", {
            name: "The first edition is still on the press",
            exact: true,
          })
          .waitFor();
        const emptyWidth = await empty.page.evaluate(
          () => document.documentElement.scrollWidth,
        );
        assert.equal(emptyWidth, 390);
        await empty.page.screenshot({
          path: path.join(out, "front-empty-390.png"),
          fullPage: true,
        });
        await empty.page
          .getByRole("link", { name: "How The IMD Daily works", exact: true })
          .click();
        await empty.page
          .getByRole("heading", { name: "About The IMD Daily", exact: true })
          .waitFor();
        await empty.ctx.close();
        results.push({ test: "empty-archive-navigation", passed: true });
        setIssues();
        const raster = makeRasterPdf();
        const rasterHash = sha(raster);
        files.set(`${rasterHash.slice(2)}.pdf`, {
          bytes: raster,
          type: "application/pdf",
        });
        issues[1] = {
          ...issues[1],
          content: content("Large raster TEST FIXTURE ONLY", raster),
        };
        rangeRequests = 0;
        const large = await setup(browser);
        await ready(large.page);
        assert.equal(await large.page.locator(".pdf-page").count(), 4);
        for (let i = 0; i < 3; i++)
          await large.page
            .getByRole("button", { name: "Zoom in", exact: true })
            .click();
        await large.page.waitForTimeout(300);
        await large.page.locator(".pdf-page canvas").first().waitFor();
        const color = await large.page
          .locator(".pdf-page canvas")
          .first()
          .evaluate((c) => [
            ...c
              .getContext("2d")
              .getImageData(1, Math.floor(c.height / 2), 1, 1).data,
          ]);
        assert.deepEqual(color, [255, 0, 0, 255]);
        const pages = [];
        for (let i = 0; i < 3; i++) {
          await large.page
            .getByRole("button", { name: "Next page", exact: true })
            .click();
          pages.push(await large.page.locator("#page-input").inputValue());
        }
        assert.deepEqual(pages, ["2", "3", "4"]);
        await large.page.locator('[data-page="4"] canvas').waitFor();
        await large.page.screenshot({
          path: path.join(out, "large-raster-reader.png"),
        });
        const downloadPromise = large.page.waitForEvent("download");
        await large.page
          .getByRole("link", { name: "Download", exact: true })
          .click();
        const download = await downloadPromise;
        assert.equal(await download.failure(), null);
        assert.equal(fs.statSync(await download.path()).size, raster.length);
        results.push({
          test: "large-raster-reader-download",
          bytes: raster.length,
          pages,
          rangeRequests,
          color,
        });
        await large.ctx.close();
        files.delete(`${rasterHash.slice(2)}.pdf`);
        setIssues();
      }
      for (const route of only ? [] : ["issue", "read"]) {
        reset();
        offline = true;
        const { ctx, page } = await setup(browser);
        await page.goto(`${base}/preview/#/${route}/1`);
        await page.waitForFunction(
          () => !/Reading issue|Finding issue/.test(document.body.innerText),
        );
        const text = await page.locator("body").innerText();
        results.push({ test: "outage", route, text });
        if (mode === "after") {
          assert(text.includes("The edition could not be checked. Try again."));
          offline = false;
          await page
            .getByRole("button", { name: "Retry", exact: true })
            .click();
          if (route === "read")
            await page.locator(".pdf-page").first().waitFor();
          else
            await page
              .getByRole("heading", { name: "Fixture one", exact: true })
              .waitFor();
        }
        await ctx.close();
      }
      reset();
      setIssues();
      const { ctx, page } = await setup(browser, 1440, true);
      console.log("publisher navigate");
      await page.goto(`${base}/preview/#/publisher`);
      console.log("publisher connect");
      await connect(page);
      await page.locator("#pdf").setInputFiles(path.join(out, "draft.pdf"));
      await page.locator("#title").fill("Title A before upload");
      await page.locator("#date").fill("2026-10-21");
      await page.locator("#summary").fill("Summary A");
      await page
        .getByRole("button", { name: "Upload and verify files", exact: true })
        .click();
      await page
        .getByRole("heading", { name: "4. Publish on chain", exact: true })
        .waitFor();
      await page.locator("#title").fill("Title B reviewed for publication");
      await page.locator("#date").fill("2026-10-20");
      await page.locator("#summary").fill("Summary B unique-term");
      const invalidated = (await page.locator(".publish-box").count()) === 0;
      if (mode === "after") {
        assert(invalidated);
        await page
          .getByRole("button", { name: "Upload and verify files", exact: true })
          .click();
        await page
          .getByRole("heading", { name: "4. Publish on chain", exact: true })
          .waitFor();
        assert(
          (await page.locator(".publish-box").innerText()).includes(
            "Title B reviewed for publication",
          ),
        );
        assert(
          (await page.locator(".publish-box").innerText()).includes(
            "Summary B unique-term",
          ),
        );
        for (const [field, value] of [
          ["#date", "2026-10-19"],
          ["#summary", "Summary C"],
          ["#title", "Title C"],
        ]) {
          await page.locator(field).fill(value);
          assert.equal(await page.locator(".publish-box").count(), 0);
          await page
            .getByRole("button", {
              name: "Upload and verify files",
              exact: true,
            })
            .click();
          await page.locator(".publish-box").waitFor();
          assert.equal(await page.getByRole("checkbox").isChecked(), false);
        }
        await page.locator("#title").fill("Title B reviewed for publication");
        await page.locator("#date").fill("2026-10-20");
        await page.locator("#summary").fill("Summary B unique-term");
        await page
          .getByRole("button", { name: "Upload and verify files", exact: true })
          .click();
        await page.locator(".publish-box").waitFor();
        await page.screenshot({
          path: path.join(out, "publisher-confirmation.png"),
          fullPage: true,
        });
      }
      await page.getByRole("checkbox").check();
      await page
        .getByRole("button", { name: "Publish No. 3 on Ethereum", exact: true })
        .click();
      await page.waitForFunction(() => window.__sent);
      const sent = decodeFunctionData({
        abi,
        data: (await page.evaluate(() => window.__sent)).data,
      }).args[0];
      results.push({
        test: "prepared-edit",
        invalidated,
        sent: { title: sent.title, editorialDate: String(sent.editorialDate) },
        summary: [...drafts.values()][0].summary,
      });
      if (mode === "after") {
        assert.equal(sent.title, "Title B reviewed for publication");
        assert.equal(sent.editorialDate, 1792454400n);
        assert.equal([...drafts.values()][0].summary, "Summary B unique-term");
      }
      await ctx.close();
      reset();
      setIssues();
      const pending = {
        predictedId: "2",
        content: Object.fromEntries(
          Object.entries(issues[1].content).map(([k, v]) => [k, String(v)]),
        ),
        hash: tx,
        startedAt: Date.now(),
        serviceOrigin: base,
      };
      drafts.set(pending.content.pdfHash, {
        summary: "Recovered unique summary",
      });
      markFail = mode === "after";
      const recovery = await setup(browser, 390, true, pending);
      await recovery.page.goto(`${base}/preview/#/publisher`);
      await recovery.page.waitForTimeout(1000);
      const beforeAuth = await recovery.page.evaluate(
        (k) => localStorage.getItem(k),
        pendingKey,
      );
      await connect(recovery.page);
      await recovery.page.waitForTimeout(700);
      if (mode === "after") {
        assert(beforeAuth);
        assert(markCalls.length > 0);
        assert(
          await recovery.page.evaluate(
            (k) => localStorage.getItem(k),
            pendingKey,
          ),
        );
        await recovery.page.screenshot({
          path: path.join(out, "publisher-recovery-failure.png"),
          fullPage: true,
        });
        await recovery.page.reload();
        await connect(recovery.page);
        await recovery.page
          .getByRole("button", { name: "Retry summary update", exact: true })
          .waitFor();
        assert(
          await recovery.page.evaluate(
            (k) => localStorage.getItem(k),
            pendingKey,
          ),
        );
        markFail = false;
        await recovery.page
          .getByRole("button", { name: "Retry summary update", exact: true })
          .click();
        await recovery.page.waitForFunction(
          (k) => localStorage.getItem(k) === null,
          pendingKey,
        );
        await recovery.page
          .getByRole("link", { name: "Archive", exact: true })
          .click();
        await recovery.page
          .getByLabel("Search titles, summaries and dates")
          .fill("Recovered unique summary");
        await recovery.page
          .getByRole("heading", { name: "Fixture two", exact: true })
          .waitFor();
      }
      results.push({
        test: "recovery",
        beforeAuth: !!beforeAuth,
        markCalls: [...markCalls],
        pending: await recovery.page.evaluate(
          (k) => localStorage.getItem(k),
          pendingKey,
        ),
        summaryPublished: !!drafts.get(pending.content.pdfHash)
          .publishedIssueId,
      });
      await recovery.ctx.close();
      if (mode === "after") {
        reset();
        setIssues();
        const c = content("Receipt recovery fixture", draftPdf);
        receiptOverride = {
          id: 3,
          issue: {
            content: c,
            publishedAt: 1792540800n,
            closesAt: 1792627200n,
          },
        };
        const receiptPending = {
          ...pending,
          predictedId: "3",
          content: Object.fromEntries(
            Object.entries(c).map(([k, v]) => [k, String(v)]),
          ),
        };
        drafts.set(c.pdfHash, { summary: "Receipt recovered summary" });
        const receipt = await setup(browser, 390, true, receiptPending);
        await receipt.page.goto(`${base}/preview/#/publisher`);
        await receipt.page
          .getByText("Published as No. 3:", { exact: true })
          .waitFor();
        assert(
          await receipt.page.evaluate(
            (k) => localStorage.getItem(k),
            pendingKey,
          ),
        );
        await connect(receipt.page);
        await receipt.page.waitForFunction(
          (k) => localStorage.getItem(k) === null,
          pendingKey,
        );
        assert.equal(markCalls.at(-1).issueId, "3");
        assert(drafts.get(c.pdfHash).publishedIssueId);
        results.push({
          test: "receipt-only-recovery",
          passed: true,
          markCalls: [...markCalls],
        });
        await receipt.ctx.close();

        reset();
        setIssues();
        walletMode = "confirm";
        markFail = true;
        const normal = await setup(browser, 1440, true);
        await normal.page.goto(`${base}/preview/#/publisher`);
        await connect(normal.page);
        await normal.page
          .locator("#pdf")
          .setInputFiles(path.join(out, "draft.pdf"));
        await normal.page.locator("#title").fill("Normal confirmation fixture");
        await normal.page
          .locator("#summary")
          .fill("Normal flow unique summary");
        await normal.page
          .getByRole("button", { name: "Upload and verify files", exact: true })
          .click();
        await normal.page.locator(".publish-box").waitFor();
        await normal.page.getByRole("checkbox").check();
        await normal.page
          .getByRole("button", {
            name: "Publish No. 3 on Ethereum",
            exact: true,
          })
          .click();
        await normal.page
          .getByRole("button", { name: "Retry summary update", exact: true })
          .waitFor();
        const saved = await normal.page.evaluate(
          (k) => JSON.parse(localStorage.getItem(k)),
          pendingKey,
        );
        assert.equal(saved.publishedIssueId, "3");
        assert.equal(walletCalls.length, 1);
        await normal.page.reload();
        await connect(normal.page);
        await normal.page
          .getByRole("button", { name: "Retry summary update", exact: true })
          .waitFor();
        markFail = false;
        await normal.page
          .getByRole("button", { name: "Retry summary update", exact: true })
          .click();
        await normal.page.waitForFunction(
          (k) => localStorage.getItem(k) === null,
          pendingKey,
        );
        assert.equal(walletCalls.length, 1);
        assert.equal(drafts.get(sha(draftPdf)).publishedIssueId, "3");
        results.push({
          test: "normal-confirmation-summary-failure-reload",
          passed: true,
          submittedTransactions: walletCalls.length,
          serviceAttempts: markCalls.length,
        });
        await normal.ctx.close();

        reset();
        setIssues();
        const noHash = { ...pending };
        delete noHash.hash;
        drafts.set(noHash.content.pdfHash, {
          summary: "Indexed transaction summary",
        });
        const indexed = await setup(browser, 390, true, noHash);
        await indexed.page.goto(`${base}/preview/#/publisher`);
        await indexed.page
          .getByText("Published as No. 2:", { exact: true })
          .waitFor();
        await connect(indexed.page);
        await indexed.page.waitForFunction(
          (k) => localStorage.getItem(k) === null,
          pendingKey,
        );
        assert.equal(markCalls.at(-1).txHash, tx);
        results.push({
          test: "missing-hash-recovery-from-index",
          passed: true,
        });
        await indexed.ctx.close();
      }
    }
    await browser.close();
  }
  assert.deepEqual(pageErrors, []);
  results.push({ test: "runtime-errors", errors: pageErrors });
} finally {
  await Promise.all(browsers.map((b) => b.close()));
  fs.writeFileSync(
    path.join(out, "results.json"),
    JSON.stringify(results, null, 2),
  );
  server.closeAllConnections();
  await new Promise((r) => server.close(r));
}
console.log(JSON.stringify(results, null, 2));
