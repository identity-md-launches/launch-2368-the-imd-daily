# The IMD Daily newsroom redesign: validation

This is the worker’s local validation record, not independent certification. The frontend and production export are implemented and checked. **Hosting and the submission commit remain the delivery plane’s final step.** No real transaction, purchase, issue publication, mint reset, price change, withdrawal or content/storage migration was performed.

## Scope and delivery status

| Area | Result |
| --- | --- |
| Accepted starting source | `bd592f73cce24af973c6d2c67069be392db5bdb9` |
| Production export | Complete `dist/`, source in `web/`, original manifest and lockfile retained |
| Requested hostname/label | `https://the-imd-daily.sites.imd.fun` / `the-imd-daily` |
| Hosting | Pending delivery plane; worker publish command was refused |
| Previous site | No publish, deletion, redirect or replacement was performed against it |
| Existing VPS | `https://the-imd-daily.duckdns.org`, shipped default; valid saved browser settings take precedence |
| Original illustrations | Three finished originals bundled as optimized WebP plus PNG/JPEG fallbacks; prompts in `docs/ARTWORK.md` |
| Real issue content | Existing issue 1; its cover, PDF, metadata and saved summary retained |
| Contracts/economics | Existing chain 1 contracts and ABIs retained; 0.1 IMD/copy, ETH gas only |
| Protected paths | Build configuration, manifests, lockfiles, dependencies, contracts, `.github/` and environment files unchanged |
| Git internals | Worker did not modify `.git/`; submission commit is handled by delivery |
| Required screenshots | `artifacts/browser/1440.png`, `artifacts/browser/390.png` |
| Design documentation | Root `DESIGN.md`, extracted from final source and checked against rendered output |

The explicit art direction takes precedence over the guide’s general preference against uppercase labels. The city artwork is decorative and absent on mobile and in the reader. Text, controls, all data and headings remain accessible HTML. There is no fabricated news, cover, historical edition, page count, balance or minted supply.

## Hosting result and naming limitation

The worker ran `imd site publish dist --name the-imd-daily`. It exited **2** with:

> refused: imd site publishes this contributor's own site, never a job's work. A job's website is hosted by the plane when the job completes: commit the source and the export in dist/ and submit. There is nothing to publish and nothing to ask an operator for.

The requested HTTPS hostname returned HTTP 404 before delivery. This is not evidence of a label collision. **No naming-specific blocker was reported, but label assignment and actual hosted-site access are unverified.** The worker did not bypass the refusal or modify the existing site. The export is ready for the plane to host at the requested new URL.

New-origin service checks below used the actual requested origin inside a browser, with the production static files fulfilled locally by Playwright. The VPS and chain responses were real. This establishes service access from that origin; it does not establish public deployment of the frontend. `IMD_HOSTED=1` in the live test script is available for the eventual actual URL check.

## Production build, typecheck and unit checks

Dependencies were installed outside the repository in a temporary build copy because existing manifests/lockfiles were protected. Source, public assets, manifest, lockfile and Vite/TypeScript configuration were compared byte for byte against the validated copy (49 files). No dependency or build configuration was changed. The completed export was copied back and obsolete output files removed.

| Command | Actual result | Evidence |
| --- | --- | --- |
| `npm ci --prefix /tmp/imd-daily-build/web --cache /tmp/imd-npm-cache --no-audit --no-fund` | Passed using unchanged lockfile | Build copy only; no generated dependency directory in submission |
| `npm run typecheck --prefix /tmp/imd-daily-build/web` | Exit 0 | `artifacts/checks/typecheck.txt` |
| `npm test --prefix /tmp/imd-daily-build/web` | Exit 0; 16 tests in two files | `artifacts/checks/web-tests.txt` |
| `npm run check:abi --prefix /tmp/imd-daily-build/web` | Exit 0; both pinned canonical hashes match | `artifacts/checks/abi-check.txt` |
| `npm run build --prefix /tmp/imd-daily-build/web` | Exit 0; Vite 6.4.5, 5,305 modules; complete static export | `artifacts/checks/build.txt` |
| `npm test --prefix /tmp/imd-daily-build/server` | Exit 0; 14 service/restore tests | `artifacts/checks/server-tests.txt` |
| `git diff --check` | Passed after removing raw HTTP-header trailing whitespace | Final local check |
| Protected-path diff and export inspection | Passed | `artifacts/checks/export-integrity.json` |
| File and bundle budget | Under 8,388,608 bytes; exact final totals in report | `artifacts/checks/submission-budget.json` |

