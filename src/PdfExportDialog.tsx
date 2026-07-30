import { useState } from "react";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import { downloadPdf, type PdfLayout, type PdfQuality } from "./pdf-export";

export default function PdfExportDialog({ api, onClose }: { api: ExcalidrawImperativeAPI; onClose: () => void }) {
  const [layout, setLayout] = useState<PdfLayout>("a4-fit");
  const [quality, setQuality] = useState<PdfQuality>("high");
  const [selectionOnly, setSelectionOnly] = useState(false);
  const [background, setBackground] = useState(true);
  const [dark, setDark] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const hasSelection = Object.keys(api.getAppState().selectedElementIds).length > 0;

  return (
    <div className="dialog-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="pdf-dialog" role="dialog" aria-modal="true" aria-labelledby="pdf-dialog-title">
        <header><h1 id="pdf-dialog-title">Export PDF</h1><button type="button" onClick={onClose} aria-label="Close">×</button></header>
        <fieldset>
          <legend>Page layout</legend>
          <label><input type="radio" name="layout" checked={layout === "a4-fit"} onChange={() => setLayout("a4-fit")} /> One-page A4 auto-fit <small>Portrait or landscape automatically</small></label>
          <label><input type="radio" name="layout" checked={layout === "canvas"} onChange={() => setLayout("canvas")} /> One canvas-sized page <small>Large drawings are safely scaled to browser limits</small></label>
          <label><input type="radio" name="layout" checked={layout === "a4-tiles"} onChange={() => setLayout("a4-tiles")} /> Tiled A4 pages <small>10 mm margins and 5 mm overlap</small></label>
        </fieldset>
        <fieldset>
          <legend>Output quality</legend>
          <label>
            Raster detail
            <select value={quality} onChange={(event) => setQuality(event.target.value as PdfQuality)}>
              <option value="standard">Standard · 1× · up to 16 MP</option>
              <option value="high">High · 2× · up to 32 MP</option>
              <option value="maximum">Maximum · 3× · up to 64 MP</option>
            </select>
            <small>Higher quality improves zoom and print sharpness but uses more memory.</small>
          </label>
        </fieldset>
        <fieldset>
          <legend>Content</legend>
          <label><input type="checkbox" checked={selectionOnly} disabled={!hasSelection} onChange={(event) => setSelectionOnly(event.target.checked)} /> Selection only</label>
          <label><input type="checkbox" checked={background} onChange={(event) => setBackground(event.target.checked)} /> Background</label>
          <label><input type="checkbox" checked={dark} onChange={(event) => setDark(event.target.checked)} /> Dark background and rendering</label>
        </fieldset>
        {error ? <p className="dialog-error" role="alert">{error}</p> : null}
        <footer><button type="button" onClick={onClose}>Cancel</button><button type="button" className="primary-button" disabled={busy} onClick={() => {
          setBusy(true); setError("");
          void downloadPdf(api, "offline-whiteboard", { layout, quality, selectionOnly, background, dark })
            .then(onClose).catch((reason) => { setError(reason instanceof Error ? reason.message : String(reason)); setBusy(false); });
        }}>{busy ? "Exporting…" : "Export PDF"}</button></footer>
      </section>
    </div>
  );
}
