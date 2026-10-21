# The IMD Daily design system

## Overview

The IMD Daily is an independent community newspaper with free PDF reading and optional Ethereum collectibles. This revision builds on the accepted React/TypeScript/Vite application. Its visual identity is a late-night newsroom: original inked frog illustrations, a subdued futuristic city, warm white editorial type and quiet opaque dark surfaces. The real, unchanged issue cover is the central product.

The shared implementation is in `web/src/styles.css`. The homepage arrangement is in `web/src/pages/FrontPage.tsx`; other routes retain their reader, collection, publisher and vault behavior. Every issue, price, supply, timestamp, balance and saved summary comes from the existing integration.

## Colors

The application uses one dark theme, with role-based hex tokens in `styles.css:4`.

| Token | Value | Role |
| --- | --- | --- |
| `--color-frame` | `#070D10` | Page, reader, quiet intro and input background |
| `--color-paper` | `#0C161B` | Collector panel and wallet sheet |
| `--color-paper-deep` | `#11232A` | Hover and inset surfaces |
| `--color-ink` | `#F4F0E6` | Primary text |
| `--color-ink-soft` | `#A6B9BA` | Supporting text, dates and gas details |
| `--color-rule` | `#17444A` | Editorial rules and panel structure |
| `--color-rule-soft` | `#173238` | Internal separators |
| `--color-control-border` | `#52747A` | Distinguishable form/control boundaries |
| `--color-accent` / `--color-accent-hover` | `#8FE85D` / `#A9F27F` | Collecting action and open status |
| `--color-accent-ink` | `#0B1B0C` | Text on the green action |
| `--color-cyan` / `--color-focus` | `#47CDD5` | Reading action, links, press label and focus |
| `--color-ok` / `--color-err` | `#8FE85D` / `#FFABA3` | Written success/error states |

Browser-computed contrast pairs were measured: primary text/page 17.18:1; secondary text/page 9.56:1; cyan/page 10.21:1; primary text/panel 16.10:1; secondary text/panel 8.96:1; green-action text/fill 11.79:1. Decorative image contrast is not used to establish text contrast. Cream appears in original newspaper artwork, not as a page-wide background.

## Typography

Three locally bundled families have distinct roles:

- **UnifrakturCook 700**, with Georgia/serif fallback, is used only for the brand name in the masthead and footer.
- **Source Serif 4 400/600**, with Georgia/Times New Roman/serif fallback, supplies confident editorial headings and edition copy. The unchanged Fontsource dependency emits its WOFF2 and WOFF files.
- **IBM Plex Sans variable 400–600**, with Arial/sans-serif fallback, supplies UI, prose, form labels, prices and timers. Rendered UI uses 400 and 600. Its local WOFF2 and the blackletter font are in `web/public/fonts/`.

Font licenses ship in `web/public/fonts/licenses/`. All families use `font-display: swap`. Six semantic sizes are defined: 14px small, 16px body, 20px subheading, 28px section, 36px brand/price, and 48px lead. The brand becomes 28px below 760px and 20px below 360px. The lead becomes 36px at 1100–1280px and 28px in the tablet intro. Body line-height is 1.55; lead headings use 1.13 and section headings 1.2. Display tracking ranges from −0.02em to −0.035em. The explicitly requested cyan uppercase press label uses +0.035em.

Changing amounts and timestamps use `.num` with tabular lining digits. Headings balance where appropriate; prose wraps naturally and longer copy is limited to roughly 65–75 characters. Hashes and contract URLs wrap anywhere.

## Layout

The desktop frame has 32px outer gutters and a 1560px maximum content width. The masthead is at least 84px high, with emblem/wordmark at the leading edge, four central links, and a wallet control at the trailing edge. Vault and Publisher desk are in the footer.

The homepage lead uses 30/43/27 fractional columns after 28px gaps: editorial introduction and reporter, the real cover and reading/download actions, then one collector panel. The cover is at most 430px wide, keeps its source aspect ratio/colors, and has subtle stacked-paper edges. The introduction and every paragraph sit on quiet opaque surfaces. City scenery is a separate decorative layer.

A thin metadata strip shows the actual issue number, editorial date, reading access and window status. The archive lists real covers/dates, including the current issue when it is the only published edition. A saved editorial summary appears only when the service supplies one for the committed PDF hash.

Spacing uses 4/8/12/16/24/40px tokens, supplemented by 20/22/28/32/48px for the final editorial grid and panel insets.

- **1100–1280px:** tighter gaps, a smaller lead and collector stamp.
- **Below 1100px:** two lead columns; a compact introduction spans above them; navigation occupies its own header row.
- **Below 760px:** 16px gutters; scenery and introductory decoration are removed. The real cover and Read action come first, collecting second, then metadata/archive/summary. The cover is at most 294px wide. The archive becomes a touch-scrollable shelf with scroll snapping.
- **Below 360px:** the header hides the decorative emblem and uses a 20px brand; the cover is 250px wide.
- Existing issue/about/vault layouts collapse into one column below 760px. Hashes, publisher addresses and accounting tables wrap rather than clip.