The build reports dependency PURE-annotation warnings and Vite public-asset warnings inside `image-set`. They do not fail the build. The emitted CSS was inspected: the URLs resolve relatively, no `__VITE_` placeholders remain, and both engines loaded all local assets. No source map, vendored npm registry, package archive, dependency/cache directory or submodule is required or included.

The 16 frontend tests cover integer-only amounts, strict quantities/dates, gas rounding, open-window bounds, mint deadline, closed-window latch, countdown, archive search, metadata cross-field validation, resumable indexing, saved service settings, failed authentication and committed-hash refusal. Service/restore tests use temporary local data.

## Live read-only integration checks

Run through `web/scripts/validate-live.mjs`, with Playwright installed outside the repository. The contributor RPC was supplied only to the test harness; the shipped RPC sources remain **https://ethereum-rpc.publicnode.com** and **https://eth.drpc.org**. The test adapter allowed only read-only RPC methods and never exposed a signing key.

Both **Chromium and WebKit passed all 17 live integration checks** on the final production export. Results are separate from fixtures in `artifacts/checks/reproduced-public.json`. The tests ran with reduced motion and the actual requested browser origin. The original cover and saved summary were loaded from the existing VPS.

Observed live state during checks:

- Issue count: **1**, latest issue ID **1**, actual minted supply **0**.
- Price: **100000000000000000 base units = 0.1 IMD**.
- Publication: **1792576715**; close: **1792663115**, exactly **86,400 seconds** later.
- Edition was open at the time of testing; all values were read, not seeded into the frontend.
- Existing collection and vault both had deployed bytecode; the collection’s publisher matched the pinned address.
- All addresses/chain facts and ABI hashes matched the supplied deployment.

| Live resource | Bytes fetched | Verified SHA-256 |
| --- | ---: | --- |
| Existing PDF | 23,259,417 | `0f66a502800b27215aaac11d1ec109919dbd5250637e8f7989b439ec33c5b86a` |
| Existing cover | 4,558,217 | `38ce83557cce0fd6cc8991a61e97a82fadfee83ee12058949db0e5fe7c3895ed` |
| Existing metadata | 1,079 | `bb0fc31b8057df4a67c8ad485d2b8f6a8f0b801c7772e5c7917f48a78f9df7d3` |

The hashes matched the chain commitments byte for byte. The uploaded files were neither edited nor copied into generated news content.

Both browser engines exercised:

1. Real-cover loading, actual saved summary, and quantity plus/minus, integer totals and invalid quantity input.
2. Optional recipient disclosure and address validation without sending a transaction.
3. Wallet picker opening, inert page, keyboard focus trap, Escape and focus return.
4. Responsive layout at 320, 390, 759, 900, 1100 and 1440px, with no document overflow.
5. At 390×844, Read action bottom **645.55px**, fully on the first screen; header **110px**.
6. Emulated iPhone/no-injected-provider picker: MetaMask, Coinbase and Phantom links preserve the page origin, and Coinbase Smart Wallet is available. No wallet app was opened.
7. Archive title/date/summary search, matching and empty results, and a real thumbnail.
8. Collection’s disconnected state, About, Vault readout, Publisher desk, and issue permalink.
9. The real six-page PDF: lazy canvas rendering, next page, zoom/fit, fullscreen/window fallback and close back to its issue.
10. Download event and the original 23,259,417 PDF bytes, with the downloaded hash again matching the commitment.
11. Zero uncaught application runtime errors and zero missing local export resources.

