import * as pdfjs from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";

// The worker ships in this export; PDF parsing never runs on the page's main thread.
pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

export type PDFDoc = pdfjs.PDFDocumentProxy;
export type PDFPage = pdfjs.PDFPageProxy;
export { pdfjs };

/**
 * Opens a PDF for reading. Remote files stream with HTTP range requests in 1 MiB chunks, so a
 * 50 MB scanned edition shows its first page before the whole file arrives. PDF JavaScript,
 * eval-based font compilation and form/annotation scripting are all off.
 */
export function openPdf(src: { url: string } | { data: Uint8Array }) {
  return pdfjs.getDocument({
    ...src,
    isEvalSupported: false,
    enableXfa: false,
    withCredentials: false,
    rangeChunkSize: 1 << 20,
    disableAutoFetch: true,
    stopAtErrors: false,
  });
}

/** Largest canvas we draw, in device pixels; iOS Safari refuses canvases above ~16.7M pixels. */
export const MAX_CANVAS_PIXELS = 14_000_000;

export function renderScale(pageWidthPt: number, pageHeightPt: number, cssWidth: number, dpr: number): number {
  let scale = (cssWidth / pageWidthPt) * dpr;
  const pixels = pageWidthPt * scale * pageHeightPt * scale;
  if (pixels > MAX_CANVAS_PIXELS) scale *= Math.sqrt(MAX_CANVAS_PIXELS / pixels);
  return scale;
}

/** First-page cover as PNG at the given pixel width, keeping the page's own aspect ratio and colours. */
export async function renderCover(data: Uint8Array, width = 1240): Promise<{ blob: Blob; width: number; height: number }> {
  const doc = await openPdf({ data: data.slice() }).promise;
  try {
    const page = await doc.getPage(1);
    const base = page.getViewport({ scale: 1 });
    const viewport = page.getViewport({ scale: width / base.width });
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(viewport.width);
    canvas.height = Math.round(viewport.height);
    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) throw new Error("This browser cannot draw the cover.");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvasContext: ctx, viewport }).promise;
    const blob = await new Promise<Blob>((res, rej) => canvas.toBlob((b) => (b ? res(b) : rej(new Error("Cover encoding failed."))), "image/png"));
    return { blob, width: canvas.width, height: canvas.height };
  } finally {
    await doc.destroy();
  }
}
