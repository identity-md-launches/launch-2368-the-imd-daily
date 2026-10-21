# Revision validation

This revision fixes the eight reproduced findings against accepted source commit `a5bf9db5921da5c24110791489b3326ca3116de5`. It retains the newspaper design, deployed contracts, ABIs, addresses, wallet connectors, dependencies and build configuration. The source changes are limited to reader geometry/navigation, vault presentation, initial chain-read errors, publisher preparation/recovery, and the two VPS scripts/configuration reported by the reviewer.

## Results

| Check | Actual result | Evidence |
| --- | --- | --- |
| Production build (`npm run build`, including `tsc --noEmit`) | Exit 0; 17 exported files, bundled worker and relative assets | [build.txt](checks/build.txt), [export-integrity.json](checks/export-integrity.json) |
| Separate `npm run typecheck` | Exit 0 | [typecheck.txt](checks/typecheck.txt) |
| Frontend `npm test` | 12/12 passed: integer arithmetic, exact expiry/deadline, closure latch, dates, search, metadata and paginated index recovery | [web-tests.txt](checks/web-tests.txt) |
| Service `npm test`, with BusyBox tar selected for restore tests | 14/14 passed: existing nine service tests plus five restore regressions | [server-tests.txt](checks/server-tests.txt), [restore-busybox.txt](checks/restore-busybox.txt) |
| `npm run check:abi` | Both canonical hashes match the deployment handoff | [abi-check.txt](checks/abi-check.txt) |
| Official Caddy 2.10.2 `validate` | Exit 0 on the actual `server/Caddyfile`; `adapt` also retained upload limit and upstream | [caddy-validate.txt](checks/caddy-validate.txt) |
| Production-export browser regressions | Passed in Chromium at 320/390/1440px, served under `/preview/`; no page runtime errors | [browser-results.json](checks/browser-results.json), [test source](../web/scripts/validate-revision.mjs) |
| Pinned taste probe, offline | All 16 checks passed at 320/390/1440px, including render, layout, targets, contrast and share metadata | [taste.json](checks/taste.json) |
| Shell/JavaScript syntax and whitespace | `sh -n server/restore.sh`, `node --check web/scripts/validate-revision.mjs`, `git diff --check`: exit 0 | Re-run directly from repository root |

Dependencies were installed in a temporary mirror with the existing manifests/lockfiles. The final application source and ABIs were copied unchanged into that mirror for the build and checks; its `dist/` was copied back byte for byte. The export hashes match the tested build. No dependency directories, package caches, binary tools, browser downloads or fixture PDFs are part of the submission.

The browser regression command was `IMD_PLAYWRIGHT=<external Playwright module> PLAYWRIGHT_BROWSERS_PATH=<external browsers> node web/scripts/validate-revision.mjs`. README gives repeatable installation commands. The probe command was `IMD_PLAYWRIGHT=<external Playwright module> PLAYWRIGHT_BROWSERS_PATH=<external browsers> node .imd/reads/skills/design-critic/scripts/taste.mjs --out test/scratch/taste --offline`.

## Reproduction, fixes and rechecks

Full finding IDs and answers are in [`.imd-responses.json`](../.imd-responses.json). The original public failures are recorded in [reproduced-public.json](checks/reproduced-public.json); publisher failures are in [reproduced-publisher.txt](checks/reproduced-publisher.txt).