Reflow was checked at 320, 390, 759, 900, 1100 and 1440px in Chromium and WebKit. At 390px the original cover and Read action fit on the first 844px screen. These are emulated viewport checks, not physical-device tests.

## Elevation & Depth

The city establishes atmosphere without glass panels. The single collector panel uses a thin teal structural border. Covers alone use paper edges and a restrained shadow. The mint action has a very faint green shadow with no border. The intro's opaque background and matching soft edge keep text away from scenery. Archive entries are flat and unboxed.

The wallet backdrop is opaque black at 69% and the dialog is a solid dark surface. It portals outside the inert app root at z-index 60. The full-window reader is at z-index 50 and publisher preview at 30. There are no repeating floating cards or animated neon effects.

## Shapes

Controls use 3px radii and 1px control borders. Panels remain rectangular. Only small status dots are circular. The small collector emblem has a dashed stamp edge and a static five-degree rotation. Do not carry that decorative treatment into form fields or data panels.

## Components

| Component/pattern | Source | Behavior |
| --- | --- | --- |
| Shared header and footer | `web/src/App.tsx` | Hash navigation, active section, home link, skip link, footer utilities |
| `Artwork` | `web/src/components/Artwork.tsx` | Local WebP with transparent PNG fallback; decorative by default; intrinsic sizes prevent distortion |
| Current edition/metadata/archive | `web/src/pages/FrontPage.tsx` | Real chain content, clickable cover, responsive shelf, search on archive route, truthful empty/loading/error states |
| `MintPanel` | `web/src/components/MintPanel.tsx` | Chain-derived price/window/supply, minus/input/plus, exact integer totals, optional recipient, balance/gas details, exact approval then mint, pending/error/receipt states |
| `ConnectSheet` | `web/src/wallet/ConnectSheet.tsx` | Optional trigger label, discovered EIP-6963 wallets, existing mobile links and Coinbase connector, network switch, inert background, focus trap, Escape/backdrop close and trigger restoration |
| `DownloadLink` | `web/src/components/DownloadLink.tsx` | Fetches original PDF bytes and saves a Blob, preserving a real link for modified clicks; pending state and retry/open fallback |
| `Reader` | `web/src/components/Reader.tsx` | Wide lazy PDF pages, page controls, keyboard controls, zoom/pinch, download, fullscreen/window fallback; quiet background with no city layer |
| Controls | `styles.css`: `.btn`, `.btn-primary`, `.btn-read`, `.field`, `.quantity-stepper` | Distinct rest/hover/pressed/focus/disabled states; primary actions at least 44px; native form semantics |
| Publisher/Vault | `web/src/pages/Publisher.tsx`, `VaultPage.tsx` | Existing authorization, upload verification, preparation/recovery and reviewed withdrawal flows retained |

When collecting expires, controls disappear and the panel says Closed; reading and downloads remain. There is no supply cap, sellout indicator, rarity claim or invented minted count. ETH is gas only. No transaction is automatic.

Focus uses a 2px cyan outline offset by 4px, with a system Highlight outline under forced colors. Wallet rows are at least 52px. Mobile dialogs become bottom sheets with safe-area padding. Motion is restricted to 120ms control color transitions when reduced motion is not requested; reduced motion disables all transitions and animations.

## Do's and Don'ts

Use the existing hash routes, opaque dark tokens, serif hierarchy, native controls and `DownloadLink` when extending a page. Choose cyan for reading/navigation and lime for collecting. Keep contract data live and document test fixtures as fixtures.

To add a route, use the existing App route switch, a semantic section heading and the `page-narrow` or `columns` layout, then reuse existing fields/buttons and error/status patterns. Keep critical addresses and hashes fully available.

Do not replace uploaded cover/PDF artwork, fabricate historical editions or headlines, put paragraphs over the scenery, add token economics, flatten the website into an image, introduce glass or rounded-card grids, or use blackletter for ordinary text.

## Design guidance attribution

Design review used Jakub Krehel’s Better Interface (MIT), pinned commit `267330e1adfc66a718fb65fa6918c1f06d0a689e`. Documentation follows Paul Bakaus’s Impeccable document method (Apache-2.0), pinned commit `9d715cc4f5564a990ca8345abfdd5df6dc9b41c8`. Their notices and licenses are retained in [docs/DESIGN-GUIDANCE-LICENSE.txt](docs/DESIGN-GUIDANCE-LICENSE.txt). Review findings and unperformed checks belong in [artifacts/validation.md](artifacts/validation.md), not in the design tokens.
