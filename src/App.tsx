import { useCallback, useEffect, useRef, useState } from "react";
import { CaptureUpdateAction, Excalidraw, MainMenu, loadFromBlob } from "@excalidraw/excalidraw";
import "@excalidraw/excalidraw/index.css";
import type { AppState, BinaryFiles, ExcalidrawImperativeAPI, LibraryItems } from "@excalidraw/excalidraw/types";
import type { OrderedExcalidrawElement, Theme } from "@excalidraw/excalidraw/element/types";
import BrowserDrawingsDialog from "./BrowserDrawingsDialog";
import PdfExportDialog from "./PdfExportDialog";
import {
  createDrawing, createRevision, getDrawing, getRevision, getWorkspaceMeta, hydrateRevision,
  openWhiteboardDatabase, pruneForQuota, putWorkspaceMeta, restoreRevision,
  type DrawingRecord, type RevisionRecord, type WhiteboardScene,
} from "./whiteboard-db";
import "./app.css";

type FilePickerWindow = Window & {
  showOpenFilePicker?: (options: {
    multiple?: boolean;
    types?: Array<{ description: string; accept: Record<string, string[]> }>;
  }) => Promise<Array<FileSystemFileHandle>>;
};

const OPEN_TYPES = [{
  description: "Excalidraw drawings",
  accept: {
    "application/json": [".excalidraw", ".json"],
    "image/png": [".png"],
    "image/svg+xml": [".svg"],
  },
}];

function applyScene(api: ExcalidrawImperativeAPI, scene: WhiteboardScene) {
  api.updateScene({ elements: scene.elements, appState: scene.appState as AppState, captureUpdate: CaptureUpdateAction.IMMEDIATELY });
  api.addFiles(Object.values(scene.files));
}

