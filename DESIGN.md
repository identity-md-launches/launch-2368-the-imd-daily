# The IMD Daily: design system

## Overview

A daily newspaper read on screen. A black outer frame holds a warm ivory sheet; an oversized serif nameplate, a compact date/edition line and thin ink rules carry the identity. The latest front page dominates the first screen, the archive reads as a stack of print editions, and collecting sits below reading. Flat throughout: no gradients, glows, shadows or rounded cards. Source: `web/src/styles.css`.

## Colors (`:root` in web/src/styles.css)

| Token | Value | Use |
| --- | --- | --- |
| `--color-frame` | `#111111` | Outer frame, reader background |
| `--color-paper` | `#f6f1e4` | Reading surface; text colour in the reader bar |
| `--color-paper-deep` | `#ece4d0` | Hover fill, setup notes, empty cover |
| `--color-ink` | `#1a1714` | Body text, borders, focus ring |
| `--color-ink-soft` | `#4a433b` | Datelines, fine print |
| `--color-rule` / `--color-rule-soft` | `#1a1714` / `#b9ad94` | Section rules / row dividers |
| `--color-accent` | `#7a1f2b` | Burgundy: primary buttons, current nav item, "Open" state |
| `--color-ok` / `--color-err` | `#2f5a2a` / `#8f1d1d` | Confirmed / failed states (always with words) |

Contrast was checked by the taste probe (pass at 320, 390, 1440); no individual ratios are claimed here.

## Typography

- Display: `Playfair Display` 900 (`@fontsource/playfair-display`, bundled), fallback Georgia. Nameplate, lead and section heads.
- Text: `Source Serif 4` 400 and 600 (`@fontsource/source-serif-4`, bundled), fallback Georgia.
- Six sizes only: `--fs-mast` clamp(2.75rem, 11vw, 7.5rem); `--fs-lead` clamp(1.75rem, 4.2vw, 3rem); `--fs-section` 1.5rem; `--fs-sub` 1.25rem; `--fs-body` 1.0625rem; `--fs-small` 0.875rem.
- Numbers use `.num` (tabular lining figures). Headings `text-wrap: balance`, paragraphs `pretty`. Sentence case; no tracked capitals.

## Layout

- Spacing scale `--space-1..6` = 4, 8, 12, 16, 24, 40 px. Frame `clamp(6px, 1.6vw, 20px)`; paper max width 1280px.
- Masthead: topline (date left, Connect right), nameplate between a 3px top rule and a double bottom rule, centred section nav.
- `.lead`: asymmetric 1.55fr / 1fr columns, cover left, text column with a left rule. Below 860px it stacks (cover first).
- `.columns`: 2fr / 1fr body and side rail (About, Vault); About's body flows in CSS columns with a column rule.
- `.stack-row`: archive row with a 120px (84px under 640px) cover whose double right/bottom border reads as stacked paper.
- Under 640px: nav spreads edge to edge, the edition line drops its centre item, the connect sheet becomes a bottom sheet, the empty-state cover collapses to a 96px band so the message stays on the first screen.

## Elevation & depth

None. Depth is drawn with rules (1px, 3px, double). Overlays (connect sheet, preview) sit on a flat 55% black backdrop.

## Shapes

Square corners everywhere (`border-radius: 0`). Dashed border only for the not-yet-published cover.

## Components

- `.btn` / `.btn-primary` / `.btn-quiet` (styles.css): 44px minimum height; primary is burgundy. Rest, hover, active, disabled and `:focus-visible` (2px ink ring, 2px offset) states.
- `ConnectSheet` (`web/src/wallet/ConnectSheet.tsx`): one Connect control; EIP-6963 wallets, Coinbase Wallet; on phones "Open in" rows; 48px rows; closes by ×, backdrop or Escape, focus returns to the opener. Wrong network shows "Switch to Ethereum".
- `MintPanel` (`web/src/components/MintPanel.tsx`): status line (Open + countdown / Closed), quantity, IMD total, gas in ETH, exact approval then mint, live status region with Etherscan links.
- `Reader` (`web/src/components/Reader.tsx`): dark toolbar (close, page field, prev/next, zoom, fit, full screen, download) over vertically stacked lazily rendered pages.
- `.record` definition list for hashes and contract facts; `.figures` table for vault accounting; `Stale` status line.

## Do's and don'ts

- Do start new pages inside `<main>` with an `.h-section` heading, then `.columns` or `.page-narrow`.
- Do use the burgundy accent for one primary action per view and for live state only.
- Don't add shadows, gradients, rounded cards, emoji or a seventh font size.
- Don't show numbers that are not read from the contract.
- Recipe: add a hash route in `web/src/App.tsx`, a page in `web/src/pages/`, reuse `.btn`, `.field`, `.record` and the type tokens.
