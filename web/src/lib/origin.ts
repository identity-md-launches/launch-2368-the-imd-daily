import { CANONICAL_ORIGIN, LEGACY_ORIGIN } from "../config";

type Loc = Pick<Location, "hostname" | "pathname" | "search" | "hash">;

/**
 * Where a visitor on the legacy address should go, keeping path, query and hash route, or null to stay.
 * The publisher desk stays on the legacy address: the upload service authorises origins one by one and
 * the new origin must be added there before a publisher can sign in from it.
 */
export function legacyRedirectTarget(loc: Loc): string | null {
  if (loc.hostname !== new URL(LEGACY_ORIGIN).hostname) return null;
  if (/^#\/?publisher(\/|$)/.test(loc.hash)) return null;
  if (new URLSearchParams(loc.search).has("stay")) return null;
  return `${CANONICAL_ORIGIN}${loc.pathname}${loc.search}${loc.hash}`;
}

/** The address search engines and shares should use for the page being viewed. */
export function canonicalFor(loc: Loc): string {
  const onCanonical = loc.hostname === new URL(CANONICAL_ORIGIN).hostname;
  return `${onCanonical ? CANONICAL_ORIGIN : LEGACY_ORIGIN}${loc.pathname}`;
}

/** The new host proves it serves this export by returning our 48×45 favicon over valid HTTPS. */
export const PROBE_SIZE = { width: 48, height: 45 } as const;

function probeCanonical(timeoutMs = 5000): Promise<boolean> {
  return new Promise((resolve) => {
    const img = new Image();
    const done = (ok: boolean) => { clearTimeout(t); img.onload = img.onerror = null; resolve(ok); };
    const t = setTimeout(() => done(false), timeoutMs);
    img.onload = () => done(img.naturalWidth === PROBE_SIZE.width && img.naturalHeight === PROBE_SIZE.height);
    img.onerror = () => done(false);
    img.src = `${CANONICAL_ORIGIN}/favicon.png?probe=${Date.now()}`;
  });
}

/** Runs once at start-up. Reading is never blocked: the page renders while the probe runs. */
export function startOriginTransition() {
  const link = document.querySelector<HTMLLinkElement>('link[rel="canonical"]');
  if (link) link.href = canonicalFor(location);
  if (!legacyRedirectTarget(location)) return;
  void probeCanonical().then((ok) => {
    const target = ok && legacyRedirectTarget(location);
    if (target) location.replace(target);
  });
}
