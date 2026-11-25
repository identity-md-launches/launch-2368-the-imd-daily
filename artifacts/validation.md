# The IMD Daily: subscription link and daily.imd.fun transition, validation

This is the worker's own validation record for this revision, not independent certification. The previous revision's record (newsroom redesign) is in Git history at `a2c2b39` in this file.

Nothing was deployed or sent on chain. No transaction was signed, no IMD was spent, and no issue, price, window, contract, ABI, treasury destination, publisher permission, stored PDF/cover/metadata URL or upload-service setting was changed.

## Scope and assumptions

| Item | Result |
| --- | --- |
| Starting source | `a2c2b39` (latest published export, `ipfs://bafybeic7yuftlwuoaeco7mamgcfnd2uiz2ynqagozuaczp757vqx4z5gxq`) |
| Changed surfaces | Header nav, homepage (new `#subscribe` section, intro label removed), footer, `index.html` metadata, start-up origin logic |
| New files | `web/src/components/SubscribeLink.tsx`, `web/src/components/SubscribeSection.tsx`, `web/src/lib/origin.ts`, `web/test/origin.test.ts`, `docs/DOMAIN-MIGRATION.md` |
| Unchanged | Contracts, `abi/`, `web/src/config.ts` chain values, mint/reader/publisher/vault/wallet code, `web/package.json`, `web/package-lock.json`, `vite.config.mjs`, server code |
| Export | `dist/` rebuilt from the final source; relative `./assets/` URLs; Vite `base: "./"` |
| Hosting | Done by the delivery plane after submission; this job ran no publish command |

## Blockers reported separately (not done, need other people's access)

1. **Domain not connected.** `daily.imd.fun` returns `NXDOMAIN` (queried A/AAAA/CNAME through dns.google on 2026-11-25; zone `imd.fun` on Cloudflare). Mapping it to the site and issuing HTTPS needs an IMD administrator. Exact steps: `docs/DOMAIN-MIGRATION.md`. **The new domain is not claimed as connected, and HTTPS for it was not verified.**
2. **Server-side redirect not configured.** The static export cannot configure the gateway. A guarded client-side redirect is shipped instead (below); a gateway 301 remains preferable once the domain exists.
3. **Upload service does not yet allow the new origin.** Preflight from `Origin: https://daily.imd.fun` returns no `Access-Control-Allow-Origin`; `https://the-imd-daily-free-to-read-colle.sites.imd.fun` and `https://the-imd-daily.sites.imd.fun` are allowed. Required change on the publisher's VPS: `ALLOWED_ORIGINS=https://daily.imd.fun,https://the-imd-daily-free-to-read-colle.sites.imd.fun,https://the-imd-daily.sites.imd.fun`, then `docker compose up -d`. No wildcard. Sign-in binds the requesting origin, so no other wallet-authentication setting changes. Until then the publisher desk must be used on the working address, which the redirect deliberately exempts.
4. **Static share metadata stays on the working address.** `canonical`, `og:url`, `og:image`, `twitter:image` use `https://the-imd-daily-free-to-read-colle.sites.imd.fun/` so previews never point at an unresolved host. At run time the canonical link switches to `https://daily.imd.fun/` when served there. After the domain is verified, change those four tags in `web/index.html` and rebuild. No sitemap existed and none was added (single page, hash routes).

## What was built

- **Subscribe** in the header nav (cyan, `↗`), on desktop, tablet and mobile (same nav; at <360px it wraps to a second row).
- **Homepage subscription section** under the latest-edition strip, beside the reading/collecting area: “Subscribe to The IMD Daily”, the requested sentence and a **Subscribe via Paper Route** button, plus a three-part list separating *Read free*, *Collect one edition* (0.1 IMD per copy in the 24-hour window, the contract constant) and *Subscribe* (handled by Paper Route; this site asks for no signature, approval or payment). No subscription price, renewal rule or guarantee is stated.
- **Footer** link “Subscribe via Paper Route”.
- All three use `SubscribeLink`: `href="https://paper-route.imd.site/"`, `target="_blank"`, `rel="noopener noreferrer"`, hidden “(opens Paper Route in a new tab)”. No popup, sticky bar or modal.
- **Origin transition** (`web/src/lib/origin.ts`): on the legacy host only, after the page renders, loads `https://daily.imd.fun/favicon.png`; only if it returns this site's 48×45 favicon over HTTPS does it `location.replace` to the same path, query and `#/route` on daily.imd.fun. Never for `#/publisher…` or `?stay`. Today the probe fails (NXDOMAIN), so nothing redirects.
- `server/env.example` and `docs/VPS_SETUP.md` now show the explicit origin list.