The WebKit browser initially lacked host libraries and then TLS modules. Temporary browser-only dependencies were installed outside the repository, and the entire live suite passed after repair. These earlier tool failures are not concealed as product failures or counted as passes. A Chromium run logged an aborted Coinbase metrics request on browser closure; it was not an application exception or required resource. One early direct public-RPC preview saw a fallback provider return HTTP 400 while the other provider loaded the issue successfully; the final controlled read-only transport checks passed.

### Actual new-origin upload-service boundary

Both engines checked real HTTPS access from `https://the-imd-daily.sites.imd.fun`:

- `GET /health`: HTTP 200, `ok: true`, correct public file origin.
- `POST /api/auth/challenge` for the pinned publisher: HTTP 200; the challenge includes the new browser origin.
- A known non-publisher address: HTTP 403.
- Unsigned verification: HTTP 400.
- A separate actual POST preflight returned HTTP 204, with the exact new origin and Authorization, Content-Type and X-Content-SHA256 allowed.

See `artifacts/checks/reproduced-publisher.txt` for the public response headers. No challenge signature, successful real publisher login, authenticated upload, draft/content write or publication was performed. The challenge nonce is transient authentication state. Successful publisher flows are covered by the isolated fixture suite below.

A valid service origin already saved in the same origin’s browser storage still wins over `service.json`. Browser storage and wallet sessions are origin-scoped; the new hostname cannot import the old site’s storage automatically.

## Mocked interaction checks

`web/scripts/validate-revision.mjs` serves the production export under a local `/preview/` subpath, supplies explicitly named local fixtures and blocks external requests. **All wallet requests, transaction receipts, publications, balances and service writes in this suite are mocks.** It uses no real signer and broadcasts nothing.

The final command completed with exit 0 in **Chromium and WebKit**, producing **46 result records**, with **no skipped/failed cases and no runtime errors**. Evidence: `artifacts/checks/browser-results.json`. This is a count of records, not a claim of 46 independent tests.

Covered states and assertions:

- Approval declined: exactly the displayed 0.2 IMD total is requested, collection is the spender, no ETH value is sent.
- Mint declined after sufficient allowance: expected issue/quantity/recipient and a deadline strictly before the chain close.
- ABI-encoded `MintClosed(issueId)` simulation refusal: descriptive error, zero wallet submissions.
- Approval receipt reverted: error and no completed mint.
- Approval pending: quantity/action disabled; after mocked block advancement, exact approval then mint and confirmed receipt link.
- Insufficient IMD and wrong Ethereum network: mint unavailable with explanatory text.
- Short-interval expiry: Closed appears, mint controls disappear, Read and Download remain.
- Reader page navigation, left/right edges when zoomed, small final pages, keyboard action and synthetic pinch in both engines.
- A 52,921,453-byte local raster PDF: four pages, range reads, original edge color retained, full download.
- 320/390px vault accounting reflow.
- Zero-issue state with navigation, RPC outage/retry on issue and reader routes.
- Publisher preparation invalidation after edits, file/hash checks, explicit review, failed transaction, persisted recovery, receipt/index recovery and summary retry after reload.

Synthetic touch events exercise the application handlers; they are not physical pinch or mobile-wallet tests.

## Better Interface six-domain review

The pinned workflow and the core principles of all six domains were read and applied while building. Representative source and rendered checks were consolidated here. Guidance attribution and licenses are in `DESIGN.md` and `docs/DESIGN-GUIDANCE-LICENSE.txt`.

| Domain | Coverage and evidence | Unperformed/limited checks |
| --- | --- | --- |
| Accessibility | Checked native buttons/links, field labels, headings/landmarks, skip link, visible keyboard focus, modal trap/return, state text and reduced motion; browser snapshots and keyboard interactions | No screen-reader session or physical-device testing; no claim of full WCAG conformance |
| Layout | Checked hierarchy, shared gutters, opaque text surfaces, 320–1440px reflow, mobile first-screen action, disclosed recipient, real-cover proportions and scroll shelf | Native browser 200% zoom and RTL mirror not performed; product is English-only |
| Writing | Checked labels, price/gas distinction, recovery/error copy, truthful loading/empty/closed states, actual-only archive/summary | Real wallet-specific rejection wording can vary by provider |
| Typography | Checked loaded local brand/UI/editorial fonts, six-size scale, three families/weights, wrapping, hashes and tabular changing values | Other operating-system font rasterization not inspected |
| Colors | Checked actual computed opaque foreground/background pairs; probe passed text contrast; primary and muted text remain off busy scenery | Decorative scenery is not a text contrast reference; no claim about untested external wallet UI |
| UI | Checked restrained rectangular surfaces, paper-only depth, large primary controls, focus/hover/disabled/pending states, reduced-motion output, reader without scenery | No native handset fullscreen, passkey, wallet-app launch or hardware touch test |