| Finding | Source and reproduced behavior | Correction and final check |
| --- | --- | --- |
| `34cc7a33` high: unreachable PDF edge | `web/src/styles.css:194`: at 200%, A3 pages began at −171px on 390px and −280px on 1440px, with `scrollLeft=0` | Start alignment plus per-page auto inline margins. Left edge is now 12px at both widths; right panning reaches 378/1428px, retaining 12px padding. [Mobile screenshot](browser/chromium-reader-390.png). |
| `cfa7c3fd` high: vault overflow | `web/src/pages/VaultPage.tsx:44`: three-column table was 437px and document width 457px at both mobile widths | Removed implementation names, kept public labels/amounts, allowed cell wrapping. Also wrapped the full publisher-address link which remained 14px too wide at 320px after the table fix. Final document widths 320/390px; tables 280/349.53px. [320px screenshot](browser/chromium-vault-320.png). |
| `73a309e5` high: invalid Caddy config | `server/Caddyfile:3`: official 2.10.2 rejected `not` as a response matcher in `encode` | Removed encoding. Actual config validates; immutable file/range responses remain unchanged. VPS guide adds exact validation before startup. |
| `868508a3` high: false restore success | `server/restore.sh:6`: BusyBox 1.37 rejected `--skip-old-files`; the trailing echo masked failure | Supported `-k`, `set -eu` inside the container, nonzero hash mismatch and success only after every hash check. Five tests passed using actual BusyBox tar through a local Docker-command shim. Existing files are preserved and their extraction refusal is nonzero. Guide specifies an empty restore volume and failure handling. |
| `7ae68a17` medium: RPC failure described as absence | `web/src/pages/IssuePage.tsx:11`, `web/src/pages/ReadPage.tsx:11`: both 503 RPC fixtures produced “No issue 1 on chain” | Error branch precedes absence inference; announced error and Retry. Restoring RPC fixture responses and clicking Retry opens the issue and reader. |
| `5ca92f94` medium: Next stalls at zoom | `web/src/components/Reader.tsx:56`: three Next clicks at 200% left the page field at 1 after the first scroll | Direct navigation state, vertical-only scrolling and nearest-page-top tracking. Next reaches 2,3,4 at 200% and fit width on mobile/desktop, and 50% on mobile. Previous, direct entry, manual scrolling and Space-key activation passed. [Visible keyboard focus](browser/reader-keyboard-focus.png). |
| `7e70bf2a` medium: stale prepared metadata | `web/src/pages/Publisher.tsx:195`, `:306`, `:332`: displayed B but decoded transaction and saved summary remained A | Each PDF/title/date/summary edit clears preparation and confirmation. Async preparation/publication locks fields. Final confirmation displays exact prepared title/date/summary. Independent title/date/summary edits each required preparation again; final decoded fixture request matched title B, 2026-10-20 and summary B. [Confirmation](browser/publisher-confirmation.png). |
| `64b8174e` medium: lost summary finalization | `web/src/pages/Publisher.tsx:105`, `:257`: recovery cleared storage before authentication; zero summary-update calls | Durable confirmed id/hash/service origin, authenticated finalization shared by normal and recovered publication, visible retry, no premature record removal. Passed indexed-issue, receipt-only and missing-hash recovery; service failures across reload; retry and summary search. The normal confirmation/reload test submitted one local fixture transaction. [Failure and retry state](browser/publisher-recovery-failure.png). |

## Meaningful interaction coverage

- **Reader:** four A3 pages, 200% and fit navigation at 390×844 and 1440×844, both horizontal edges, manual vertical scrolling, Previous, page-field Enter and Next by Space. At 50%, explicit navigation still reaches the final short page. Synthetic two-touch events changed zoom to 150% and retained the left edge; this is not a physical pinch test.
- **Large raster PDF:** generated only during testing, 52,921,453 bytes, four A3 portrait pages. Two HTTP byte-range requests were observed. At 200%, navigation reached pages 2/3/4, the sampled source red edge remained `[255,0,0,255]`, and the downloaded file had the complete original byte length. [Reader screenshot](browser/large-raster-reader.png). The generated PDF is not committed or presented as news.
- **Vault:** collected 0.3, withdrawn 0.1, balance 10,000 IMD local read-only fixtures; table, donation amount and full recipient remained readable at 320/390px with no document overflow.
- **Archive:** an empty chain displays its existing honest empty state; About navigation works. A recovered summary becomes searchable after the service acknowledges publication. [Empty first screen at 390px](browser/front-empty-390.png).
- **Publisher:** mock EIP-6963/browser wallet, challenge API and read-only RPC; PDF preparation hashes and refetches the actual locally generated PDF, cover and metadata. Changed data invalidates preparation. Decoded simulation/wallet requests use the actual ABI. A rejected request sends nothing; a successful fixture request confirms locally. Summary-service errors remain visible and recover after reload/authentication/retry without a second submission.
- **Server:** existing challenge/signature, wrong-origin/signer, replay, unauthorized and oversized upload, hash mismatch, ranges, traversal and summary sanitizing tests still pass. Restore tests execute the exact script's container command with filesystem paths mapped to temporary directories; the BusyBox tar executable is real, the Docker shim is a test fixture.

