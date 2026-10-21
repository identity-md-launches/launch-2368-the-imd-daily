import { useCallback, useEffect, useRef, useState } from "react";
import { openPdf, pdfjs, renderScale, type PDFDoc } from "../lib/pdf";

type Props = {
  source: { url: string } | { data: Uint8Array };
  title: string;
  downloadUrl?: string;
  downloadName?: string;
  onClose?: () => void;
};

const ZOOMS = [0.5, 0.75, 1, 1.25, 1.5, 2, 3];
const clampZoom = (z: number) => Math.min(4, Math.max(0.4, z));

/** Full-page vertical reader. Pages render only near the viewport and are released when far away. */
export function Reader({ source, title, downloadUrl, downloadName, onClose }: Props) {
  const [doc, setDoc] = useState<PDFDoc | null>(null);
  const [sizes, setSizes] = useState<{ w: number; h: number }[]>([]);
  const [error, setError] = useState("");
  const [loaded, setLoaded] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [page, setPage] = useState(1);
  const [pageInput, setPageInput] = useState("1");
  const [full, setFull] = useState(false);
  const [fitWidth, setFitWidth] = useState(800);
  const shell = useRef<HTMLDivElement>(null);
  const scroller = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    setDoc(null); setError(""); setSizes([]);
    const task = openPdf("data" in source ? { data: source.data.slice() } : source);
    task.onProgress = (p: { loaded: number }) => setLoaded(p.loaded);
    task.promise.then(async (d) => {
      if (cancelled) return;
      const first = (await d.getPage(1)).getViewport({ scale: 1 });
      // Every page starts at page 1's proportions and is corrected when it renders.
      setSizes(Array.from({ length: d.numPages }, () => ({ w: first.width, h: first.height })));
      setDoc(d);
    }, (e: Error) => !cancelled && setError(e?.message || "The PDF could not be opened."));
    return () => { cancelled = true; task.destroy(); };
  }, [source]);

  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const measure = () => setFitWidth(Math.max(240, Math.min(el.clientWidth - 24, 1000)));
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const goTo = useCallback((n: number) => {
    const target = scroller.current?.querySelector<HTMLElement>(`[data-page="${n}"]`);
    target?.scrollIntoView({ block: "start" });
  }, []);

  useEffect(() => {
    const onFs = () => setFull(document.fullscreenElement === shell.current);
    document.addEventListener("fullscreenchange", onFs);
    return () => document.removeEventListener("fullscreenchange", onFs);
  }, []);

  async function toggleFull() {
    const el = shell.current as (HTMLDivElement & { webkitRequestFullscreen?: () => void }) | null;
    if (!el) return;
    if (document.fullscreenElement) { await document.exitFullscreen(); return; }
    if (el.requestFullscreen) { try { await el.requestFullscreen(); return; } catch { /* fall back below */ } }
    setFull((f) => !f); // iPhone Safari has no element fullscreen: fill the window instead.
  }

  // Pinch to zoom on touch screens: preview with a transform, re-render sharply on release.
  const pinch = useRef<{ d: number; z: number } | null>(null);
  const [pinchScale, setPinchScale] = useState(1);
  const dist = (t: TouchList) => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);
  const onTouchStart = (e: React.TouchEvent) => { if (e.touches.length === 2) pinch.current = { d: dist(e.touches as unknown as TouchList), z: zoom }; };
  const onTouchMove = (e: React.TouchEvent) => {
    if (pinch.current && e.touches.length === 2) setPinchScale(dist(e.touches as unknown as TouchList) / pinch.current.d);
  };
  const onTouchEnd = () => {
    if (!pinch.current) return;
    setZoom(clampZoom(pinch.current.z * pinchScale));
    pinch.current = null; setPinchScale(1);
  };

  const stepZoom = (dir: 1 | -1) => setZoom((z) => {
    const next = dir > 0 ? ZOOMS.find((x) => x > z + 0.01) : [...ZOOMS].reverse().find((x) => x < z - 0.01);
    return next ?? z;
  });

  const width = Math.round(fitWidth * zoom);
  const n = doc?.numPages ?? 0;

  return (
    <div ref={shell} className={`reader${full ? " reader-full" : ""}`} aria-label={`${title}, PDF reader`}>
      <div className="reader-bar" role="toolbar" aria-label="Reader controls">
        {onClose && <button className="btn btn-quiet" onClick={onClose}>Close</button>}
        <span className="reader-title">{title}</span>
        <span className="reader-group">
          <button className="btn btn-quiet" aria-label="Previous page" disabled={page <= 1} onClick={() => goTo(page - 1)}>‹</button>
          <form onSubmit={(e) => { e.preventDefault(); const v = Number(pageInput); if (v >= 1 && v <= n) goTo(v); }}>
            <label className="sr-only" htmlFor="page-input">Page number</label>
            <input id="page-input" className="page-input" inputMode="numeric" value={pageInput}
              onChange={(e) => setPageInput(e.target.value.replace(/\D/g, ""))} aria-describedby="page-total" />
            <span id="page-total" className="num"> of {n || "…"}</span>
          </form>
          <button className="btn btn-quiet" aria-label="Next page" disabled={!n || page >= n} onClick={() => goTo(page + 1)}>›</button>
        </span>
        <span className="reader-group">
          <button className="btn btn-quiet" aria-label="Zoom out" onClick={() => stepZoom(-1)}>−</button>
          <button className="btn btn-quiet num" aria-label="Fit to width" onClick={() => setZoom(1)}>{Math.round(zoom * 100)}%</button>
          <button className="btn btn-quiet" aria-label="Zoom in" onClick={() => stepZoom(1)}>+</button>
        </span>
        <span className="reader-group">
          <button className="btn btn-quiet" onClick={toggleFull}>{full ? "Exit full screen" : "Full screen"}</button>
          {downloadUrl && <a className="btn btn-quiet" href={downloadUrl} download={downloadName} target="_blank" rel="noopener">Download</a>}
        </span>
      </div>
      <div ref={scroller} className="reader-pages" onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd} onTouchCancel={onTouchEnd}
        style={pinchScale !== 1 ? { transform: `scale(${pinchScale})`, transformOrigin: "50% 0" } : undefined}>
        {error && <p className="reader-msg" role="alert">This PDF could not be opened: {error}</p>}
        {!error && !doc && <p className="reader-msg" role="status">Opening the edition… {loaded > 0 ? `${(loaded / 1048576).toFixed(1)} MB received` : ""}</p>}
        {doc && sizes.map((s, i) => (
          <PageView key={i} doc={doc} index={i + 1} width={width} size={s} scrollRoot={scroller}
            onSize={(w, h) => setSizes((prev) => (prev[i].w === w && prev[i].h === h ? prev : prev.map((p, k) => (k === i ? { w, h } : p))))}
            onVisible={() => { setPage(i + 1); setPageInput(String(i + 1)); }} />
        ))}
      </div>
    </div>
  );
}

