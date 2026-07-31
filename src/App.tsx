import { useCallback, useEffect, useRef, useState } from "react";
import { CaptureUpdateAction, Excalidraw, MainMenu, convertToExcalidrawElements, loadFromBlob } from "@excalidraw/excalidraw";
import "@excalidraw/excalidraw/index.css";
import type { AppState, BinaryFiles, ExcalidrawImperativeAPI, LibraryItems } from "@excalidraw/excalidraw/types";
import type { OrderedExcalidrawElement, Theme } from "@excalidraw/excalidraw/element/types";
import BrowserDrawingsDialog from "./BrowserDrawingsDialog";
import PdfExportDialog from "./PdfExportDialog";
import { recogniseShape, shapeSkeleton } from "./shape-recognition.mjs";
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
  const handledStrokesRef = useRef(new Set<string>());
  const shapeRecognitionRef = useRef(true);
  const [editorReady, setEditorReady] = useState(false);
  const [theme, setTheme] = useState<Theme>("light");
  const [shapeRecognition, setShapeRecognition] = useState(true);
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
        const database = await Promise.race([
          openWhiteboardDatabase(),
          new Promise<never>((_resolve, reject) => window.setTimeout(() => reject(new Error("Browser storage did not respond in time.")), 2_000)),
        ]);
        databaseRef.current = database;
        const meta = await getWorkspaceMeta(database);
        activeDrawingIdRef.current = meta.activeDrawingId;
        setLibraryItems(meta.libraryItems);
        setStorageWarning(meta.storagePolicy.warning);
        const initialShapeRecognition = meta.preferences?.shapeRecognition ?? true;
        shapeRecognitionRef.current = initialShapeRecognition;
        setShapeRecognition(initialShapeRecognition);
        if (navigator.storage?.persist) void navigator.storage.persist();
        if (navigator.storage?.estimate) {
          void navigator.storage.estimate().then(async (estimate) => {
            if (estimate.usage !== undefined && estimate.quota) {
              const result = await pruneForQuota(database, estimate.usage, estimate.quota);
              if (result.projectedUsage / estimate.quota >= 0.7) {
                setStorageWarning("Browser storage is nearly full. Export drawings or delete old history before revision storage pauses.");
              }
            }
          }).catch(() => { /* Quota inspection must never block the editor. */ });
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

  useEffect(() => {
    const api = apiRef.current;
    if (!api || !shapeRecognition) return;
    return api.onPointerUp((activeTool) => {
      if (activeTool?.type !== "freedraw") return;
      const elements = api.getSceneElements();
      const stroke = elements[elements.length - 1];
      if (!stroke || stroke.type !== "freedraw" || stroke.isDeleted) return;
      if (handledStrokesRef.current.has(stroke.id)) return;
      handledStrokesRef.current.add(stroke.id);
      const shape = recogniseShape(stroke);
      if (!shape) return;
      const [replacement] = convertToExcalidrawElements([shapeSkeleton(stroke, shape) as unknown as NonNullable<Parameters<typeof convertToExcalidrawElements>[0]>[number]]);
      if (!replacement || replacement.isDeleted) return;
      const next = elements.map((element) => (element.id === stroke.id ? replacement : element));
      sceneRef.current = { ...sceneRef.current, elements: next };
      dirtyRef.current = true;
      api.updateScene({
        elements: next,
        appState: { ...api.getAppState(), selectedElementIds: { [replacement.id]: true } },
        captureUpdate: CaptureUpdateAction.IMMEDIATELY,
      });
      void flushRevision();
    });
  }, [shapeRecognition, editorReady, flushRevision]);

  const toggleShapeRecognition = useCallback(() => {
    const next = !shapeRecognitionRef.current;
    shapeRecognitionRef.current = next;
    setShapeRecognition(next);
    const database = databaseRef.current;
    if (database) {
      void getWorkspaceMeta(database).then((meta) => putWorkspaceMeta(database, {
        ...meta,
        preferences: { ...meta.preferences, shapeRecognition: next },
      })).catch(() => {
        // The toggle still applies for this session when persistence fails.
      });
    }
  }, []);

  const importFile = useCallback(async (file: File, handle: FileSystemFileHandle | null) => {
    const api = apiRef.current;
    if (!api) return;
    await flushRevision();
    handledStrokesRef.current.clear();
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
    handledStrokesRef.current.clear();
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
    handledStrokesRef.current.clear();
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

  const applyTheme = useCallback((nextTheme: Theme) => {
    const api = apiRef.current;
    if (!api || api.getAppState().theme === nextTheme) return;
    api.updateScene({
      appState: {
        ...api.getAppState(),
        theme: nextTheme,
      },
      captureUpdate: CaptureUpdateAction.IMMEDIATELY,
    });
    setTheme(nextTheme);
    dirtyRef.current = true;
  }, []);

  const toggleTheme = useCallback(() => {
    applyTheme(theme === "dark" ? "light" : "dark");
  }, [applyTheme, theme]);

  if (!initialData) return <main className="whiteboard-loading">Opening Offline Whiteboard…</main>;

  return (
    <main className="whiteboard-app" data-theme={theme} aria-label="Offline Whiteboard">
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
          setEditorReady(true);
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
          <MainMenu.Item
            data-testid="toggle-dark-mode"
            aria-label={theme === "dark" ? "Light mode" : "Dark mode"}
            icon={theme === "dark"
              ? <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M12 2v2m0 16v2M4.93 4.93l1.42 1.42m11.3 11.3 1.42 1.42M2 12h2m16 0h2M4.93 19.07l1.42-1.42m11.3-11.3 1.42-1.42M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0Z" /></svg>
              : <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M20.1 15.3A9 9 0 0 1 8.7 3.9 9 9 0 1 0 20.1 15.3Z" /></svg>}
            onSelect={toggleTheme}
          >
            {theme === "dark" ? "Light mode" : "Dark mode"}
          </MainMenu.Item>
          <MainMenu.Item
            data-testid="toggle-shape-recognition"
            aria-label={shapeRecognition ? "Turn off shape recognition" : "Turn on shape recognition"}
            icon={shapeRecognition
              ? <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M9 16.17 4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41Z" /></svg>
              : <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2Zm0 2a8 8 0 0 1 7.9 7H4.1A8 8 0 0 1 12 4Z" /></svg>}
            onSelect={() => { void toggleShapeRecognition(); }}
          >
            {shapeRecognition ? "Shape recognition: on" : "Shape recognition: off"}
          </MainMenu.Item>
          <MainMenu.Separator />
          <MainMenu.Item onSelect={() => setLibraryOpen(true)}>Browser drawings…</MainMenu.Item>
          <MainMenu.Item onSelect={() => setPdfOpen(true)}>Export PDF…</MainMenu.Item>
          <MainMenu.Separator />
          <MainMenu.DefaultItems.SearchMenu />
          <MainMenu.DefaultItems.CommandPalette />
          <MainMenu.DefaultItems.Help />
          <MainMenu.DefaultItems.ClearCanvas />
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
