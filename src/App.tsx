import { useCallback, useRef, useState } from "react";
import {
  CaptureUpdateAction,
  Excalidraw,
  MainMenu,
  loadFromBlob,
} from "@excalidraw/excalidraw";
import "@excalidraw/excalidraw/index.css";
import type {
  AppState,
  BinaryFiles,
  ExcalidrawImperativeAPI,
  LibraryItems,
} from "@excalidraw/excalidraw/types";
import type { OrderedExcalidrawElement, Theme } from "@excalidraw/excalidraw/element/types";
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

function applyImportedScene(api: ExcalidrawImperativeAPI, scene: Awaited<ReturnType<typeof loadFromBlob>>) {
  api.updateScene({
    elements: scene.elements,
    appState: scene.appState,
    captureUpdate: CaptureUpdateAction.IMMEDIATELY,
  });
  if (scene.files) api.addFiles(Object.values(scene.files));
}

export default function App() {
  const apiRef = useRef<ExcalidrawImperativeAPI | null>(null);
  const fallbackInputRef = useRef<HTMLInputElement | null>(null);
  const activeFileHandleRef = useRef<FileSystemFileHandle | null>(null);
  const [theme, setTheme] = useState<Theme>("light");
  const [libraryItems, setLibraryItems] = useState<LibraryItems>([]);

  const importFile = useCallback(async (file: File, handle: FileSystemFileHandle | null) => {
    const api = apiRef.current;
    if (!api) return;
    const scene = await loadFromBlob(file, api.getAppState(), api.getSceneElements(), handle);
    activeFileHandleRef.current = handle;
    applyImportedScene(api, scene);
  }, []);

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

  const onFallbackFile = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (file) void importFile(file, null);
  }, [importFile]);

  const onChange = useCallback((
    _elements: readonly OrderedExcalidrawElement[],
    appState: AppState,
    _files: BinaryFiles,
  ) => {
    setTheme(appState.theme);
  }, []);

  return (
    <main className="whiteboard-app" aria-label="Offline Whiteboard">
      <input
        ref={fallbackInputRef}
        className="visually-hidden"
        type="file"
        accept=".excalidraw,.json,.png,.svg,application/json,image/png,image/svg+xml"
        onChange={onFallbackFile}
      />
      <Excalidraw
        excalidrawAPI={(api) => { apiRef.current = api; }}
        initialData={{ libraryItems }}
        onChange={onChange}
        onLibraryChange={async (items) => {
          setLibraryItems(items);
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
          <MainMenu.Item onSelect={() => {}}>Browser drawings…</MainMenu.Item>
          <MainMenu.Item onSelect={() => {}}>Export PDF…</MainMenu.Item>
          <MainMenu.Separator />
          <MainMenu.DefaultItems.SearchMenu />
          <MainMenu.DefaultItems.CommandPalette />
          <MainMenu.DefaultItems.Help />
          <MainMenu.DefaultItems.ClearCanvas />
          <MainMenu.DefaultItems.ToggleTheme onSelect={setTheme} />
          <MainMenu.DefaultItems.ChangeCanvasBackground />
        </MainMenu>
      </Excalidraw>
    </main>
  );
}
