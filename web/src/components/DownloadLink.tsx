import { useState, type MouseEvent, type ReactNode } from "react";

/** Cross-origin download attributes are ignored by browsers; save the original bytes via a blob. */
export function DownloadLink({ url, filename, className = "btn", children }: {
  url: string; filename: string; className?: string; children: ReactNode;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  async function download(e: MouseEvent<HTMLAnchorElement>) {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
    e.preventDefault();
    if (busy) return;
    setBusy(true); setError(false);
    try {
      const response = await fetch(url, { credentials: "omit" });
      if (!response.ok) throw new Error("Download unavailable");
      const objectURL = URL.createObjectURL(await response.blob());
      const link = document.createElement("a");
      link.href = objectURL; link.download = filename;
      document.body.append(link); link.click(); link.remove();
      setTimeout(() => URL.revokeObjectURL(objectURL), 60_000);
    } catch { setError(true); }
    finally { setBusy(false); }
  }
  return <>
    <a className={className} href={url} target="_blank" rel="noopener" download={filename}
      aria-busy={busy} aria-disabled={busy || undefined} onClick={download}>{busy ? "Downloading…" : children}</a>
    {error && <span className="download-error err" role="alert">Download failed. Try again or <a href={url} target="_blank" rel="noopener">open the PDF</a>.</span>}
  </>;
}
