import { CHAIN_ID, DAILY } from "../config";
import { isoDate } from "./format";

/** Builds metadata exactly per docs/metadata.schema.json and returns the bytes that get hashed. */
export function buildMetadata(p: {
  issueId: bigint; title: string; editorialDate: bigint; pdfURL: string; coverURL: string; pdfHash: string; coverHash: string;
}): Uint8Array {
  const doc = {
    name: p.title,
    description: "A collectible copy of The IMD Daily. Ownership conveys no copyright or entitlement to financial returns.",
    image: p.coverURL,
    external_url: p.pdfURL,
    properties: {
      schema_version: 1,
      collection_name: "The IMD Daily",
      collection_symbol: "IMDDAILY",
      chain_id: CHAIN_ID,
      collection_address: DAILY,
      issue_id: p.issueId.toString(),
      editorial_date: isoDate(p.editorialDate),
      editorial_timestamp: p.editorialDate.toString(),
      pdf_url: p.pdfURL,
      hash_algorithm: "sha256",
      pdf_sha256: p.pdfHash,
      cover_sha256: p.coverHash,
    },
  };
  return new TextEncoder().encode(`${JSON.stringify(doc, null, 2)}\n`);
}

/** Cross-field checks from docs/INTEGRATION.md, applied to the fetched public bytes. */
export function checkMetadata(bytes: ArrayBuffer, e: { issueId: bigint; title: string; editorialDate: bigint; pdfURL: string; coverURL: string; pdfHash: string; coverHash: string }): string[] {
  const problems: string[] = [];
  let m: { name?: string; image?: string; external_url?: string; properties?: Record<string, unknown> };
  try { m = JSON.parse(new TextDecoder().decode(bytes)); } catch { return ["Metadata is not valid JSON."]; }
  const p = m.properties ?? {};
  if (m.name !== e.title) problems.push("name differs from the title");
  if (m.image !== e.coverURL) problems.push("image differs from the cover URL");
  if (m.external_url !== e.pdfURL || p.pdf_url !== e.pdfURL) problems.push("PDF URL differs");
  if (p.issue_id !== e.issueId.toString()) problems.push("issue_id is not the next issue number");
  if (String(p.collection_address).toLowerCase() !== DAILY.toLowerCase() || p.chain_id !== CHAIN_ID) problems.push("collection or chain differs");
  if (p.editorial_timestamp !== e.editorialDate.toString() || p.editorial_date !== isoDate(e.editorialDate)) problems.push("editorial date differs");
  if (p.pdf_sha256 !== e.pdfHash || p.cover_sha256 !== e.coverHash) problems.push("file hashes differ");
  return problems;
}