## Commands and results (final source)

Dependencies were installed with `npm ci` from the unchanged lockfile in a temporary copy outside the repository (manifests and lockfiles are protected); the export was copied back with `rsync --delete`.

| Command | Result | Evidence |
| --- | --- | --- |
| `npm run typecheck` (`tsc --noEmit`) | exit 0 | `artifacts/checks/typecheck.txt` |
| `npm test` (vitest) | exit 0, 20 tests in 3 files (4 new in `test/origin.test.ts`: exact URLs, path/query/hash mapping, publisher/stay/other-host exemptions, canonical per host) | `artifacts/checks/web-tests.txt` |
| `npm run check:abi` | exit 0, both abiHash values match | `artifacts/checks/abi-check.txt` |
| `npm run build` | exit 0, Vite 6.4.5 | `artifacts/checks/build.txt` |
| `node .imd/reads/skills/design-critic/scripts/taste.mjs --out test/scratch/taste` | exit 0, **16/16 checks passed** (before this revision: 14/16, casing and eyebrows failed on the uppercase intro label) | `artifacts/checks/taste.json`, `artifacts/browser/390.png`, `artifacts/browser/1440.png` (downscaled palette PNGs) |
| Interaction script (Playwright 1.x, headless Chromium, reduced motion) on the final `dist/` | **13/13 passed** | `artifacts/checks/browser-results.json` |
| Server tests | Not run: no server code changed (only `env.example` comments/value) | — |

Chromium needed shared libraries absent from this machine; they were unpacked from Ubuntu packages into a temporary directory outside the repository (`LD_LIBRARY_PATH`), not installed system-wide.

## Interaction checks (headless Chromium)

The export was served under `/preview/` on a local port (subpath, relative assets). Chain reads and the upload service were real; `paper-route.imd.site` was answered by a stub so the test records the exact URL opened. A scripted EIP-6963 test wallet that refuses all signing methods recorded every wallet request.

| Check | Observed |
| --- | --- |
| Home at 320, 390, 1440 | exactly 3 subscription links (header, `#subscribe`, footer), all visible, exact href, `_blank`, `noopener noreferrer`; no horizontal overflow; at 390×844 the Read action ends at 645px and Subscribe is in the first screen; nav is one row at 390/1440, two rows at 320 |
| Clicking nav (390), section button and footer link (1440) | new tab at exactly `https://paper-route.imd.site/`, `window.opener === null`, empty `document.referrer`, original tab unchanged; wallet requests: only the passive `eth_accounts` from wagmi's reconnect, no `eth_requestAccounts`, signature, approval or transaction |
| Hash routes | archive, collection, about, vault, publisher, issue/34, unknown route (Page not found) and home render headings; archive search “November 24” matched 3 editions |
| Reader deep link `#/read/34` at 390 | 6 PDF pages, canvas rendered |
| Download PDF | `imd-daily-34.pdf`, 3,110,643 bytes, starts with `%PDF-` |
| Wallet | sheet lists the EIP-6963 wallet and Coinbase Wallet; Escape closes and returns focus to “Connect wallet”; connecting shows `0x48E4…6ec9 · Disconnect`; no signing call |
| Simulated `https://daily.imd.fun` (export served for that origin inside the browser; DNS does not exist) | `#/issue/34` and `#/read/34` deep links render; all eager images load (incl. VPS cover); fonts loaded: Source Serif 4 600, UnifrakturCook 700, IBM Plex Sans 400–600; canonical becomes `https://daily.imd.fun/`; VPS `/api/summaries` HTTP 200; VPS `/health` **blocked by CORS** (confirms blocker 3) |
| Simulated legacy origin | VPS `/health` HTTP 200 (publisher origin still allowed) |
| Redirect, new host live (simulated) | `…colle.sites.imd.fun/?ref=test#/read/34` → `https://daily.imd.fun/?ref=test#/read/34`, reader renders; `#/publisher` stays on legacy host |
| Redirect, new host unreachable | stays at `…/#/archive`, archive renders |
| Collection configuration (read-only `eth_call`, publicnode) | chain 1; `PRICE` 100000000000000000 (0.1 IMD); `MINT_WINDOW` 86400; `PAYMENT_TOKEN` 0xD34a…63B7; `vault` 0x3343…23C0; `PUBLISHER` 0x48E4…6ec9; `issueCount` 34; issue 34 window closed, so no mint button was available to inspect further and none was attempted |