Measured foreground/background contrast: primary/page **17.18:1**; secondary/page **9.56:1**; cyan/page **10.21:1**; primary/panel **16.10:1**; secondary/panel **8.96:1**; action text/green **11.79:1**; green/page **12.91:1**. The reduced-motion browser check reported no active animations and zero nonzero control transition durations.

### Findings fixed and rechecked

| Severity | Source | Finding and correction | Recheck |
| --- | --- | --- | --- |
| Medium | `web/src/wallet/ConnectSheet.tsx:27` | Modal claimed modal behavior but the page remained keyboard-reachable. Portalled the dialog outside the inert root, trapped Tab and restored the trigger on close. | Both live engines; mocked named-provider connection |
| Medium | `web/src/components/DownloadLink.tsx:9` | Cross-origin download attributes alone do not reliably save a file. Added original-byte Blob download with pending/error fallback, retaining a real href. | Both engines emitted download events; real PDF and large fixture hashes/bytes verified |
| Medium | `web/src/pages/FrontPage.tsx:36` | The earlier home archive was hidden when only one issue existed. Show the actual current issue in the archive and keep the saved summary below the lead. No historical entries invented. | Live one-issue state and archive searches |
| Low | `web/src/styles.css:145` | Probe found a fourth weight from 500. Consolidated UI emphasis to 600; kept brand 700 and body 400. | Final probe: three weights/families and six sizes |
| Low | `web/src/pages/FrontPage.tsx:39` | Archive copy repeated the two-beat slogan pattern. Replaced it with one plain sentence. | Slogan/repetition checks pass |
| Low | `web/src/styles.css:148` | Mint action combined border and glow. Removed its border and retained the restrained green shadow. | Chrome check passes |
| Low | `web/src/styles.css:58` | Increased brand/wallet hit areas to at least 44px while retaining compact mobile header. | Final 390px Read action remains on-screen; target check passes |

### taste@1 probe

Ran from repository root:

```sh
IMD_PLAYWRIGHT=/tmp/imd-browser/node_modules/playwright/index.mjs PLAYWRIGHT_BROWSERS_PATH=/tmp/imd-browsers node .imd/reads/skills/design-critic/scripts/taste.mjs --out test/scratch/taste
```

The final result is **14/16 categories passed**, recorded in `artifacts/checks/taste.json`. Render, layout, targets, contrast, tracking, type sizes/families/weights, glyphs, slogans, repetition, copy budget, chrome, motion and share metadata passed.

The two flags are deliberate brief overrides at `web/src/styles.css:101` and `web/src/pages/FrontPage.tsx:73`: **“small cyan INDEPENDENT COMMUNITY PRESS label”** explicitly requests uppercase and its position above the headline. The label has restrained tracking and passed contrast. It is hidden with the decorative intro below 760px. These are not concealed as passes or removed against the brief.

## Evidence and completion limits

Main screenshots show live issue content on the final export: `artifacts/browser/1440.png` and `390.png` (WebKit, optimized PNG evidence). The remaining named browser screenshots are updated, explicitly mocked regression states. Original production artwork is in `web/public/art/` and `dist/art/`; screenshot color quantization does not alter runtime artwork.

Local implementation, production build, typecheck, required assets, responsive checks and useful interactions are complete. **Public hosting/new-URL verification and a delivery commit remain pending the plane.** Real purchases/publication, a real authorized publisher session, physical wallets, screen readers and native-device behavior were intentionally not claimed. No requester input is missing, so no `.imd-blocked.json` was created.
