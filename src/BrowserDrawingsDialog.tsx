import { useCallback, useEffect, useState } from "react";
import { serializeAsJSON } from "@excalidraw/excalidraw";
import type { DrawingRecord, RevisionRecord } from "./whiteboard-db";
import { deleteDrawing, duplicateDrawing, hydrateRevision, listDrawings, listRevisions, renameDrawing } from "./whiteboard-db";

type Props = {
  database: IDBDatabase;
  activeDrawingId: string | null;
  onClose: () => void;
  onCreate: () => Promise<void>;
  onOpen: (drawing: DrawingRecord) => Promise<void>;
  onRestore: (drawing: DrawingRecord, revision: RevisionRecord) => Promise<void>;
};

function formatBytes(value: number): string {
  if (value < 1024) return `${value} B`;
  if (value < 1024 ** 2) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / 1024 ** 2).toFixed(1)} MB`;
}

function download(name: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: "application/vnd.excalidraw+json" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${name.replace(/[^a-z0-9._-]+/gi, "-") || "drawing"}.excalidraw`;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

export default function BrowserDrawingsDialog(props: Props) {
  const [drawings, setDrawings] = useState<DrawingRecord[]>([]);
  const [selected, setSelected] = useState<DrawingRecord | null>(null);
  const [revisions, setRevisions] = useState<RevisionRecord[]>([]);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    const next = await listDrawings(props.database);
    setDrawings(next);
    setSelected((current) => next.find((drawing) => drawing.id === current?.id) ?? next[0] ?? null);
  }, [props.database]);

  useEffect(() => { void refresh(); }, [refresh]);
  useEffect(() => {
    void (selected ? listRevisions(props.database, selected.id).then(setRevisions) : Promise.resolve(setRevisions([])));
  }, [props.database, selected]);

  const action = async (work: () => Promise<void>) => {
    setBusy(true);
    try { await work(); await refresh(); } finally { setBusy(false); }
  };

  return (
    <div className="dialog-backdrop" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget) props.onClose();
    }}>
      <section className="browser-dialog" role="dialog" aria-modal="true" aria-labelledby="browser-dialog-title">
        <header>
          <div>
            <h1 id="browser-dialog-title">Browser drawings</h1>
            <p>Local drawings and append-only revision history</p>
          </div>
          <button type="button" onClick={props.onClose} aria-label="Close">×</button>
        </header>
        <div className="browser-dialog__body">
          <aside>
            <button type="button" className="primary-button" disabled={busy} onClick={() => void action(props.onCreate)}>New drawing</button>
            <ul aria-label="Saved browser drawings">
              {drawings.map((drawing) => (
                <li key={drawing.id}>
                  <button
                    type="button"
                    className={selected?.id === drawing.id ? "selected" : ""}
                    onClick={() => setSelected(drawing)}
                  >
                    <strong>{drawing.name}</strong>
                    <span>{new Date(drawing.updatedAt).toLocaleString()}</span>
                    {drawing.id === props.activeDrawingId ? <em>Open</em> : null}
                  </button>
                </li>
              ))}
            </ul>
          </aside>
          <div className="browser-dialog__details">
            {selected ? (
              <>
                <div className="drawing-actions">
                  <h2>{selected.name}</h2>
                  <button type="button" disabled={busy} onClick={() => void action(async () => {
                    const name = prompt("Drawing name", selected.name);
                    if (name !== null) await renameDrawing(props.database, selected.id, name);
                  })}>Rename</button>
                  <button type="button" disabled={busy} onClick={() => void action(async () => { await duplicateDrawing(props.database, selected.id); })}>Duplicate</button>
                  <button type="button" disabled={busy || selected.id === props.activeDrawingId} onClick={() => void action(async () => { await props.onOpen(selected); props.onClose(); })}>Open</button>
                  <button type="button" className="danger-button" disabled={busy} onClick={() => void action(async () => {
                    if (confirm(`Delete “${selected.name}” and its revision history?`)) await deleteDrawing(props.database, selected.id);
                  })}>Delete</button>
                </div>
                <table>
                  <thead><tr><th>Revision</th><th>Stored size</th><th><span className="visually-hidden">Actions</span></th></tr></thead>
                  <tbody>
                    {revisions.map((revision, index) => (
                      <tr key={revision.id}>
                        <td>{new Date(revision.createdAt).toLocaleString()}{index === 0 ? " (latest)" : ""}</td>
                        <td>{formatBytes(revision.size)}</td>
                        <td>
                          <button type="button" disabled={busy} onClick={() => void action(async () => {
                            const scene = await hydrateRevision(props.database, revision);
                            download(`${selected.name}-${new Date(revision.createdAt).toISOString()}`, serializeAsJSON(scene.elements, scene.appState, scene.files, "local"));
                          })}>Export</button>
                          <button type="button" disabled={busy} onClick={() => void action(async () => {
                            await props.onRestore(selected, revision);
                            props.onClose();
                          })}>Restore</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </>
            ) : <p>No browser drawings yet.</p>}
          </div>
        </div>
      </section>
    </div>
  );
}