All browser chain data and confirmations are explicitly local fixtures. External requests are blocked by the harness. No real wallet signed, no funds moved, and no real issue was uploaded or published.

## Better Interface review

Reviewed the pinned workflow and core principles in all six domains while preserving the accepted newspaper system. This revision keeps the source's black/ivory frame, serif hierarchy, burgundy primary action, six-size scale, square controls and compact newspaper columns. Changes to the final component behavior are documented in root [DESIGN.md](../DESIGN.md).

| Domain | Coverage and applicable result | Limits |
| --- | --- | --- |
| Accessibility | Checked affected native buttons/inputs, names, labels, error announcements and disabled states. Enter/Space reader actions passed; the focused Next button has a visible light outline on the dark toolbar. Retry is keyboard-operable through native buttons. | No screen reader or physical-device session; no claim of full accessibility conformance. |
| Layout | Checked actual production export at 320/390/1440px, reader scroll geometry, mobile table/address reflow, publisher confirmation at 1440px and recovery at 390px. Fixed the reproduced geometry causes; preserved established grids and breaks. Product/empty-state action is visible on the 390px first screen. | No exhaustive route/viewport matrix or browser-native 200% page zoom. PDF 200% reading zoom was tested separately. |
| Writing | Checked unknown/error/empty distinction, recovery instructions, confirmation data and action labels. RPC failures no longer assert absence; summary errors distinguish confirmed publication from pending service work. | No unrelated copy rewrite. |
| Typography | Checked unchanged semantic size tokens, bundled display/body faces, tabular numbers and complete wrapping of monetary values/address. No critical value is clipped or ellipsized by these fixes. | No manual font-fallback or text-resize matrix. |
| Colors | No palette changes. Pinned probe passed computed solid-background contrast at all three widths. Status words supplement color; reader retains original PDF colors in sampled fixture pixels. | No individual contrast ratios or image-wide color fidelity claim; no physical display measurement. |
| UI | Checked existing button/form states, in-flight field locking, prepared confirmation invalidation, error/retry, recovered success and lazy PDF rendering. No new visual system or animated treatment. | No slow-motion animation-panel review; existing short color transitions are unchanged and the reduced-motion probe passed. |

All 16 taste checks passed. Screenshots beginning `390`, `320` or `1440` under `browser/` come from that probe; named fixture screenshots come from the regression harness. Every fixture screenshot is validation evidence, not a published newspaper edition.

## Delivery and remaining limits

Complete for the eight reported defects under the local validation above. **WebKit was attempted but could not launch** because required host libraries were missing; it is recorded as skipped, not passed. Chromium runtime checks completed without page errors. No physical iPhone/Android test or browser-native pinch was performed.

Docker is unavailable in this environment, so full Docker Compose startup, live DNS, TLS issuance and VPS deployment were not exercised. The actual Caddy configuration validates with official Caddy 2.10.2, and the exact restore shell command passes the stated BusyBox tests. Those results do not claim that a backend was deployed. The publisher must install/configure the service as described in [VPS_SETUP.md](../docs/VPS_SETUP.md).

The static export is delivered alongside its source. IMD still assigns/publishes the HTTPS URL and the submission commit; neither has been invented here. No UNLOCK site, contract, build/dependency file or protected directory was changed. Existing cache exclusions remain; root `.gitignore` adds exact-path exceptions for the required response/evidence files because repository-local exclusions otherwise hide them. Its explicit path budgets are: response JSON 16 KiB, validation Markdown 32 KiB, enumerated check reports combined 128 KiB, and enumerated screenshots combined 1 MiB. No directory-wide allowlist admits generated dependencies or caches. The complete prospective submission is checked against 8 MiB in [submission-budget.json](checks/submission-budget.json).

Design guidance attribution: Jakub Krehel, Better Interface, MIT, pinned commit `267330e1adfc66a718fb65fa6918c1f06d0a689e`; documentation method: Paul Bakaus, Impeccable, Apache-2.0, pinned commit `9d715cc4f5564a990ca8345abfdd5df6dc9b41c8`. The guides were used as design references, not copied into the product.
