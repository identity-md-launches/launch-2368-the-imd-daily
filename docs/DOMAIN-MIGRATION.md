# Moving The IMD Daily to https://daily.imd.fun

Status when this revision was built (2026-11-25): **daily.imd.fun is not connected.** The site keeps
working at https://the-imd-daily-free-to-read-colle.sites.imd.fun. Nothing below has been done by
this job; each step needs access this job does not have.

## What was observed

| Check | Result |
| --- | --- |
| `daily.imd.fun` A / AAAA / CNAME (via dns.google) | `NXDOMAIN`; the `imd.fun` zone is on Cloudflare (`etta.ns.cloudflare.com`) |
| Working address | `the-imd-daily-free-to-read-colle.sites.imd.fun` CNAME `csaydlku.up.railway.app`, HTTP 200, serves `ipfs://bafybeic7yuftlwuoaeco7mamgcfnd2uiz2ynqagozuaczp757vqx4z5gxq` (previous export) |
| Upload service CORS, `Origin: https://the-imd-daily-free-to-read-colle.sites.imd.fun` | allowed (`access-control-allow-origin` echoed) |
| Upload service CORS, `Origin: https://the-imd-daily.sites.imd.fun` | allowed |
| Upload service CORS, `Origin: https://daily.imd.fun` | **not allowed** (no `access-control-allow-origin`) |

## Remaining actions, in order

1. **DNS and host mapping (IMD administrator).** In the Cloudflare zone `imd.fun`, create
   `daily` pointing at the IMD sites gateway that serves the site name
   `the-imd-daily-free-to-read-colle.site.identitymd.eth` (today that gateway answers for the
   working address through the CNAME `csaydlku.up.railway.app`), and register `daily.imd.fun` as a
   custom domain for that same site in the gateway so it serves the same published version.
2. **HTTPS.** Let the gateway issue a certificate for `daily.imd.fun` and confirm
   `curl -I https://daily.imd.fun/` returns 200 with a valid certificate before announcing it.
3. **Upload service (publisher's VPS, `https://the-imd-daily.duckdns.org`).** In the server's `.env`
   add the new origin to the explicit list, keeping the working one, then restart:

   ```
   ALLOWED_ORIGINS=https://daily.imd.fun,https://the-imd-daily-free-to-read-colle.sites.imd.fun,https://the-imd-daily.sites.imd.fun
   ```

   `docker compose up -d` in `server/`. No wildcard: `/files/*` and `/api/summaries` are already
   public read-only, and sign-in and uploads stay limited to the listed origins and the publisher
   wallet. The sign-in message binds the requesting origin (`URI:` line), so no other wallet
   authentication setting needs to change. Verify with:

   ```
   curl -si -X OPTIONS -H 'Origin: https://daily.imd.fun' -H 'Access-Control-Request-Method: POST' \
     https://the-imd-daily.duckdns.org/api/auth/challenge | grep -i access-control-allow-origin
   ```

   Stored PDF, cover and metadata URLs live on chain and do not change.
4. **Redirect.** A server-side 301 from the old host to `https://daily.imd.fun` with path and query
   kept is the gateway's job, if it supports it. Without it, this export redirects by itself: on the
   old host it loads `https://daily.imd.fun/favicon.png` and, only if that returns this site's 48×45
   favicon over HTTPS, replaces the location with the same path, query and `#/` route on the new
   host. The publisher desk (`#/publisher`) and any URL with `?stay` are never redirected, so
   publishing keeps working on the old origin until step 3 is done.
5. **Static share metadata.** `web/index.html` keeps `canonical`, `og:url`, `og:image` and
   `twitter:image` on the working address so link previews never point at a host that does not
   resolve. At run time the canonical link becomes `https://daily.imd.fun/...` when the page is
   served there. After step 2 is verified, replace the working address with `https://daily.imd.fun`
   in those four tags and rebuild. There is no sitemap: routes are hash routes on one page.

Browser storage is per origin: visitors on the new address reconnect their wallet once, and the
publisher re-saves a custom upload-service origin only if one was saved on the old address.
