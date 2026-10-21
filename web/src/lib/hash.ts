/** SHA-256 of exact bytes, as 0x + 64 hex digits (the contract's commitment format). */
export async function sha256Hex(data: ArrayBuffer | Uint8Array): Promise<`0x${string}`> {
  const buf = data instanceof Uint8Array ? data : new Uint8Array(data);
  const digest = await crypto.subtle.digest("SHA-256", buf as BufferSource);
  return `0x${[...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("")}`;
}
