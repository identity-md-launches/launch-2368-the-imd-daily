import { SERVICE_STORAGE_KEY } from "../config";

/** Client for the publisher's upload service (server/ in this repository). */
export type UploadKind = "pdf" | "cover" | "metadata";
export type Uploaded = { sha256: `0x${string}`; url: string; size: number; existed: boolean };

export function normalizeOrigin(v: string): string | null {
  try {
    const u = new URL(v.trim());
    const local = u.hostname === "localhost" || u.hostname === "127.0.0.1";
    if (u.protocol !== "https:" && !(local && u.protocol === "http:")) return null;
    return u.origin;
  } catch { return null; }
}

/** The origin saved in this browser wins; otherwise use the existing VPS in ./service.json. */
export async function resolveServiceOrigin(): Promise<string | null> {
  const saved = localStorage.getItem(SERVICE_STORAGE_KEY);
  if (saved && normalizeOrigin(saved)) return normalizeOrigin(saved);
  try {
    const r = await fetch("./service.json", { cache: "no-store" });
    if (r.ok) {
      const j = (await r.json()) as { apiOrigin?: string };
      if (j.apiOrigin) return normalizeOrigin(j.apiOrigin);
    }
  } catch { /* no shipped configuration */ }
  return null;
}

export class Service {
  token = "";
  constructor(readonly origin: string) {}

  private async call<T>(path: string, init: RequestInit = {}): Promise<T> {
    const headers = new Headers(init.headers);
    if (this.token) headers.set("Authorization", `Bearer ${this.token}`);
    const r = await fetch(`${this.origin}${path}`, { ...init, headers, credentials: "omit" });
    const text = await r.text();
    let body: unknown = null;
    try { body = text ? JSON.parse(text) : null; } catch { body = { error: text.slice(0, 200) }; }
    if (!r.ok) throw new Error((body as { error?: string })?.error || `Service answered ${r.status}`);
    return body as T;
  }

  health() { return this.call<{ ok: boolean; version: string; publicFileOrigin: string }>("/health"); }

  challenge(address: string) {
    return this.call<{ message: string; expiresAt: number }>("/api/auth/challenge", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ address }),
    });
  }

  async verify(message: string, signature: string) {
    const r = await this.call<{ token: string; expiresAt: number }>("/api/auth/verify", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ message, signature }),
    });
    this.token = r.token;
    return r;
  }

  upload(kind: UploadKind, bytes: Uint8Array, sha256: string) {
    const type = kind === "pdf" ? "application/pdf" : kind === "cover" ? "image/png" : "application/json";
    return this.call<Uploaded>(`/api/objects/${kind}`, {
      method: "POST", headers: { "Content-Type": type, "X-Content-SHA256": sha256 }, body: bytes as BodyInit,
    });
  }

  saveDraft(d: { pdfHash: string; coverHash: string; metadataHash: string; title: string; editorialDate: string; summary: string; predictedId: string }) {
    return this.call<{ ok: true; summary: string }>("/api/drafts", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(d),
    });
  }

  markPublished(pdfHash: string, issueId: string, txHash: string) {
    return this.call<{ ok: true }>(`/api/drafts/${pdfHash}/published`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ issueId, txHash }),
    });
  }
}

/** Fetches a public URL as an anonymous reader would and checks its bytes and media type. */
export async function verifyPublic(url: string, expectedHash: string, expectedType: string, hash: (b: ArrayBuffer) => Promise<string>) {
  const r = await fetch(url, { credentials: "omit", cache: "no-store" });
  if (!r.ok) throw new Error(`${url} answered ${r.status}`);
  const type = (r.headers.get("content-type") ?? "").split(";")[0].trim();
  if (type !== expectedType) throw new Error(`${url} is served as ${type || "unknown"}, expected ${expectedType}`);
  const bytes = await r.arrayBuffer();
  const got = await hash(bytes);
  if (got.toLowerCase() !== expectedHash.toLowerCase()) throw new Error(`${url} does not match its SHA-256 commitment`);
  return bytes;
}