Observed but not caused by this change: during page loads the browser logged some HTTP 403 responses from `ethereum-rpc.publicnode.com` and 400 from `eth.drpc.org`. The app's existing RPC fallback still loaded all 34 editions; the RPC code is unchanged. Whether the live site shows the same responses was not checked.

## Better Interface review (six domains, changed surfaces)

Coverage: **Checked** for all six domains on header nav, `#subscribe`, footer and metadata; other routes were exercised for regressions only.

| Domain | Checks and result |
| --- | --- |
| Accessibility | Native `<a>` links; accessible names include “opens Paper Route in a new tab”; decorative `↗` and heading dot `aria-hidden`; section labelled by its `h2`; heading order h1 → h2 kept; focus ring inherited (2px cyan); targets ≥44px (nav/footer) and 46px button; taste `targets` passed. Not performed: screen-reader session, native 200% zoom, physical devices. |
| Layout | Subscription sits in flow after the edition strip, after reading and collecting; no popup or sticky element; reading stays first at 390. 320/390/1440 no overflow. |
| Writing | Requested copy used verbatim; three options named distinctly; no invented prices or terms; button label says where it goes. |
| Typography | Existing tokens only (`--fs-section`, `--fs-sub`, `--fs-small`); taste type-sizes ≤6 per width, 3 families, 3 weights. |
| Colors | Existing tokens only (cyan for subscribe, ink-soft for copy); taste `contrast` passed on measured text. No new contrast ratios are claimed beyond the probe. |
| UI | Reuses `.btn`, `.h-section`, rules; hover = border to cyan; no shadows or cards inside cards (taste `chrome` passed). |

Findings and fixes:

| Sev | Location | Finding | Fix / recheck |
| --- | --- | --- | --- |
| Medium | `web/src/pages/FrontPage.tsx` (intro), `web/src/styles.css` `.press-label` | Uppercase, tracked “Independent community press” kicker above the lead heading (taste casing + eyebrows failed in prior revision) | Label and its CSS removed (also from the empty state); taste 16/16 |
| Low | `web/src/App.tsx:27` | Desktop nav rendered “MyCollection”: trailing space inside the flex item was collapsed | Non-breaking space; rechecked on 1440 screenshot |
| Low | `web/src/styles.css` `.foot nav a` | Footer “Subscribe via Paper Route↗” had no gap before the arrow | `gap: 6px`; rechecked |
| Low | `web/src/App.tsx` nav at 320 | Five items did not fit one row | Nav wraps and centers below 360px; “My” hidden below 760px; no overflow at 320 |

## Delivery checklist

- [x] Subscribe nav item, homepage section, footer link, mobile nav: verified (Chromium, 320/390/1440)
- [x] Exact URL, new tab, `noopener noreferrer`, no wallet signature/approval/payment on click: verified
- [x] Free reading / single-edition collecting / Paper Route subscription distinguished, no invented terms
- [x] Archive, reader, PDF download, wallet sheet, routes: verified on the local subpath export
- [x] Contracts, ABIs, chain config, treasury, editions, stored URLs: unchanged; on-chain config read back
- [x] Publisher service: health and summaries reachable; legacy origin allowed; new origin not yet allowed (blocker 3)
- [ ] daily.imd.fun DNS, HTTPS, gateway mapping, server-side redirect: **blocked** (IMD administrator)
- [ ] Real visit to https://daily.imd.fun: impossible until DNS exists; only simulated
- [ ] Published URL of this revision: assigned by the delivery plane after submission (expected under the existing name `the-imd-daily-free-to-read-colle`); not verified by this job

Completion: **Complete for the website scope; domain connection blocked** on the administrator and VPS actions listed above.
