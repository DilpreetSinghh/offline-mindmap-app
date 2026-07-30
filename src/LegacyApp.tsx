import { useEffect, useRef, useState } from "react";
import { Excalidraw } from "@excalidraw/excalidraw";
import "@excalidraw/excalidraw/index.css";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import PdfExportDialog from "./PdfExportDialog";
import { downloadBlob, exportScene } from "./exports";
import { readAllLegacy, readBackup, type LegacyCandidate } from "./legacy-reader";
import "./legacy.css";

function safeName(name: string): string {
  return name.trim().replace(/[^a-z0-9._-]+/gi, "-") || "legacy-drawing";
}

export default function LegacyApp() {
  const apiRef = useRef<ExcalidrawImperativeAPI | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [candidates, setCandidates] = useState<LegacyCandidate[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("Reading legacy storage without changing it…");
  const [pdfOpen, setPdfOpen] = useState(false);
  const selected = candidates.find((candidate) => candidate.id === selectedId) ?? candidates[0] ?? null;

  useEffect(() => {
    void readAllLegacy().then((items) => {
      setCandidates(items);
      setSelectedId(items[0]?.id ?? "");
      setMessage(items.length ? `${items.length} recoverable drawing${items.length === 1 ? "" : "s"} found.` : "No legacy browser drawings were found. You can open a historical backup JSON file.");
    }).catch((error) => setMessage(`Legacy storage could not be read: ${error instanceof Error ? error.message : String(error)}`)).finally(() => setLoading(false));
  }, []);

  const exportCurrent = async (format: "excalidraw" | "png" | "svg" | "clipboard") => {
    if (!selected || !apiRef.current) return;
    await exportScene(apiRef.current, safeName(selected.name), format);
  };

  return (
    <main className="legacy-app">
      <header>
        <div><h1>Offline Whiteboard</h1><p>Permanent legacy recovery · export only</p></div>
        <a href="../index.html">Return to editor</a>
      </header>
      <aside className="legacy-notice"><strong>Read-only recovery.</strong> This page never migrates, edits or deletes old browser data.</aside>
      <section className="legacy-workspace">
        <nav aria-label="Legacy drawings">
          <button type="button" onClick={() => fileRef.current?.click()}>Open backup JSON…</button>
          <input ref={fileRef} className="visually-hidden" type="file" accept=".json,application/json" onChange={(event) => {
            const file = event.target.files?.[0]; event.target.value = "";
            if (!file) return;
            void file.text().then((text) => {
              const imported = readBackup(JSON.parse(text));
              setCandidates((current) => [...current, ...imported]);
              if (imported[0]) setSelectedId(imported[0].id);
              setMessage(`${imported.length} drawing${imported.length === 1 ? "" : "s"} read from ${file.name}.`);
            }).catch((error) => setMessage(`Backup rejected: ${error instanceof Error ? error.message : String(error)}`));
          }} />
          <p>{loading ? "Reading…" : message}</p>
          <ul>{candidates.map((candidate) => <li key={`${candidate.source}-${candidate.id}`}><button type="button" className={selected?.id === candidate.id ? "selected" : ""} onClick={() => setSelectedId(candidate.id)}><strong>{candidate.name}</strong><span>{candidate.source}</span></button></li>)}</ul>
        </nav>
        <div className="legacy-preview">
          {selected ? <Excalidraw key={`${selected.source}-${selected.id}`} excalidrawAPI={(api) => { apiRef.current = api; }} initialData={selected.document.scene} viewModeEnabled zenModeEnabled name={selected.name} UIOptions={{ canvasActions: { loadScene: false, saveToActiveFile: false, clearCanvas: false } }} /> : <div className="legacy-empty">Select a recovered drawing to preview it.</div>}
        </div>
        <aside className="legacy-exports">
          <h2>Export recovered data</h2>
          <button type="button" disabled={!selected} onClick={() => void exportCurrent("excalidraw")}>Excalidraw file</button>
          <button type="button" disabled={!selected} onClick={() => void exportCurrent("png")}>PNG image</button>
          <button type="button" disabled={!selected} onClick={() => void exportCurrent("svg")}>SVG image</button>
          <button type="button" disabled={!selected} onClick={() => void exportCurrent("clipboard")}>Copy PNG</button>
          <button type="button" disabled={!selected} onClick={() => setPdfOpen(true)}>Export PDF…</button>
          <hr />
          <button type="button" disabled={!selected} onClick={() => {
            if (selected) downloadBlob(new Blob([JSON.stringify(selected.raw, null, 2)], { type: "application/json" }), `${safeName(selected.name)}-recovery.json`);
          }}>Original recovery JSON</button>
          {Object.values(selected?.document.attachments ?? {}).filter((attachment) => !attachment.mimeType.startsWith("image/")).map((attachment) => <button type="button" key={attachment.id} onClick={() => downloadBlob(fetchDataUrl(attachment.dataURL), attachment.name)}>Attachment: {attachment.name}</button>)}
        </aside>
      </section>
      {pdfOpen && apiRef.current ? <PdfExportDialog api={apiRef.current} onClose={() => setPdfOpen(false)} /> : null}
    </main>
  );
}

function fetchDataUrl(dataURL: string): Blob {
  const [header, body] = dataURL.split(",", 2);
  const mimeType = /data:([^;]+)/.exec(header)?.[1] ?? "application/octet-stream";
  const binary = header.includes(";base64") ? atob(body) : decodeURIComponent(body);
  return new Blob([Uint8Array.from(binary, (character) => character.charCodeAt(0))], { type: mimeType });
}