function PageView({ doc, index, width, size, scrollRoot, onSize, onVisible }: {
  doc: PDFDoc; index: number; width: number; size: { w: number; h: number };
  scrollRoot: React.RefObject<HTMLDivElement | null>; onSize: (w: number, h: number) => void; onVisible: () => void;
}) {
  const box = useRef<HTMLDivElement>(null);
  const [near, setNear] = useState(false);
  const [state, setState] = useState<"idle" | "drawing" | "done" | "error">("idle");
  const height = Math.round((width * size.h) / size.w);

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const far = new IntersectionObserver(([e]) => setNear(e.isIntersecting), { root: scrollRoot.current, rootMargin: "150% 0px" });
    const seen = new IntersectionObserver(([e]) => { if (e.isIntersecting) onVisible(); }, { root: scrollRoot.current, threshold: 0.5 });
    far.observe(el); seen.observe(el);
    return () => { far.disconnect(); seen.disconnect(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const el = box.current;
    if (!near || !el) return;
    let cancelled = false;
    let task: { cancel(): void; promise: Promise<void> } | null = null;
    let textLayer: { cancel(): void } | null = null;
    setState("drawing");
    (async () => {
      const page = await doc.getPage(index);
      const base = page.getViewport({ scale: 1 });
      if (cancelled) return;
      onSize(base.width, base.height);
      const cssW = width;
      const cssH = Math.round((cssW * base.height) / base.width);
      const dpr = window.devicePixelRatio || 1;
      const viewport = page.getViewport({ scale: renderScale(base.width, base.height, cssW, dpr) });
      const canvas = document.createElement("canvas");
      canvas.width = Math.floor(viewport.width);
      canvas.height = Math.floor(viewport.height);
      canvas.style.width = `${cssW}px`;
      canvas.style.height = `${cssH}px`;
      canvas.setAttribute("aria-hidden", "true");
      const ctx = canvas.getContext("2d", { alpha: false });
      if (!ctx) throw new Error("no canvas");
      task = page.render({ canvasContext: ctx, viewport });
      await task.promise;
      if (cancelled) return;
      const text = document.createElement("div");
      text.className = "textLayer";
      const cssViewport = page.getViewport({ scale: cssW / base.width });
      text.style.setProperty("--scale-factor", String(cssViewport.scale));
      const tl = new pdfjs.TextLayer({ textContentSource: page.streamTextContent(), container: text, viewport: cssViewport });
      textLayer = tl;
      el.replaceChildren(canvas, text);
      await tl.render().catch(() => undefined);
      if (!cancelled) setState("done");
    })().catch(() => { if (!cancelled) setState("error"); });
    return () => {
      cancelled = true;
      task?.cancel();
      textLayer?.cancel();
      // Release the bitmap of pages far from view so long raster editions stay within memory.
      el.querySelectorAll("canvas").forEach((c) => { c.width = 0; c.height = 0; });
      el.replaceChildren();
      setState("idle");
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [near, width, doc, index]);

  return (
    <section className="pdf-page" data-page={index} aria-label={`Page ${index}`} style={{ width, height }}>
      <div ref={box} className="pdf-page-inner" />
      {state !== "done" && <span className="pdf-page-note">{state === "error" ? `Page ${index} could not be drawn.` : `Page ${index}`}</span>}
    </section>
  );
}
