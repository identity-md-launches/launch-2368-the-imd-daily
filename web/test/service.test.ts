import { afterEach, describe, expect, it, vi } from "vitest";
import { resolveServiceOrigin, Service, verifyPublic } from "../src/lib/service";

afterEach(() => vi.unstubAllGlobals());

describe("upload service integration boundaries", () => {
  it("keeps a valid saved service origin ahead of the shipped default", async () => {
    vi.stubGlobal("localStorage", { getItem: () => "https://saved.example" });
    const fetch = vi.fn(); vi.stubGlobal("fetch", fetch);
    expect(await resolveServiceOrigin()).toBe("https://saved.example");
    expect(fetch).not.toHaveBeenCalled();
  });
  it("uses the shipped VPS for a new browser", async () => {
    vi.stubGlobal("localStorage", { getItem: () => null });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ apiOrigin: "https://the-imd-daily.duckdns.org" }))));
    expect(await resolveServiceOrigin()).toBe("https://the-imd-daily.duckdns.org");
  });
  it("requires the service to verify a signature before retaining a session token", async () => {
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: "Signature refused" }), { status: 401 }));
    vi.stubGlobal("fetch", fetch);
    const service = new Service("https://files.example");
    await expect(service.verify("unsigned test challenge", "invalid test signature")).rejects.toThrow("Signature refused");
    expect(service.token).toBe("");
  });
  it("rejects a public object whose bytes fail its committed hash", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("changed bytes", { headers: { "content-type": "application/pdf" } })));
    await expect(verifyPublic("https://files.example/edition.pdf", "expected", "application/pdf", async () => "different")).rejects.toThrow("SHA-256 commitment");
  });
});
