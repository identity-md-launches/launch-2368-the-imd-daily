# Original artwork

The three production illustrations were generated with the built-in imagegen tool for this revision. No existing PDF or uploaded cover was edited. The optimized source assets are bundled in `web/public/art/` and copied unchanged to `dist/art/` by the build. The generated full-resolution originals were inspected before optimization; the deliverable retains finished production assets rather than oversized intermediate PNGs.

| Illustration | Source files | Usage |
| --- | --- | --- |
| Midnight newsroom and city | `newsroom.webp`, `newsroom.jpg` | Desktop/tablet lead backdrop and social image |
| Frog journalist, newspaper and IMD mug | `reporter.webp`, `reporter.png` | Desktop lead and truthful empty state |
| Frog reading emblem | `emblem.webp`, `emblem.png` | Masthead, collector stamp and derived favicon |

WebP is preferred, with JPEG or transparent PNG fallbacks. The reporter is 800×714; the emblem is 160×149; the backdrop is 1536×1024. Transparency is retained in the character assets. PNG fallback optimization uses a 256-color alpha palette; the preferred WebP preserves the full illustration color. No hotlinks, generated news copy, fake issue cover or rasterized website are used.

The following are the final prompts. Mode: **built-in imagegen**, one generation per original asset.

## Backdrop

```text
Use case: illustration-story
Asset type: finished wide website backdrop, 1536 by 1024 landscape.
Primary request: A late-night independent newspaper newsroom overlooking a futuristic rainy city. Sophisticated illustrated cyberpunk newsprint, hand-inked editorial graphic novel with delicate crosshatching and subtle grain, production quality.
Scene: broad newsroom windows, layered distant towers, quiet desks and a few papers along the lower edge. No people or frogs in this backdrop. Architectural detail stays near sides and edges with a quiet very dark center.
Lighting: subdued midnight, restrained teal window light, subtle muted cyan reflections. Predominantly ink navy #070D10 and dark teal #17444A. No bright neon signs. No text.
Composition: wide panoramic scene intended behind a website, atmospheric but understated, city skyline across the upper half, low contrast. No website UI, no panels or controls. No logos, no watermark.
```

## Reporter

```text
Use case: illustration-story
Asset type: transparent cutout character illustration for The IMD Daily website.
Primary request: A charismatic green frog newspaper reporter at a small dark newsroom desk, reading an open cream newspaper, with an IMD coffee mug.
Subject: expressive friendly clever green frog with warm pale green eyes and subtle smile, wearing a black baseball cap with exactly "IMD" in cream small letters, dark casual jacket. The frog holds an open newspaper naturally at chest level, glancing over its top toward the reader. The mug on the right of the dark desk has exactly "IMD" in cream. A pencil and one loose paper at the desk, no other clutter.
Style: sophisticated hand-inked graphic novel editorial illustration, fine crosshatching, subtle screenprint texture, deep black ink outlines, rich but restrained moss and lime greens, cream paper, tiny cyan rim light. Beautiful finished character artwork, mature independent newsroom identity, not childish or 3D.
Composition: waist-up front three-quarter view, frog head near upper center, whole newspaper, mug and desk top visible. Compact broad silhouette with a clean transparent alpha background. Dark desk front fades to the transparent boundary. Leave a little breathing room around the cap. No setting, no rectangular background, no shadow outside character, no poster, no website UI.
Newspaper: fine abstract editorial columns, no invented legible headlines or news content. No watermark.
```

## Emblem

```text
Use case: logo-brand
Asset type: small transparent masthead emblem for The IMD Daily, matching a sophisticated hand-inked cyberpunk newspaper illustration.
Primary request: A compact charming green frog reporter reading a folded cream newspaper, wearing a black cap with tiny cream "IMD" letters.
Style: engraved editorial pen-and-ink, rich moss green and restrained lime highlights, dark navy shadows, warm cream paper, clean strong silhouette. Mature and charismatic, same identity as a newsroom reporter, not a flat geometric icon and not a childish cartoon.
Composition: head and hands above a small open newspaper, three-quarter front view, no desk, no mug, no setting. Cropped close with the entire cap and newspaper visible. Readable silhouette at 48 pixels. Genuine transparent background. No outer badge, no rectangle, no circular background, no watermark. No legible news headlines on the paper.
```

## Fonts

UnifrakturCook 700 and IBM Plex Sans variable 400–600 are bundled locally as WOFF2. Source Serif 4 400/600 is supplied by the unchanged existing frontend dependency and bundled by Vite. Their OFL licenses are in `web/public/fonts/licenses/` and the export. Font binaries came from the corresponding Fontsource packages; licenses came from Google Fonts and the existing package. No new dependency is needed to reproduce the site.