export default function App() {
  const apiRef = useRef<ExcalidrawImperativeAPI | null>(null);
  const fallbackInputRef = useRef<HTMLInputElement | null>(null);
  const activeFileHandleRef = useRef<FileSystemFileHandle | null>(null);
  const databaseRef = useRef<IDBDatabase | null>(null);
  const activeDrawingIdRef = useRef<string | null>(null);
  const sceneRef = useRef<WhiteboardScene>({ elements: [], appState: {}, files: {} });
  const dirtyRef = useRef(false);
  const trackingRef = useRef(false);
  const flushingRef = useRef<Promise<void> | null>(null);
  const [theme, setTheme] = useState<Theme>("light");
  const [libraryItems, setLibraryItems] = useState<LibraryItems>([]);
  const [initialData, setInitialData] = useState<WhiteboardScene | null>(null);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [pdfOpen, setPdfOpen] = useState(false);
  const [storageWarning, setStorageWarning] = useState<string | null>(null);

  const flushRevision = useCallback(async (force = false) => {
    if (flushingRef.current) return flushingRef.current;
    if (!dirtyRef.current && !force) return;
    const database = databaseRef.current;
    if (!database) return;
    const work = (async () => {
      try {
        let drawingId = activeDrawingIdRef.current;
        if (!drawingId) {
          const drawing = await createDrawing(database);
          drawingId = drawing.id;
          activeDrawingIdRef.current = drawingId;
        }
        const meta = await getWorkspaceMeta(database);
        if (!meta.storagePolicy.revisionsEnabled) return;
        await createRevision(database, drawingId, sceneRef.current);
        dirtyRef.current = false;
      } catch (error) {
        const message = `Browser history is paused: ${error instanceof Error ? error.message : String(error)} Export your drawing or delete old history.`;
        setStorageWarning(message);
        try {
          const meta = await getWorkspaceMeta(database);
          await putWorkspaceMeta(database, { ...meta, storagePolicy: { ...meta.storagePolicy, revisionsEnabled: false, warning: message } });
        } catch {
          // Native Excalidraw editing and file operations remain usable.
        }
      } finally {
        flushingRef.current = null;
      }
    })();
    flushingRef.current = work;
    return work;
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const database = await openWhiteboardDatabase();
        databaseRef.current = database;
        const meta = await getWorkspaceMeta(database);
        activeDrawingIdRef.current = meta.activeDrawingId;
        setLibraryItems(meta.libraryItems);
        setStorageWarning(meta.storagePolicy.warning);
        if (navigator.storage?.persist) void navigator.storage.persist();
        if (navigator.storage?.estimate) {
          const estimate = await navigator.storage.estimate();
          if (estimate.usage !== undefined && estimate.quota) {
            const result = await pruneForQuota(database, estimate.usage, estimate.quota);
            if (result.projectedUsage / estimate.quota >= 0.7) {
              setStorageWarning("Browser storage is nearly full. Export drawings or delete old history before revision storage pauses.");
            }
          }
        }
        let restored: WhiteboardScene = { elements: [], appState: {}, files: {} };
        if (meta.activeDrawingId) {
          const drawing = await getDrawing(database, meta.activeDrawingId);
          if (drawing?.latestRevisionId) {
            const revision = await getRevision(database, drawing.latestRevisionId);
            if (revision) restored = await hydrateRevision(database, revision);
          }
        }
        if (!cancelled) setInitialData(restored);
      } catch (error) {
        if (!cancelled) {
          setStorageWarning(`Browser history is unavailable: ${error instanceof Error ? error.message : String(error)} Native editing and file export still work.`);
          setInitialData({ elements: [], appState: {}, files: {} });
        }
      }
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => { void flushRevision(); }, 30_000);
    const onVisibility = () => { if (document.visibilityState === "hidden") void flushRevision(); };
    const onExit = () => { void flushRevision(); };
    const onSave = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s") void flushRevision(true);
    };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", onExit);
    window.addEventListener("beforeunload", onExit);
    window.addEventListener("keydown", onSave, true);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", onExit);
      window.removeEventListener("beforeunload", onExit);
      window.removeEventListener("keydown", onSave, true);
    };
  }, [flushRevision]);

  const importFile = useCallback(async (file: File, handle: FileSystemFileHandle | null) => {
    const api = apiRef.current;
    if (!api) return;
    await flushRevision();
    const database = databaseRef.current;
    if (database) {
      const drawing = await createDrawing(database, file.name.replace(/\.(excalidraw|json|png|svg)$/i, "") || "Imported drawing");
      activeDrawingIdRef.current = drawing.id;
    }
    const imported = await loadFromBlob(file, api.getAppState(), api.getSceneElements(), handle);
    const scene: WhiteboardScene = { elements: imported.elements ?? [], appState: imported.appState ?? {}, files: imported.files ?? {} };
    activeFileHandleRef.current = handle;
    applyScene(api, scene);
    sceneRef.current = scene;
    dirtyRef.current = true;
    await flushRevision();
  }, [flushRevision]);

  const openDrawing = useCallback(async () => {
    const pickerWindow = window as FilePickerWindow;
    if (pickerWindow.showOpenFilePicker) {
      try {
        const [handle] = await pickerWindow.showOpenFilePicker({ multiple: false, types: OPEN_TYPES });
        if (handle) await importFile(await handle.getFile(), handle);
        return;
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
        throw error;
      }
    }
    fallbackInputRef.current?.click();
  }, [importFile]);

  const createBlankDrawing = useCallback(async () => {
    await flushRevision();
    const database = databaseRef.current;
    if (!database) return;
    const drawing = await createDrawing(database);
    activeDrawingIdRef.current = drawing.id;
    const scene: WhiteboardScene = { elements: [], appState: {}, files: {} };
    sceneRef.current = scene;
    dirtyRef.current = true;
    if (apiRef.current) applyScene(apiRef.current, scene);
    await flushRevision(true);
  }, [flushRevision]);

  const openBrowserDrawing = useCallback(async (drawing: DrawingRecord) => {
    await flushRevision();
    const database = databaseRef.current;
    const api = apiRef.current;
    if (!database || !api || !drawing.latestRevisionId) return;
    const revision = await getRevision(database, drawing.latestRevisionId);
    if (!revision) throw new Error("Latest revision is unavailable.");
    const scene = await hydrateRevision(database, revision);
    activeDrawingIdRef.current = drawing.id;
    const meta = await getWorkspaceMeta(database);
    await putWorkspaceMeta(database, { ...meta, activeDrawingId: drawing.id });
    applyScene(api, scene);
    sceneRef.current = scene;
    dirtyRef.current = false;
  }, [flushRevision]);

  const restoreBrowserRevision = useCallback(async (drawing: DrawingRecord, revision: RevisionRecord) => {
    await flushRevision();
    const database = databaseRef.current;
    if (!database) return;
    await restoreRevision(database, drawing.id, revision.id);
    const updated = await getDrawing(database, drawing.id);
    if (updated) await openBrowserDrawing(updated);
  }, [flushRevision, openBrowserDrawing]);

  if (!initialData) return <main className="whiteboard-loading">Opening Offline Whiteboard…</main>;

  return (
    <main className="whiteboard-app" aria-label="Offline Whiteboard">
      <input ref={fallbackInputRef} className="visually-hidden" type="file"
        accept=".excalidraw,.json,.png,.svg,application/json,image/png,image/svg+xml"
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (file) void importFile(file, null);
        }} />
      {storageWarning ? <aside className="storage-warning" role="alert">{storageWarning}</aside> : null}
      <Excalidraw
        excalidrawAPI={(api) => {
          apiRef.current = api;
          window.setTimeout(() => { trackingRef.current = true; }, 500);
        }}
        initialData={{ ...initialData, libraryItems }}
        onChange={(elements: readonly OrderedExcalidrawElement[], appState: AppState, files: BinaryFiles) => {
          setTheme(appState.theme);
          sceneRef.current = { elements, appState, files };
          if (trackingRef.current) dirtyRef.current = true;
        }}
        onLibraryChange={async (items) => {
          setLibraryItems(items);
          const database = databaseRef.current;
          if (database) {
            const meta = await getWorkspaceMeta(database);
            await putWorkspaceMeta(database, { ...meta, libraryItems: items });
          }
        }}
        theme={theme}
        name="Offline Whiteboard"
      >
        <MainMenu>
          <MainMenu.Item onSelect={() => { void openDrawing(); }}>Open…</MainMenu.Item>
          <MainMenu.DefaultItems.SaveToActiveFile />
          <MainMenu.DefaultItems.Export />
          <MainMenu.DefaultItems.SaveAsImage />
          <MainMenu.Separator />
          <MainMenu.Item onSelect={() => setLibraryOpen(true)}>Browser drawings…</MainMenu.Item>
          <MainMenu.Item onSelect={() => setPdfOpen(true)}>Export PDF…</MainMenu.Item>
          <MainMenu.Separator />
          <MainMenu.DefaultItems.SearchMenu />
          <MainMenu.DefaultItems.CommandPalette />
          <MainMenu.DefaultItems.Help />
          <MainMenu.DefaultItems.ClearCanvas />
          <MainMenu.DefaultItems.ToggleTheme onSelect={setTheme} />
          <MainMenu.DefaultItems.ChangeCanvasBackground />
        </MainMenu>
      </Excalidraw>
      {libraryOpen && databaseRef.current ? (
        <BrowserDrawingsDialog database={databaseRef.current} activeDrawingId={activeDrawingIdRef.current}
          onClose={() => setLibraryOpen(false)} onCreate={createBlankDrawing} onOpen={openBrowserDrawing}
          onRestore={restoreBrowserRevision} />
      ) : null}
      {pdfOpen && apiRef.current ? <PdfExportDialog api={apiRef.current} onClose={() => setPdfOpen(false)} /> : null}
    </main>
  );
}
