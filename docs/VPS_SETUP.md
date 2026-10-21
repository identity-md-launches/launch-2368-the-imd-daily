# Upload service on your VPS

`server/` is the PDF upload and file service for the publisher desk. **It is not deployed by this job**: the static site is delivered; this service runs only once you install it on your own server. Until then the public site works normally and the publisher desk shows "Publishing is not set up yet".

## What it does

- `GET /health`: liveness and writable storage.
- `POST /api/auth/challenge`, `POST /api/auth/verify`: sign-in. The server issues a single-use nonce bound to the requesting site origin, chain 1 and a 5-minute expiry, then verifies the signed message server-side and accepts only `0x48E4E74fE1d0c14404cEB57B9fec5b21329C6ec9`. Sessions last 2 hours. Replayed, altered, expired or foreign-origin challenges are refused.
- `POST /api/objects/{pdf|cover|metadata}`: publisher session and allowed origin required on every call. Checks media type and magic bytes (`%PDF-`, PNG signature, JSON), the size limit (`MAX_PDF_MB`, default 200) and that `X-Content-SHA256` equals the server's own SHA-256 of the bytes. Stores at `objects/<sha256>.<ext>`, read-only, never overwritten, no delete endpoint.
- `GET /files/<sha256>.<ext>`: public, CORS `*`, `Accept-Ranges` with `206` partial content (PDF.js streams large PDFs), `Cache-Control: immutable`, `nosniff`, `Content-Security-Policy: sandbox`. Only names of exactly 64 hex characters plus a known extension are served, so path traversal is impossible.
- `POST /api/drafts`, `POST /api/drafts/<pdfHash>/published`, `GET /api/summaries`: summaries are stored as sanitized plain text keyed by PDF hash and become public only after the publication is confirmed on chain. Saving a draft never touches the chain.
- Rate limits: 20 sign-in requests and 30 uploads per IP per minute.

The server holds no private key and needs no secret.

## Install (Ubuntu or Debian VPS)

1. Get a free hostname. Example with DuckDNS: sign in at duckdns.org, create `yourname-imd-daily`, and point it at the VPS's public IPv4. Any DNS name you control works; keep it for good, because published file URLs are written on chain.
2. Open ports 80 and 443 (`sudo ufw allow 80,443/tcp`).
3. Install Docker: `curl -fsSL https://get.docker.com | sh`.
4. Copy the `server/` folder to the VPS, for example `scp -r server you@vps:~/imd-daily`.
5. `cd ~/imd-daily && cp env.example .env`, then set:
   - `FILES_DOMAIN=yourname-imd-daily.duckdns.org`
   - `PUBLIC_FILE_ORIGIN=https://yourname-imd-daily.duckdns.org`
   - `ALLOWED_ORIGINS=` the exact origin of the IMD site URL (for example `https://the-imd-daily.<imd host>`), comma-separated if more than one.
6. `docker compose up -d --build`. Caddy obtains a Let's Encrypt certificate for `FILES_DOMAIN` automatically.
7. Check: `curl https://yourname-imd-daily.duckdns.org/health` returns `{"ok":true,...}`.
8. On the site, open Publisher desk, enter `https://yourname-imd-daily.duckdns.org` under "Service origin for this browser" and save. No rebuild is needed. (To make it the default for every browser, set `apiOrigin` in `dist/service.json` at the next site release.)

## Daily publishing

Publisher desk → connect the publisher wallet → sign in (free signature) → choose PDF, title, date, summary → "Upload and verify files" (uploads PDF, cover rendered from page 1, and metadata; refetches all three public URLs anonymously and matches SHA-256) → preview → tick the confirmation → "Publish No. N on Ethereum". Only that last step sends `createIssue` and starts the 24-hour window. A reload during publication is recovered from this browser's record and the chain; a PDF already on chain is refused.

## Backups and restore

- `./backup.sh` writes `backups/imd-daily-<UTC>.tar.gz` with `objects/` and `drafts.json`. Copy it off the server (for example `rsync` to another machine) on a schedule, e.g. a daily cron entry `0 3 * * * cd ~/imd-daily && ./backup.sh`.
- `./restore.sh backups/<file>.tar.gz` unpacks into the data volume without overwriting existing objects and re-verifies every object's SHA-256 against its file name.

## Migration

Install on the new server, restore the latest backup, then move the DNS record of the same `FILES_DOMAIN` to the new IP. File paths and bytes stay identical, so every on-chain URL and hash keeps working. Never change `PUBLIC_FILE_ORIGIN` for already published issues.

## Local test without production credentials

```sh
cd server && npm ci && npm test
```

The tests generate throwaway wallets in memory, run the service on a random local port and cover sign-in, replay, foreign origin, wrong signer, unauthorised and oversized uploads, hash mismatch, byte ranges, path traversal and summary sanitising.
