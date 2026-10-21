// Read-only integration checks. Static files are locally served under the requested HTTPS origin.
// Chain responses and issue files remain LIVE. Never signs, sends a transaction, uploads, or saves a draft.
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { createPublicClient, http } from "viem";
const engines = await import(process.env.IMD_PLAYWRIGHT || "playwright");
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const out = path.resolve(process.env.IMD_VALIDATION_OUT || path.join(root, "test/scratch/live-newsroom"));
fs.mkdirSync(out, { recursive: true });
const origin = "https://the-imd-daily.sites.imd.fun";
const service = "https://the-imd-daily.duckdns.org";
const publicRPC = "https://ethereum-rpc.publicnode.com";
const rpcURL = process.env.IMD_RPC_URL || publicRPC;
const daily = "0xb8fd2b7fb37cbf03a26b4c4688ed5cce86c0a9c5";
const vault = "0x3343692c3667852a1d4a7d8052c24862e6c523c0";
const publisher = "0x48E4E74fE1d0c14404cEB57B9fec5b21329C6ec9";
const abi = JSON.parse(fs.readFileSync(path.join(root, "abi/IMDDaily.json")));
const client = createPublicClient({ transport: http(rpcURL) });
const report = { mode: process.env.IMD_HOSTED ? "LIVE hosted site and reads" : "LIVE reads; local static export under requested HTTPS origin", browser: process.env.IMD_BROWSER || "chromium", source: publicRPC, at: new Date().toISOString(), checks: [] };
const record = (name, details = {}) => { report.checks.push({ name, passed: true, ...details }); console.log("PASS", name); };
const sha = b => "0x" + crypto.createHash("sha256").update(b).digest("hex");
const price = 100000000000000000n;
const read = (name, args = []) => client.readContract({ address: daily, abi, functionName: name, args });
const count = await read("issueCount");
assert(count > 0n, "An existing real issue is required for this live check");
const issue = await read("getIssue", [count]);
const state = await read("issueStatus", [count]);
assert.equal(state[3], price);
assert.equal(issue.closesAt - issue.publishedAt, 86400n);
assert.equal((await read("PUBLISHER")).toLowerCase(), publisher.toLowerCase());
for (const address of [daily, vault]) assert((await client.getBytecode({ address }))?.length > 2);
record("deployed contracts and issue", { issueId: String(count), supply: String(state[0]), price: String(state[3]), publishedAt: String(issue.publishedAt), closesAt: String(issue.closesAt), available: state[4] });
for (const [name, url, hash, type] of [
  ["PDF", issue.content.pdfURL, issue.content.pdfHash, "application/pdf"],
  ["cover", issue.content.coverURL, issue.content.coverHash, "image/png"],
  ["metadata", issue.content.metadataURI, issue.content.metadataHash, "application/json"]
]) {
  const res = await fetch(url);
  assert(res.ok);
  const bytes = Buffer.from(await res.arrayBuffer());
  assert.equal(sha(bytes).toLowerCase(), hash.toLowerCase());
  assert(res.headers.get("content-type").startsWith(type));
  record("live " + name + " SHA-256", { url, bytes: bytes.length, sha256: hash });
}
const browser = await engines[report.browser].launch({ headless: true });
let context, page;
const errors = [], failedLocal = [], networkFailures = [], rpcMethods = new Set();
const mime = { ".html": "text/html", ".js": "application/javascript", ".mjs": "application/javascript", ".css": "text/css", ".json": "application/json", ".png": "image/png", ".webp": "image/webp", ".jpg": "image/jpeg", ".woff2": "font/woff2", ".woff": "font/woff" };
try {
  context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: "reduce" });
  await context.route("**/*", async route => {
    const req = route.request(), url = new URL(req.url());
    if ([new URL(publicRPC).hostname, "eth.drpc.org"].includes(url.hostname)) {
      const q = req.postDataJSON();
      for (const call of Array.isArray(q) ? q : [q]) {
        assert(["eth_chainId", "eth_blockNumber", "eth_getBlockByNumber", "eth_getLogs", "eth_call", "eth_getCode", "eth_gasPrice", "eth_estimateGas"].includes(call.method), "Only read-only RPC methods allowed");
        rpcMethods.add(call.method);
      }
      const response = await fetch(rpcURL, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(q) });
      return route.fulfill({ status: response.status, contentType: "application/json", body: await response.text() });
    }
    if (url.origin === origin && !process.env.IMD_HOSTED) {
      const filename = path.resolve(root, "dist", decodeURIComponent(url.pathname).replace(/^\//, "") || "index.html");
      assert(filename.startsWith(path.join(root, "dist") + path.sep));
      if (!fs.existsSync(filename)) { failedLocal.push(url.pathname); return route.fulfill({ status: 404, body: "Missing export asset" }); }
      return route.fulfill({ contentType: mime[path.extname(filename)] || "application/octet-stream", body: fs.readFileSync(filename) });
    }
    return route.continue();
  });
  page = await context.newPage();
  page.on("pageerror", e => errors.push(e.message));
  page.on("requestfailed", r => { networkFailures.push({ url: r.url(), failure: r.failure() }); console.log("NETWORK", r.url(), r.failure()); });
  await page.goto(origin);
  await page.locator(".edition-cover img").waitFor();
  await page.waitForFunction(() => document.querySelector(".edition-cover img")?.naturalWidth > 0);
  await page.locator(".editorial-summary .summary").waitFor();
  assert.equal(await page.locator(".edition-cover img").getAttribute("src"), issue.content.coverURL);
  if (state[4]) {
  await page.getByRole("button", { name: "Increase quantity", exact: true }).click();
  assert.equal(await page.locator(".collector-total strong").innerText(), "0.2 IMD");
  await page.getByRole("button", { name: "Decrease quantity", exact: true }).click();
  await page.locator(".qty").fill("0");
  assert.equal(await page.locator(".qty").getAttribute("aria-invalid"), "true");
  await page.locator(".qty").fill("1");
  await page.locator(".recipient-options summary").click();
  await page.getByRole("checkbox", { name: "Choose a recipient", exact: true }).check();
  await page.getByLabel("Recipient address", { exact: true }).fill(daily);
  assert.equal(await page.getByLabel("Recipient address", { exact: true }).getAttribute("aria-invalid"), "false");
  await page.getByRole("checkbox", { name: "Choose a recipient", exact: true }).uncheck();
  await page.locator(".recipient-options summary").click();
  record("quantity totals, input validation and recipient disclosure");
  } else {
    assert.equal(await page.locator(".window-clock strong").innerText(), "Closed");
    assert.equal(await page.locator(".mint-actions").count(), 0);
    record("closed edition retains reading and disables minting");
  }
  await page.getByRole("button", { name: "Connect wallet", exact: true }).click();
  assert(await page.locator("#root").evaluate(el => el.inert));
  await page.keyboard.press("Shift+Tab");
  assert(await page.getByRole("dialog").evaluate(el => el.contains(document.activeElement)));
  await page.keyboard.press("Escape");
  assert.equal(await page.evaluate(() => document.activeElement.textContent), "Connect wallet");
  record("wallet picker, keyboard trap, Escape and focus restoration", { signing: "not attempted; no real wallet available" });
  await page.screenshot({ path: path.join(out, "1440.png"), fullPage: true });
  for (const width of [320, 390, 759, 900, 1100, 1440]) {
    await page.setViewportSize({ width, height: width === 1440 ? 1000 : 844 });
    const measure = await page.evaluate(() => ({ viewport: innerWidth, scrollWidth: document.documentElement.scrollWidth, readBottom: document.querySelector(".btn-read").getBoundingClientRect().bottom }));
    assert.equal(measure.scrollWidth, width);
    if (width === 390) { assert(measure.readBottom < 844); await page.screenshot({ path: path.join(out, "390.png"), fullPage: true }); }
    record("responsive " + width, measure);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  const originalAgent = await page.evaluate(() => navigator.userAgent);
  await page.evaluate(() => Object.defineProperty(navigator, "userAgent", { configurable: true, value: "Mozilla/5.0 iPhone" }));
  await page.getByRole("button", { name: "Connect wallet", exact: true }).click();
  const metaMaskLink = await page.getByRole("link", { name: "Open in MetaMask", exact: true }).getAttribute("href");
  assert(metaMaskLink.includes("the-imd-daily.sites.imd.fun"));
  await page.getByRole("link", { name: "Open in Coinbase Wallet", exact: true }).waitFor();
  await page.getByRole("link", { name: "Open in Phantom", exact: true }).waitFor();
  await page.getByRole("button", { name: "Coinbase Smart Wallet", exact: true }).waitFor();
  await page.keyboard.press("Escape");
  await page.evaluate(agent => Object.defineProperty(navigator, "userAgent", { configurable: true, value: agent }), originalAgent);
  record("mobile wallet deep links and Smart Wallet picker", { emulated: "iPhone user agent without injected provider; no external wallet opened" });
  await page.getByRole("navigation", { name: "Sections" }).getByRole("link", { name: "Archive", exact: true }).click();
  await page.locator(".archive-cover").first().waitFor();
  await page.getByLabel("Search titles, summaries and dates").fill("No. " + count);
  assert.equal(await page.locator(".archive-edition").count(), 1);
  await page.getByLabel("Search titles, summaries and dates").fill("no-matching-edition-test");
  assert.equal(await page.locator(".archive-edition").count(), 0);
  record("live archive search and real thumbnail");
  await page.getByRole("link", { name: "My Collection", exact: true }).click();
  await page.getByRole("heading", { name: "My Collection", exact: true }).waitFor();
  await page.getByRole("link", { name: "About", exact: true }).click();
  await page.getByRole("heading", { name: "About The IMD Daily", exact: true }).waitFor();
  await page.getByRole("link", { name: "Vault", exact: true }).click();
  await page.locator(".figures").waitFor();
  await page.getByRole("link", { name: "Publisher desk", exact: true }).click();
  await page.getByText("Service: " + service + " · healthy", { exact: true }).waitFor();
  const serviceCheck = await page.evaluate(async ({ service, publisher, daily }) => {
    const health = await fetch(service + "/health").then(r => r.json());
    const c = await fetch(service + "/api/auth/challenge", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ address: publisher }) });
    const challenge = await c.json();
    const refused = await fetch(service + "/api/auth/challenge", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ address: daily }) });
    const unsigned = await fetch(service + "/api/auth/verify", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
    return { health: health.ok, challengeStatus: c.status, challengeNamesOrigin: challenge.message?.includes(location.origin), nonPublisherStatus: refused.status, unsignedStatus: unsigned.status };
  }, { service, publisher, daily });
  assert.equal(serviceCheck.health, true);
  assert.equal(serviceCheck.challengeStatus, 200);
  assert.equal(serviceCheck.challengeNamesOrigin, true);
  assert(serviceCheck.nonPublisherStatus >= 400);
  assert(serviceCheck.unsignedStatus >= 400);
  record("actual new-origin service health and login boundary", serviceCheck);
  await page.screenshot({ path: path.join(out, "publisher.png"), fullPage: true });
  await page.goto(origin + "/#/read/" + count);
  await page.locator(".pdf-page canvas").first().waitFor({ timeout: 45000 });
  const actualPages = await page.locator(".pdf-page").count();
  assert(actualPages > 0);
  if (actualPages > 1) { await page.getByRole("button", { name: "Next page", exact: true }).click(); assert.equal(await page.locator("#page-input").inputValue(), "2"); }
  await page.getByRole("button", { name: "Zoom in", exact: true }).click();
  assert.equal(await page.getByRole("button", { name: "Fit to width", exact: true }).innerText(), "125%");
  await page.getByRole("button", { name: "Fit to width", exact: true }).click();
  await page.getByRole("button", { name: "Full screen", exact: true }).click();
  await page.getByRole("button", { name: "Exit full screen", exact: true }).waitFor();
  await page.getByRole("button", { name: "Exit full screen", exact: true }).click();
  const downloadReady = page.waitForEvent("download", { timeout: 60000 });
  await page.getByRole("link", { name: "Download", exact: true }).click();
  const downloaded = await downloadReady;
  assert.equal(await downloaded.failure(), null);
  assert.equal(sha(fs.readFileSync(await downloaded.path())).toLowerCase(), issue.content.pdfHash.toLowerCase());
  await page.screenshot({ path: path.join(out, "reader-390.png") });
  record("existing PDF reader navigation, zoom, fullscreen, lazy rendering and original-byte download", { actualPages });
  await page.getByRole("button", { name: "Close", exact: true }).click();
  assert(page.url().endsWith("#/issue/" + count));
  assert.deepEqual(errors, []);
  assert.deepEqual(failedLocal, []);
  record("routes, local resources and runtime errors", { errors, failedLocal, rpcMethods: [...rpcMethods] });
} catch (e) {
  report.failure = String(e);
  report.networkFailures = networkFailures;
  if (page) { console.log(await page.locator("body").innerText()); await page.screenshot({ path: path.join(out, "failed.png"), fullPage: true }); }
  throw e;
} finally {
  await context?.close(); await browser.close();
  fs.writeFileSync(path.join(out, "results.json"), JSON.stringify(report, null, 2));
}
