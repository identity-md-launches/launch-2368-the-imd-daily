import { describe, expect, it } from "vitest";
import { canonicalFor, legacyRedirectTarget } from "../src/lib/origin";
import { CANONICAL_ORIGIN, LEGACY_ORIGIN, SUBSCRIBE_URL } from "../src/config";

const at = (href: string) => { const u = new URL(href); return { hostname: u.hostname, pathname: u.pathname, search: u.search, hash: u.hash }; };

describe("domain transition", () => {
  it("keeps the exact requested addresses", () => {
    expect(CANONICAL_ORIGIN).toBe("https://daily.imd.fun");
    expect(LEGACY_ORIGIN).toBe("https://the-imd-daily-free-to-read-colle.sites.imd.fun");
    expect(SUBSCRIBE_URL).toBe("https://paper-route.imd.site/");
  });
  it("maps legacy paths, queries and hash routes to the new origin", () => {
    expect(legacyRedirectTarget(at(`${LEGACY_ORIGIN}/`))).toBe("https://daily.imd.fun/");
    expect(legacyRedirectTarget(at(`${LEGACY_ORIGIN}/?ref=x#/read/1`))).toBe("https://daily.imd.fun/?ref=x#/read/1");
    expect(legacyRedirectTarget(at(`${LEGACY_ORIGIN}/index.html#/issue/1`))).toBe("https://daily.imd.fun/index.html#/issue/1");
    expect(legacyRedirectTarget(at(`${LEGACY_ORIGIN}/#/archive`))).toBe("https://daily.imd.fun/#/archive");
  });
  it("never redirects elsewhere, the publisher desk, or an explicit stay", () => {
    expect(legacyRedirectTarget(at("https://daily.imd.fun/#/read/1"))).toBeNull();
    expect(legacyRedirectTarget(at("https://gateway.example/ipfs/cid/#/"))).toBeNull();
    expect(legacyRedirectTarget(at(`${LEGACY_ORIGIN}/#/publisher`))).toBeNull();
    expect(legacyRedirectTarget(at(`${LEGACY_ORIGIN}/?stay=1#/read/1`))).toBeNull();
    expect(legacyRedirectTarget(at(`${LEGACY_ORIGIN}/#/publishers-guide`))).not.toBeNull();
  });
  it("names the canonical page for the host in use", () => {
    expect(canonicalFor(at("https://daily.imd.fun/"))).toBe("https://daily.imd.fun/");
    expect(canonicalFor(at(`${LEGACY_ORIGIN}/`))).toBe(`${LEGACY_ORIGIN}/`);
    expect(canonicalFor(at("https://gateway.example/ipfs/cid/"))).toBe(`${LEGACY_ORIGIN}/ipfs/cid/`);
  });
});
