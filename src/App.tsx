import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  CaptureUpdateAction,
  DefaultSidebar,
  Excalidraw,
  MainMenu,
} from "@excalidraw/excalidraw";
import "@excalidraw/excalidraw/index.css";
import type { AppState, BinaryFiles, ExcalidrawImperativeAPI, LibraryItems } from "@excalidraw/excalidraw/types";
import type { OrderedExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import {
  canPasteMindmapText,
  commandForKeyboardEvent,
  commandRegistry,
  findCommand,
  formatShortcutLabel,
  pasteMindmapText,
  type CommandContext,
  type CommandId,
} from "./commands";
import {
  assertValidDocument,
  createBlankDocument,
  createId,
  createTemplateDocument,
  getMindmapNode,
  mergeFoldedScene,
  normaliseConnectionBindings,
  normaliseRootlessWhiteboard,
  projectFoldedElements,
  validateDocument,
} from "./document";
import {
  getLibrary,
  getRecoveryDocument,
  listDocuments,
  migrateLegacyDocuments,
  putDocument,
  putDocuments,
  putLibrary,
  putRecoveryDocument,
} from "./db";
import { downloadNativeBackup, exportScene, type ExportFormat } from "./exports";
import type { DocumentV3, EditorTab } from "./types";
import SimpleMindmap from "./SimpleMindmap";
import OutlineView, { outlineMarkdown } from "./OutlineView";
import NodeDetailsDialog from "./NodeDetailsDialog";
import {
  addConnectedMindmapNode,
  ensureEditableMindmapElements,
  moveMindmapNodeInOutline,
  replaceMindmapNodeTexts,
  removeMindmapSubtree,
  renameMindmapNode,
  updateMindmapNodeContent,
} from "./mindmap-operations";
import "./app.css";
import { revealFoldedNode, setNodesCollapsed } from "./folding.mjs";
import { buildSearchRecords, replaceTextMatches, searchMindmap } from "./search-index.mjs";

const EDITOR_MODE_KEY = "offline-mindmap-editor-mode-v1";
const SURFACE_MODE_KEY = "offline-mindmap-surface-mode-v1";
const AUTOSAVE_DELAY = 600;

type Status = { message: string; state: "" | "saved" | "error" };
type SurfaceMode = "simple" | "outline" | "whiteboard";

function detectsMobileUse(): boolean {
  return window.matchMedia("(max-width: 760px), (pointer: coarse)").matches;
}

function readSurfaceOverride(): SurfaceMode | null {
  const stored = localStorage.getItem(SURFACE_MODE_KEY);
  return stored === "simple" || stored === "outline" || stored === "whiteboard" ? stored : null;
}

function cleanPersistedAppState(appState: Partial<AppState>): Partial<AppState> {
  return {
    ...appState,
    contextMenu: null,
    activeEmbeddable: null,
    newElement: null,
    resizingElement: null,
    multiElement: null,
    selectionElement: null,
    startBoundElement: null,
    suggestedBindings: [],
    frameToHighlight: null,
    editingFrame: null,
    elementsToHighlight: null,
    editingTextElement: null,
    editingLinearElement: null,
    openMenu: null,
    openPopup: null,
    openDialog: null,
    pendingImageElementId: null,
    selectedLinearElement: null,
    showHyperlinkPopup: false,
    toast: null,
  };
}

function prepareDocument(document: DocumentV3): DocumentV3 {
  const rootless = normaliseRootlessWhiteboard(document.scene.elements, document.rootNodeId);
  return {
    ...document,
    scene: {
      ...document.scene,
      elements: ensureEditableMindmapElements(rootless.elements),
      appState: cleanPersistedAppState(document.scene.appState),
    },
  };
}

function formatTime(date = new Date()): string {
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function displayShortcut(shortcut: string): string {
  return formatShortcutLabel(shortcut, navigator.platform || navigator.userAgent);
}

function isMindmapSelection(api: ExcalidrawImperativeAPI): boolean {
  const selected = api.getAppState().selectedElementIds;
  const elements = api.getSceneElements();
  if (elements.some((element) => selected[element.id] && getMindmapNode(element))) return true;
  const hasMindmap = elements.some((element) => getMindmapNode(element));
  return !hasMindmap && elements.some((element) => (
    selected[element.id]
    && (element.type === "rectangle" || element.type === "ellipse" || element.type === "diamond")
  ));
}

function currentSceneDocument(tab: EditorTab, api: ExcalidrawImperativeAPI): DocumentV3 {
  const merged = mergeFoldedScene(tab.document.scene.elements, api.getSceneElements());
  const rootless = normaliseRootlessWhiteboard(merged, tab.document.rootNodeId);
  return {
    ...tab.document,
    updatedAt: new Date().toISOString(),
    scene: {
      elements: rootless.elements,
      appState: cleanPersistedAppState(api.getAppState()),
      files: api.getFiles(),
    },
  };
}

export default function App() {
  const apiRef = useRef<ExcalidrawImperativeAPI | null>(null);
  const tabsRef = useRef<EditorTab[]>([]);
  const activeKeyRef = useRef("");
  const recoveryTimerRef = useRef<number | null>(null);
  const explicitStatusUntilRef = useRef(0);
  const lastValidElementsRef = useRef<readonly OrderedExcalidrawElement[]>([]);
  const semanticUpdateRef = useRef(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const nameResolverRef = useRef<((value: string | null) => void) | null>(null);
  const surfaceModeRef = useRef<SurfaceMode>("whiteboard");
  const fitWhiteboardOnMountRef = useRef(false);

  const [tabs, setTabs] = useState<EditorTab[]>([]);
  const [activeKey, setActiveKey] = useState("");
  const [savedDocuments, setSavedDocuments] = useState<DocumentV3[]>([]);
  const [status, setStatus] = useState<Status>({ message: "Opening local workspace…", state: "" });
  const [ready, setReady] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [replaceValue, setReplaceValue] = useState("");
  const [searchCaseSensitive, setSearchCaseSensitive] = useState(false);
  const [searchWholeWord, setSearchWholeWord] = useState(false);
  const [searchDepth, setSearchDepth] = useState("");
  const [searchVisibility, setSearchVisibility] = useState("all");
  const [searchTag, setSearchTag] = useState("");
  const [searchTaskState, setSearchTaskState] = useState("all");
  const [searchResultIndex, setSearchResultIndex] = useState(0);
  const [searchRevision, setSearchRevision] = useState(0);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [paletteQuery, setPaletteQuery] = useState("");
  const [helpQuery, setHelpQuery] = useState("");
  const [exportFormat, setExportFormat] = useState<ExportFormat>("png");
  const [nameRequest, setNameRequest] = useState<{ copy: boolean; value: string } | null>(null);
  const [mobileUse, setMobileUse] = useState(detectsMobileUse);
  const [surfaceOverride, setSurfaceOverride] = useState<SurfaceMode | null>(readSurfaceOverride);
  const [simpleSelectedNodeId, setSimpleSelectedNodeId] = useState("root");

  const surfaceMode: SurfaceMode = surfaceOverride ?? (mobileUse ? "simple" : "whiteboard");
  surfaceModeRef.current = surfaceMode;

  tabsRef.current = tabs;
  activeKeyRef.current = activeKey;

  const activeTab = useMemo(() => tabs.find((tab) => tab.key === activeKey) ?? null, [activeKey, tabs]);
  const activeTabRef = useRef<EditorTab | null>(activeTab);
  if (activeTabRef.current?.key !== activeTab?.key) activeTabRef.current = activeTab;

  useEffect(() => {
    activeTabRef.current = activeTab;
  }, [activeTab]);

  useEffect(() => {
    if (!activeTab) return;
    const selectedExists = activeTab.document.scene.elements.some(
      (element) => getMindmapNode(element)?.nodeId === simpleSelectedNodeId,
    );
    if (!selectedExists) setSimpleSelectedNodeId(activeTab.document.rootNodeId);
  }, [activeTab, simpleSelectedNodeId]);

  const announce = useCallback((message: string, state: "saved" | "error" = "saved") => {
    explicitStatusUntilRef.current = Date.now() + 3_000;
    setStatus({ message, state });
  }, []);

  useEffect(() => {
    const media = window.matchMedia("(max-width: 760px), (pointer: coarse)");
    const sync = () => setMobileUse(media.matches);
    sync();
    media.addEventListener("change", sync);
    return () => media.removeEventListener("change", sync);
  }, []);

  const refreshSavedDocuments = useCallback(async () => {
    setSavedDocuments(await listDocuments());
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        localStorage.setItem(EDITOR_MODE_KEY, "excalidraw");
        const migration = await migrateLegacyDocuments();
        const [documents, recovery, library] = await Promise.all([listDocuments(), getRecoveryDocument(), getLibrary()]);
        if (cancelled) return;
        setSavedDocuments(documents);
        const initialDocument = prepareDocument(
          recovery && validateDocument(recovery).valid ? recovery : documents[0] ?? createBlankDocument(),
        );
        const persisted = documents.some((document) => document.id === initialDocument.id);
        const initialTab = { key: createId("tab"), document: initialDocument, persisted };
        setTabs([initialTab]);
        setActiveKey(initialTab.key);
        lastValidElementsRef.current = projectFoldedElements(initialDocument.scene.elements);
        if (library && apiRef.current) await apiRef.current.updateLibrary({ libraryItems: library as LibraryItems });
        if (migration.errors.length) {
          announce(`Migration paused: ${migration.errors[0]}`, "error");
        } else if (migration.migrated.length) {
          announce(`Migrated ${migration.migrated.length} classic map(s); schema-2 recovery retained.`);
        } else {
          announce("Local whiteboard ready.");
        }
        setReady(true);
      } catch (error) {
        if (!cancelled) {
          announce(`Local database failed: ${error instanceof Error ? error.message : String(error)}`, "error");
          const fallback = { key: createId("tab"), document: prepareDocument(createBlankDocument()), persisted: false };
          setTabs([fallback]);
          setActiveKey(fallback.key);
          setReady(true);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [announce]);

  const captureActiveTab = useCallback((): EditorTab | null => {
    const tab = activeTabRef.current;
    if (!tab) return null;
    if (surfaceModeRef.current === "simple") return tab;
    const api = apiRef.current;
    if (!api) return tab;
    return { ...tab, document: currentSceneDocument(tab, api) };
  }, []);

  const updateCapturedTab = useCallback((captured: EditorTab) => {
    setTabs((current) => current.map((tab) => (tab.key === captured.key ? captured : tab)));
  }, []);

  const requestMapName = useCallback((copy: boolean, value: string) => new Promise<string | null>((resolve) => {
    nameResolverRef.current = resolve;
    setNameRequest({ copy, value });
  }), []);

  const resolveMapName = useCallback((value: string | null) => {
    nameResolverRef.current?.(value);
    nameResolverRef.current = null;
    setNameRequest(null);
  }, []);

  const saveLocally = useCallback(
    async (saveAsCopy = false) => {
      if (recoveryTimerRef.current) window.clearTimeout(recoveryTimerRef.current);
      const captured = captureActiveTab();
      if (!captured) return;
      let name = captured.document.name;
      if (saveAsCopy || !captured.persisted) {
        const requested = await requestMapName(saveAsCopy, name);
        if (requested === null) {
          setStatus({ message: "Local save cancelled.", state: "" });
          return;
        }
        name = requested.trim() || name;
      }
      const now = new Date().toISOString();
      const document: DocumentV3 = {
        ...captured.document,
        id: saveAsCopy || !captured.persisted ? createId("map") : captured.document.id,
        name,
        createdAt: saveAsCopy || !captured.persisted ? now : captured.document.createdAt,
        updatedAt: now,
      };
      try {
        assertValidDocument(document);
        const saved = await putDocument(document);
        if (recoveryTimerRef.current) window.clearTimeout(recoveryTimerRef.current);
        const nextTab = { ...captured, document: saved, persisted: true };
        activeTabRef.current = nextTab;
        updateCapturedTab(nextTab);
        await putRecoveryDocument(saved);
        await refreshSavedDocuments();
        explicitStatusUntilRef.current = Date.now() + 3_000;
        announce(`Saved locally · ${formatTime()}`);
      } catch (error) {
        announce(`Local save failed; previous valid copy preserved: ${error instanceof Error ? error.message : String(error)}`, "error");
      }
    },
    [announce, captureActiveTab, refreshSavedDocuments, requestMapName, updateCapturedTab],
  );

  const commandContext = useCallback((): CommandContext | null => {
    if (!apiRef.current) return null;
    return {
      api: apiRef.current,
      rootNodeId: activeTabRef.current?.document.rootNodeId ?? "root",
      getCanonicalElements: () => activeTabRef.current?.document.scene.elements ?? apiRef.current?.getSceneElements() ?? [],
      stageCanonicalElements: (elements) => {
        const tab = activeTabRef.current;
        if (!tab) return;
        activeTabRef.current = {
          ...tab,
          document: { ...tab.document, scene: { ...tab.document.scene, elements } },
        };
      },
      openPalette: () => setPaletteOpen(true),
      openHelp: () => setHelpOpen(true),
      openSearch: () => setSearchOpen(true),
      announce,
    };
  }, [announce]);

  const executeCommand = useCallback(
    (id: CommandId) => {
      const context = commandContext();
      if (!context) return;
      void findCommand(id).execute(context);
    },
    [commandContext],
  );

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const modifier = event.metaKey || event.ctrlKey;
      if (modifier && event.key.toLowerCase() === "f") {
        event.preventDefault();
        event.stopPropagation();
        setSearchOpen(true);
        return;
      }
      const api = apiRef.current;
      if (!api) return;
      if (modifier && event.key.toLowerCase() === "s") {
        event.preventDefault();
        event.stopPropagation();
        if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
        window.setTimeout(() => void saveLocally(event.shiftKey), 0);
        return;
      }
      if ((paletteOpen || helpOpen || searchOpen || detailsOpen) && event.key === "Escape") {
        event.preventDefault();
        setPaletteOpen(false);
        setHelpOpen(false);
        setSearchOpen(false);
        setDetailsOpen(false);
        return;
      }
      const id = commandForKeyboardEvent(event, api.getAppState());
      if (!id) return;
      const isGlobal = id === "command-palette" || id === "shortcut-help" || id === "search-map";
      if (!isGlobal && !isMindmapSelection(api)) return;
      event.preventDefault();
      event.stopPropagation();
      executeCommand(id);
    };
    document.addEventListener("keydown", onKeyDown, true);
    return () => document.removeEventListener("keydown", onKeyDown, true);
  }, [detailsOpen, executeCommand, helpOpen, paletteOpen, saveLocally, searchOpen]);

  useEffect(() => {
    const onPaste = (event: ClipboardEvent) => {
      const api = apiRef.current;
      const context = commandContext();
      if (!api || !context || !isMindmapSelection(api) || api.getAppState().editingTextElement) return;
      const target = event.target;
      if (target instanceof HTMLElement && (
        target.isContentEditable
        || target.closest("input, textarea, select, button, [role='textbox'], [contenteditable='true']")
      )) return;
      const text = event.clipboardData?.getData("text/plain") ?? "";
      if (!canPasteMindmapText(text)) return;
      event.preventDefault();
      event.stopPropagation();
      pasteMindmapText(context, text);
    };
    document.addEventListener("paste", onPaste, true);
    return () => document.removeEventListener("paste", onPaste, true);
  }, [commandContext]);

  const scheduleRecovery = useCallback(
    (document: DocumentV3) => {
      if (recoveryTimerRef.current) window.clearTimeout(recoveryTimerRef.current);
      recoveryTimerRef.current = window.setTimeout(() => {
        void putRecoveryDocument(document)
          .then(() => setStatus((current) => (
            current.state === "error" || Date.now() < explicitStatusUntilRef.current
              ? current
              : { message: `Recovery saved · ${formatTime()}`, state: "" }
          )))
          .catch((error) => announce(`Recovery save failed; previous snapshot preserved: ${error.message}`, "error"));
      }, AUTOSAVE_DELAY);
    },
    [announce],
  );

  const chooseSurfaceMode = useCallback((mode: SurfaceMode | null) => {
    const resolved = mode ?? (detectsMobileUse() ? "simple" : "whiteboard");
    if (surfaceModeRef.current === "simple" && resolved === "whiteboard") fitWhiteboardOnMountRef.current = true;
    if (surfaceModeRef.current === "whiteboard") {
      const captured = captureActiveTab();
      if (captured) {
        activeTabRef.current = captured;
        updateCapturedTab(captured);
      }
      if (resolved === "outline" && apiRef.current) {
        const selected = apiRef.current.getAppState().selectedElementIds;
        const node = apiRef.current.getSceneElements().find((element) => selected[element.id] && getMindmapNode(element));
        const nodeId = node && getMindmapNode(node)?.nodeId;
        if (nodeId) setSimpleSelectedNodeId(nodeId);
      }
    }
    if (surfaceModeRef.current === "outline" && resolved === "whiteboard" && apiRef.current) {
      const shape = activeTabRef.current?.document.scene.elements.find((element) => getMindmapNode(element)?.nodeId === simpleSelectedNodeId);
      if (shape) apiRef.current.updateScene({ appState: { selectedElementIds: { [shape.id]: true } }, captureUpdate: CaptureUpdateAction.NEVER });
    }
    if (mode) localStorage.setItem(SURFACE_MODE_KEY, mode);
    else localStorage.removeItem(SURFACE_MODE_KEY);
    setSurfaceOverride(mode);
    announce(`${mode ? "Switched" : "Automatic view switched"} to ${resolved === "simple" ? "Simple map" : resolved === "outline" ? "Outline" : "Whiteboard"}.`);
  }, [announce, captureActiveTab, simpleSelectedNodeId, updateCapturedTab]);

  const applySimpleElements = useCallback((
    elements: readonly OrderedExcalidrawElement[],
    selectedNodeId: string,
    message: string,
  ) => {
    const tab = activeTabRef.current;
    if (!tab) return;
    const document: DocumentV3 = {
      ...tab.document,
      updatedAt: new Date().toISOString(),
      scene: { ...tab.document.scene, elements },
    };
    const validation = validateDocument(document);
    if (!validation.valid) {
      announce(validation.errors[0], "error");
      return;
    }
    const nextTab = { ...tab, document };
    activeTabRef.current = nextTab;
    lastValidElementsRef.current = projectFoldedElements(elements);
    setTabs((current) => current.map((item) => item.key === tab.key ? nextTab : item));
    setSimpleSelectedNodeId(selectedNodeId);
    scheduleRecovery(document);
    announce(message);
  }, [announce, scheduleRecovery]);

  const addSimpleNode = useCallback((nodeId: string, direction: "child" | "sibling") => {
    const tab = activeTabRef.current;
    if (!tab) return;
    const shape = tab.document.scene.elements.find((element) => getMindmapNode(element)?.nodeId === nodeId);
    if (!shape) return;
    const result = addConnectedMindmapNode(tab.document.scene.elements, shape.id, direction);
    if (!result) return;
    applySimpleElements(result.elements, result.nodeId, direction === "child" ? "Child node added." : "Sibling node added.");
  }, [applySimpleElements]);

  const addSimpleChild = useCallback((nodeId: string) => addSimpleNode(nodeId, "child"), [addSimpleNode]);
  const addSimpleSibling = useCallback((nodeId: string) => addSimpleNode(nodeId, "sibling"), [addSimpleNode]);

  const renameSimpleNode = useCallback((nodeId: string, text: string) => {
    const tab = activeTabRef.current;
    if (!tab) return;
    applySimpleElements(renameMindmapNode(tab.document.scene.elements, nodeId, text), nodeId, "Node text updated.");
  }, [applySimpleElements]);

  const deleteSimpleNode = useCallback((nodeId: string) => {
    const tab = activeTabRef.current;
    if (!tab) return;
    const remaining = removeMindmapSubtree(tab.document.scene.elements, nodeId, tab.document.rootNodeId);
    if (!remaining) {
      announce("The central node cannot be deleted.", "error");
      return;
    }
    applySimpleElements(remaining, tab.document.rootNodeId, "Branch deleted and remaining nodes rearranged.");
  }, [announce, applySimpleElements]);

  const toggleSimpleFold = useCallback((nodeId: string) => {
    const tab = activeTabRef.current;
    if (!tab) return;
    const node = tab.document.scene.elements.map(getMindmapNode).find((item) => item?.nodeId === nodeId);
    if (!node) return;
    applySimpleElements(
      setNodesCollapsed(tab.document.scene.elements, [nodeId], !node.collapsed),
      nodeId,
      node.collapsed ? "Branch expanded." : "Branch collapsed.",
    );
  }, [applySimpleElements]);

  const applyOutlineElements = useCallback((elements: readonly OrderedExcalidrawElement[], selectedNodeId: string, message: string) => {
    applySimpleElements(elements, selectedNodeId, message);
    const api = apiRef.current;
    if (!api) return;
    const shape = elements.find((element) => getMindmapNode(element)?.nodeId === selectedNodeId);
    semanticUpdateRef.current = true;
    api.updateScene({ elements: projectFoldedElements(elements), appState: shape ? { selectedElementIds: { [shape.id]: true } } : undefined, captureUpdate: CaptureUpdateAction.IMMEDIATELY });
    semanticUpdateRef.current = false;
  }, [applySimpleElements]);

  const moveOutlineNode = useCallback((nodeId: string, move: "up" | "down" | "indent" | "outdent") => {
    const tab = activeTabRef.current;
    if (!tab) return;
    const elements = moveMindmapNodeInOutline(tab.document.scene.elements, nodeId, move);
    if (!elements) { announce(`Cannot ${move} this node.`, "error"); return; }
    applyOutlineElements(elements, nodeId, `Node ${move === "up" || move === "down" ? `moved ${move}` : move === "indent" ? "indented" : "outdented"}.`);
  }, [announce, applyOutlineElements]);

  const renameOutlineNode = useCallback((nodeId: string, value: string) => {
    const tab = activeTabRef.current;
    if (tab) applyOutlineElements(renameMindmapNode(tab.document.scene.elements, nodeId, value), nodeId, "Node text updated.");
  }, [applyOutlineElements]);

  const deleteOutlineNode = useCallback((nodeId: string) => {
    const tab = activeTabRef.current;
    if (!tab) return;
    const elements = removeMindmapSubtree(tab.document.scene.elements, nodeId, tab.document.rootNodeId);
    if (!elements) { announce("The central node cannot be deleted.", "error"); return; }
    applyOutlineElements(elements, tab.document.rootNodeId, "Branch deleted and remaining nodes rearranged.");
  }, [announce, applyOutlineElements]);

  const toggleOutlineFold = useCallback((nodeId: string) => {
    const tab = activeTabRef.current;
    if (!tab) return;
    const node = tab.document.scene.elements.map(getMindmapNode).find((item) => item?.nodeId === nodeId);
    if (node) applyOutlineElements(setNodesCollapsed(tab.document.scene.elements, [nodeId], !node.collapsed), nodeId, node.collapsed ? "Branch expanded." : "Branch collapsed.");
  }, [applyOutlineElements]);

  const exportOutline = useCallback(() => {
    const tab = activeTabRef.current;
    if (!tab) return;
    const blob = new Blob([outlineMarkdown(tab.document.scene.elements, tab.document.rootNodeId)], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${tab.document.name.replace(/[^a-z0-9_-]+/gi, "-").replace(/^-|-$/g, "") || "outline"}.md`;
    anchor.click();
    URL.revokeObjectURL(url);
    announce("Outline exported as Markdown.");
  }, [announce]);

  const applyNodeDetails = useCallback((content: { notes?: string; url?: string; internalTargetNodeId?: string }) => {
    const tab = activeTabRef.current;
    if (!tab) return;
    applyOutlineElements(
      updateMindmapNodeContent(tab.document.scene.elements, simpleSelectedNodeId, content),
      simpleSelectedNodeId,
      "Node details saved.",
    );
    setDetailsOpen(false);
  }, [applyOutlineElements, simpleSelectedNodeId]);

  const onSceneChange = useCallback(
    (elements: readonly OrderedExcalidrawElement[], appState: AppState, files: BinaryFiles) => {
      const tab = activeTabRef.current;
      const api = apiRef.current;
      if (!tab || !api || semanticUpdateRef.current) return;
      const merged = mergeFoldedScene(tab.document.scene.elements, elements);
      const rootless = normaliseRootlessWhiteboard(merged, tab.document.rootNodeId);
      const normalised = normaliseConnectionBindings(rootless.elements);
      if (normalised.errors.length) {
        semanticUpdateRef.current = true;
        api.updateScene({ elements: lastValidElementsRef.current, captureUpdate: CaptureUpdateAction.NEVER });
        semanticUpdateRef.current = false;
        announce(normalised.errors[0], "error");
        return;
      }
      const document: DocumentV3 = {
        ...tab.document,
        updatedAt: new Date().toISOString(),
        scene: { elements: normalised.elements, appState: cleanPersistedAppState(appState), files },
      };
      const validation = validateDocument(document);
      if (!validation.valid) {
        semanticUpdateRef.current = true;
        api.updateScene({ elements: lastValidElementsRef.current, captureUpdate: CaptureUpdateAction.NEVER });
        semanticUpdateRef.current = false;
        announce(validation.errors[0], "error");
        return;
      }
      lastValidElementsRef.current = projectFoldedElements(normalised.elements);
      if (rootless.changed || normalised.changed) {
        semanticUpdateRef.current = true;
        api.updateScene({ elements: projectFoldedElements(normalised.elements), captureUpdate: CaptureUpdateAction.NEVER });
        semanticUpdateRef.current = false;
      }
      activeTabRef.current = { ...tab, document };
      if (surfaceModeRef.current === "whiteboard") {
        const selectedNode = elements.find((element) => appState.selectedElementIds[element.id] && getMindmapNode(element));
        const selectedNodeId = selectedNode && getMindmapNode(selectedNode)?.nodeId;
        if (selectedNodeId) setSimpleSelectedNodeId((current) => current === selectedNodeId ? current : selectedNodeId);
      }
      scheduleRecovery(document);
    },
    [announce, scheduleRecovery],
  );

  const openDocument = useCallback(
    (id: string) => {
      const storedDocument = savedDocuments.find((item) => item.id === id);
      if (!storedDocument) return;
      const document = prepareDocument(storedDocument);
      const captured = captureActiveTab();
      if (captured) updateCapturedTab(captured);
      const existing = tabsRef.current.find((tab) => tab.document.id === id && tab.persisted);
      if (existing) {
        setActiveKey(existing.key);
        return;
      }
      const tab = { key: createId("tab"), document, persisted: true };
      setTabs((current) => [...current, tab]);
      setActiveKey(tab.key);
      lastValidElementsRef.current = projectFoldedElements(document.scene.elements);
    },
    [captureActiveTab, savedDocuments, updateCapturedTab],
  );

  const newTab = useCallback(() => {
    const captured = captureActiveTab();
    if (captured) updateCapturedTab(captured);
    const tab = { key: createId("tab"), document: prepareDocument(createBlankDocument(`Untitled ${tabsRef.current.length + 1}`)), persisted: false };
    setTabs((current) => [...current, tab]);
    setActiveKey(tab.key);
    lastValidElementsRef.current = projectFoldedElements(tab.document.scene.elements);
  }, [captureActiveTab, updateCapturedTab]);

  const newTemplateTab = useCallback((template: "mindmap" | "brainstorm") => {
    const captured = captureActiveTab();
    if (captured) updateCapturedTab(captured);
    const tab = { key: createId("tab"), document: prepareDocument(createTemplateDocument(template)), persisted: false };
    setTabs((current) => [...current, tab]);
    setActiveKey(tab.key);
    lastValidElementsRef.current = projectFoldedElements(tab.document.scene.elements);
  }, [captureActiveTab, updateCapturedTab]);

  const closeTab = useCallback(
    (key: string) => {
      setTabs((current) => {
        if (current.length === 1) return current;
        const index = current.findIndex((tab) => tab.key === key);
        const next = current.filter((tab) => tab.key !== key);
        if (key === activeKeyRef.current) setActiveKey(next[Math.max(0, index - 1)].key);
        return next;
      });
    },
    [],
  );

  const runExport = useCallback(async () => {
    const api = apiRef.current;
    const tab = activeTabRef.current;
    if (!api || !tab) return;
    try {
      const outcome = await exportScene(api, tab.document.name, exportFormat);
      announce(outcome === "clipboard-download-fallback"
        ? "Clipboard unavailable; PNG downloaded instead."
        : exportFormat === "clipboard" ? "Canvas copied to clipboard." : `${exportFormat.toUpperCase()} export created.`);
    } catch (error) {
      announce(`Export failed: ${error instanceof Error ? error.message : String(error)}`, "error");
    }
  }, [announce, exportFormat]);

  const backupAll = useCallback(async () => {
    const captured = captureActiveTab();
    const documents = await listDocuments();
    if (captured && !documents.some((item) => item.id === captured.document.id)) documents.push(captured.document);
    downloadNativeBackup(documents);
    announce("Native JSON backup downloaded.");
  }, [announce, captureActiveTab]);

  const restoreBackup = useCallback(
    async (file: File) => {
      try {
        if (file.size > 50 * 1024 * 1024) throw new Error("Backup exceeds the 50 MB local limit.");
        const parsed = JSON.parse(await file.text()) as { format?: string; schemaVersion?: number; documents?: DocumentV3[] };
        if (parsed.format !== "offline-mindmap-native-backup" || parsed.schemaVersion !== 3 || !Array.isArray(parsed.documents)) {
          throw new Error("Unsupported native backup format.");
        }
        for (const document of parsed.documents) assertValidDocument(document);
        await putDocuments(parsed.documents);
        await refreshSavedDocuments();
        announce(`Restored ${parsed.documents.length} map(s) from native backup.`);
      } catch (error) {
        announce(`Restore failed; existing maps were preserved: ${error instanceof Error ? error.message : String(error)}`, "error");
      } finally {
        if (fileInputRef.current) fileInputRef.current.value = "";
      }
    },
    [announce, refreshSavedDocuments],
  );

  const filteredCommands = useMemo(() => {
    const query = paletteQuery.trim().toLowerCase();
    return commandRegistry.filter((command) => !query || `${command.label} ${command.keywords} ${command.shortcut}`.toLowerCase().includes(query));
  }, [paletteQuery]);

  const filteredShortcuts = useMemo(() => {
    const query = helpQuery.trim().toLowerCase();
    return commandRegistry.filter((command) => (
      command.shortcut
      && (!query || `${command.label} ${command.keywords} ${command.shortcut}`.toLowerCase().includes(query))
    ));
  }, [helpQuery]);

  const searchRecords = useMemo(
    () => buildSearchRecords(activeTabRef.current?.document.scene.elements ?? []),
    [activeTab, searchRevision],
  );
  const searchResults = useMemo(() => searchMindmap(searchRecords, searchQuery, {
    caseSensitive: searchCaseSensitive,
    wholeWord: searchWholeWord,
    depth: searchDepth === "" ? null : Number(searchDepth),
    visibility: searchVisibility,
    tag: searchTag,
    taskState: searchTaskState,
  }), [searchCaseSensitive, searchDepth, searchQuery, searchRecords, searchTag, searchTaskState, searchVisibility, searchWholeWord]);
  const currentSearchResult = searchResults.length
    ? searchResults[Math.min(searchResultIndex, searchResults.length - 1)]
    : null;

  useEffect(() => {
    setSearchResultIndex(0);
  }, [searchQuery, searchCaseSensitive, searchWholeWord, searchDepth, searchVisibility, searchTag, searchTaskState]);

  useEffect(() => {
    const api = apiRef.current;
    if (!api || surfaceModeRef.current !== "whiteboard") return;
    const ids = searchOpen
      ? Object.fromEntries(searchResults.filter((result) => !result.hidden).map((result) => [result.elementId, true]))
      : {};
    api.updateScene({ appState: { selectedElementIds: ids }, captureUpdate: CaptureUpdateAction.NEVER });
  }, [searchOpen, searchResults]);

  const navigateSearchResult = useCallback((index: number) => {
    if (!searchResults.length) return;
    const nextIndex = (index + searchResults.length) % searchResults.length;
    const result = searchResults[nextIndex];
    setSearchResultIndex(nextIndex);
    setSimpleSelectedNodeId(result.nodeId);
    const tab = activeTabRef.current;
    if (!tab) return;
    const revealed = revealFoldedNode(tab.document.scene.elements, result.nodeId) as readonly OrderedExcalidrawElement[];
    const nextDocument = { ...tab.document, scene: { ...tab.document.scene, elements: revealed } };
    const nextTab = { ...tab, document: nextDocument };
    activeTabRef.current = nextTab;
    setTabs((current) => current.map((item) => item.key === tab.key ? nextTab : item));
    setSearchRevision((current) => current + 1);
    const api = apiRef.current;
    if (surfaceModeRef.current === "whiteboard" && api) {
      const projected = projectFoldedElements(revealed);
      const shape = projected.find((element) => element.id === result.elementId);
      semanticUpdateRef.current = true;
      api.updateScene({
        elements: projected,
        appState: { selectedElementIds: { [result.elementId]: true } },
        captureUpdate: CaptureUpdateAction.NEVER,
      });
      semanticUpdateRef.current = false;
      if (shape) api.scrollToContent([shape], { fitToContent: false, animate: true });
    } else {
      window.setTimeout(() => document.querySelector(`[data-node-id="${CSS.escape(result.nodeId)}"]`)?.scrollIntoView({ block: "center" }), 0);
    }
  }, [searchResults]);

  const replaceSearchResults = useCallback((replaceAll: boolean) => {
    const tab = activeTabRef.current;
    if (!tab || !searchQuery || !searchResults.length) return;
    const targets = replaceAll ? searchResults : [currentSearchResult].filter(Boolean);
    const replacements = new Map<string, string>();
    for (const result of targets) {
      if (!result) continue;
      replacements.set(result.nodeId, replaceTextMatches(result.title, searchQuery, replaceValue, {
        all: replaceAll,
        caseSensitive: searchCaseSensitive,
        wholeWord: searchWholeWord,
      }));
    }
    const elements = replaceMindmapNodeTexts(tab.document.scene.elements, replacements);
    const document = { ...tab.document, updatedAt: new Date().toISOString(), scene: { ...tab.document.scene, elements } };
    const nextTab = { ...tab, document };
    activeTabRef.current = nextTab;
    setTabs((current) => current.map((item) => item.key === tab.key ? nextTab : item));
    setSearchRevision((current) => current + 1);
    scheduleRecovery(document);
    const api = apiRef.current;
    if (surfaceModeRef.current === "whiteboard" && api) {
      semanticUpdateRef.current = true;
      api.updateScene({ elements: projectFoldedElements(elements), captureUpdate: CaptureUpdateAction.IMMEDIATELY });
      semanticUpdateRef.current = false;
    }
    announce(replaceAll ? `Replaced text in ${replacements.size} nodes. Undo restores the whole change.` : "Replaced the current match.");
  }, [announce, currentSearchResult, replaceValue, scheduleRecovery, searchCaseSensitive, searchQuery, searchResults, searchWholeWord]);

  if (!ready || !activeTab) {
    return (
      <main className="loading-screen">
        <div className="loading-mark">M</div>
        <p>{status.message}</p>
      </main>
    );
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand-block">
          <span className="brand-mark">M</span>
          <div><strong>Offline Mind Map</strong><small>Mind map and whiteboard</small></div>
        </div>
        <div className="toolbar-actions" aria-label="Map actions">
          <button type="button" onClick={newTab}>New tab</button>
          <select aria-label="New from template" value="" onChange={(event) => {
            if (event.target.value) newTemplateTab(event.target.value as "mindmap" | "brainstorm");
          }}>
            <option value="">Templates…</option>
            <option value="mindmap">Blank mind map</option>
            <option value="brainstorm">Four-branch brainstorm</option>
          </select>
          <select aria-label="Saved local maps" value="" onChange={(event) => openDocument(event.target.value)}>
            <option value="">Open local map…</option>
            {savedDocuments.map((document) => <option key={document.id} value={document.id}>{document.name}</option>)}
          </select>
          <button type="button" className="primary-action" onClick={() => void saveLocally(false)}>Save locally</button>
          <button type="button" onClick={() => void saveLocally(true)}>Save as copy</button>
          <button type="button" onClick={() => void backupAll()}>Backup JSON</button>
          <button type="button" onClick={() => fileInputRef.current?.click()}>Restore JSON</button>
          <input ref={fileInputRef} hidden type="file" accept="application/json,.json" onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void restoreBackup(file);
          }} />
        </div>
        <div className="surface-switch" role="group" aria-label="Editor view">
          <button type="button" aria-pressed={surfaceOverride === null} onClick={() => chooseSurfaceMode(null)}>Auto</button>
          <button type="button" aria-pressed={surfaceMode === "simple" && surfaceOverride !== null} onClick={() => chooseSurfaceMode("simple")}>Simple</button>
          <button type="button" aria-pressed={surfaceMode === "outline" && surfaceOverride !== null} onClick={() => chooseSurfaceMode("outline")}>Outline</button>
          <button type="button" aria-pressed={surfaceMode === "whiteboard" && surfaceOverride !== null} onClick={() => chooseSurfaceMode("whiteboard")}>Whiteboard</button>
        </div>
        <div className="mode-actions">
          <button type="button" onClick={() => setDetailsOpen(true)}>Details</button>
          <button type="button" onClick={() => setSearchOpen(true)}>Search <kbd>{displayShortcut("Cmd/Ctrl+F")}</kbd></button>
          <button type="button" onClick={() => setPaletteOpen(true)}>Commands <kbd>{displayShortcut("Cmd/Ctrl+K")}</kbd></button>
          <a className="button-link" href="./classic/index.html" onClick={() => localStorage.setItem(EDITOR_MODE_KEY, "classic")}>Classic recovery</a>
        </div>
      </header>

      <nav className="tab-strip" aria-label="Open maps">
        {tabs.map((tab) => (
          <button type="button" key={tab.key} className={tab.key === activeKey ? "tab active" : "tab"} onClick={() => {
            const captured = captureActiveTab();
            if (captured) updateCapturedTab(captured);
            setActiveKey(tab.key);
            lastValidElementsRef.current = projectFoldedElements(tab.document.scene.elements);
          }}>
            <span>{tab.document.name}</span>{!tab.persisted ? <i>Draft</i> : null}
            {tabs.length > 1 ? <b role="button" aria-label={`Close ${tab.document.name}`} onClick={(event) => { event.stopPropagation(); closeTab(tab.key); }}>×</b> : null}
          </button>
        ))}
        <span className={`status ${status.state}`} role="status" aria-live="polite">{status.message}</span>
      </nav>

      {surfaceMode !== "simple" ? (
        <>
        <section className={surfaceMode === "outline" ? "workspace whiteboard-workspace view-hidden" : "workspace whiteboard-workspace"} aria-hidden={surfaceMode === "outline"}>
          <aside className="mindmap-rail" aria-label="Mind-map tools">
            <div className="rail-heading"><span>Mind-map mode</span><button type="button" onClick={() => setHelpOpen(true)} aria-label="Shortcut help">?</button></div>
            <button type="button" onClick={() => executeCommand("new-child")}><strong>Child node</strong><kbd>Tab</kbd></button>
            <button type="button" onClick={() => executeCommand("new-sibling")}><strong>Sibling node</strong><kbd>{displayShortcut("Cmd/Ctrl+Enter")}</kbd></button>
            <button type="button" onClick={() => executeCommand("add-relationship")}><strong>Relationship</strong><span>2 selected</span></button>
            <button type="button" onClick={() => executeCommand("reflow-map")}><strong>Rearrange map</strong><span>Fix spacing</span></button>
            <button type="button" onClick={() => executeCommand("toggle-fold")}><strong>Fold branch</strong><span>Hide/show</span></button>
            <button type="button" onClick={() => executeCommand("duplicate-subtree")}><strong>Duplicate branch</strong><kbd>{displayShortcut("Cmd/Ctrl+D")}</kbd></button>
            <button type="button" onClick={() => executeCommand("delete-subtree")}><strong>Delete branch</strong><kbd>Del</kbd></button>
            <div className="rail-note"><b>Fast mapping</b><p>Enter commits text. Cmd/Ctrl+Enter adds a sibling; Cmd/Ctrl + arrow grows a branch.</p></div>
          </aside>

          <div className="canvas-stage">
            <Excalidraw
              key={activeTab.key}
              excalidrawAPI={(api) => {
                apiRef.current = api;
                lastValidElementsRef.current = projectFoldedElements(activeTab.document.scene.elements);
                fitWhiteboardOnMountRef.current = false;
                void getLibrary().then((library) => library && api.updateLibrary({ libraryItems: library as LibraryItems }));
              }}
              initialData={{
                elements: projectFoldedElements(activeTab.document.scene.elements),
                appState: { ...activeTab.document.scene.appState, name: activeTab.document.name },
                files: activeTab.document.scene.files,
                scrollToContent: fitWhiteboardOnMountRef.current,
              }}
              onChange={onSceneChange}
              onLibraryChange={(items) => putLibrary(items)}
              autoFocus
              handleKeyboardGlobally
              gridModeEnabled={Boolean(activeTab.document.scene.appState.gridSize)}
              objectsSnapModeEnabled
              aiEnabled={false}
              UIOptions={{
                canvasActions: {
                  saveToActiveFile: false,
                  loadScene: false,
                  export: false,
                  saveAsImage: false,
                  toggleTheme: true,
                  clearCanvas: true,
                },
                tools: { image: true },
              }}
            >
              <MainMenu>
                <MainMenu.DefaultItems.ToggleTheme />
                <MainMenu.DefaultItems.ChangeCanvasBackground />
                <MainMenu.DefaultItems.ClearCanvas />
                <MainMenu.Separator />
                <MainMenu.Item onSelect={() => void saveLocally(false)}>Save locally</MainMenu.Item>
                <MainMenu.Item onSelect={() => void saveLocally(true)}>Save as copy</MainMenu.Item>
                <MainMenu.Item onSelect={() => setPaletteOpen(true)}>Command palette</MainMenu.Item>
                <MainMenu.Item onSelect={() => setSearchOpen(true)}>Search and replace map</MainMenu.Item>
                <MainMenu.Item onSelect={() => setHelpOpen(true)}>Shortcut reference</MainMenu.Item>
                <MainMenu.Separator />
                <MainMenu.Item onSelect={() => { window.location.href = "./classic/index.html"; }}>Classic recovery editor</MainMenu.Item>
              </MainMenu>
              <DefaultSidebar />
            </Excalidraw>
          </div>

          <aside className="export-rail" aria-label="Export tools">
            <div><span className="eyebrow">LOCAL EXPORT</span><h2>Take it with you</h2><p>Images, native files and backups are generated entirely on this device.</p></div>
            <label>Format<select value={exportFormat} onChange={(event) => setExportFormat(event.target.value as ExportFormat)}>
              <option value="png">PNG image</option><option value="svg">SVG vector</option><option value="pdf">PDF document</option>
              <option value="excalidraw">Native Excalidraw JSON</option><option value="clipboard">Copy PNG to clipboard</option>
            </select></label>
            <button type="button" className="export-button" onClick={() => void runExport()}>Export {exportFormat === "clipboard" ? "to clipboard" : exportFormat.toUpperCase()}</button>
            <div className="privacy-card"><span>●</span><div><strong>Private by design</strong><p>No cloud, telemetry or CDN requests.</p></div></div>
            <small>Build {__SOURCE_SHA__.slice(0, 8)}</small>
          </aside>
        </section>
        {surfaceMode === "outline" ? <section className="workspace outline-workspace">
          <OutlineView
            elements={activeTab.document.scene.elements}
            rootNodeId={activeTab.document.rootNodeId}
            selectedNodeId={simpleSelectedNodeId}
            onSelect={setSimpleSelectedNodeId}
            onRename={renameOutlineNode}
            onMove={moveOutlineNode}
            onDelete={deleteOutlineNode}
            onToggleFold={toggleOutlineFold}
            onExport={exportOutline}
          />
        </section> : null}
        </>
      ) : (
        <section className="workspace simple-workspace">
          <SimpleMindmap
            elements={activeTab.document.scene.elements}
            rootNodeId={activeTab.document.rootNodeId}
            selectedNodeId={simpleSelectedNodeId}
            onSelect={setSimpleSelectedNodeId}
            onRename={renameSimpleNode}
            onAddChild={addSimpleChild}
            onAddSibling={addSimpleSibling}
            onDelete={deleteSimpleNode}
            onToggleFold={toggleSimpleFold}
          />
        </section>
      )}

      {paletteOpen ? <div className="modal-backdrop" role="presentation" onMouseDown={() => setPaletteOpen(false)}>
        <section className="command-dialog" role="dialog" aria-modal="true" aria-label="Command palette" onMouseDown={(event) => event.stopPropagation()}>
          <input autoFocus placeholder="Search commands…" value={paletteQuery} onChange={(event) => setPaletteQuery(event.target.value)} />
          <div className="command-list">{filteredCommands.map((command) => <button type="button" key={command.id} onClick={() => { executeCommand(command.id); setPaletteOpen(false); }}><span>{command.label}<small>{command.keywords}</small></span><kbd>{displayShortcut(command.shortcut)}</kbd></button>)}</div>
        </section>
      </div> : null}

      {helpOpen ? <div className="modal-backdrop" role="presentation" onMouseDown={() => setHelpOpen(false)}>
        <section className="shortcut-dialog" role="dialog" aria-modal="true" aria-label="Shortcut reference" onMouseDown={(event) => event.stopPropagation()}>
          <header><div><span className="eyebrow">KEYBOARD-FIRST</span><h2>Shortcut reference</h2></div><button type="button" onClick={() => setHelpOpen(false)}>Close</button></header>
          <input autoFocus aria-label="Search shortcuts" placeholder="Search shortcuts…" value={helpQuery} onChange={(event) => setHelpQuery(event.target.value)} />
          <div>{filteredShortcuts.map((command) => <p key={command.id}><span>{command.label}</span><kbd>{displayShortcut(command.shortcut)}</kbd></p>)}</div>
          <footer>Excalidraw tools: V select · R rectangle · D diamond · O ellipse · A arrow · L line · P freehand · T text · E eraser</footer>
        </section>
      </div> : null}

      {searchOpen ? <div className="modal-backdrop search-backdrop" role="presentation" onMouseDown={() => setSearchOpen(false)}>
        <section className="search-dialog" role="dialog" aria-modal="true" aria-label="Search and replace map" onMouseDown={(event) => event.stopPropagation()}>
          <header>
            <div><span className="eyebrow">MAP INDEX</span><h2>Search and replace</h2></div>
            <button type="button" onClick={() => setSearchOpen(false)}>Close</button>
          </header>
          <div className="search-primary">
            <input autoFocus aria-label="Search map" placeholder="Search titles, notes, links and tags…" value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} />
            <span role="status" aria-live="polite">{searchResults.length ? `${Math.min(searchResultIndex + 1, searchResults.length)} of ${searchResults.length}` : "No matches"}</span>
            <button type="button" disabled={!searchResults.length} onClick={() => navigateSearchResult(searchResultIndex - 1)} aria-label="Previous match">↑</button>
            <button type="button" disabled={!searchResults.length} onClick={() => navigateSearchResult(searchResultIndex + 1)} aria-label="Next match">↓</button>
          </div>
          <div className="search-options">
            <label><input type="checkbox" checked={searchCaseSensitive} onChange={(event) => setSearchCaseSensitive(event.target.checked)} /> Match case</label>
            <label><input type="checkbox" checked={searchWholeWord} onChange={(event) => setSearchWholeWord(event.target.checked)} /> Whole word</label>
            <label>Depth <input type="number" min="0" placeholder="Any" value={searchDepth} onChange={(event) => setSearchDepth(event.target.value)} /></label>
            <label>Visibility <select value={searchVisibility} onChange={(event) => setSearchVisibility(event.target.value)}><option value="all">All nodes</option><option value="visible">Visible only</option><option value="hidden">Collapsed only</option></select></label>
            <label>Tag <input placeholder="Any tag" value={searchTag} onChange={(event) => setSearchTag(event.target.value)} /></label>
            <label>Task <select value={searchTaskState} onChange={(event) => setSearchTaskState(event.target.value)}><option value="all">Any task state</option><option value="none">Not a task</option><option value="open">Open</option><option value="done">Done</option></select></label>
          </div>
          <div className="search-result-list" aria-label="Search results">
            {searchResults.slice(0, 100).map((result, index) => <button type="button" className={index === searchResultIndex ? "active" : ""} key={result.nodeId} onClick={() => navigateSearchResult(index)}><span>{result.title}<small>Depth {result.depth}{result.hidden ? " · Hidden in collapsed branch" : ""}</small></span><b>{result.hidden ? "Reveal" : "Go"}</b></button>)}
            {searchResults.length > 100 ? <p>Showing the first 100 of {searchResults.length} matches. Next and previous still navigate every result.</p> : null}
          </div>
          <div className="replace-row">
            <input aria-label="Replacement text" placeholder="Replace title text with…" value={replaceValue} onChange={(event) => setReplaceValue(event.target.value)} />
            <button type="button" disabled={!currentSearchResult} onClick={() => replaceSearchResults(false)}>Replace</button>
            <button type="button" className="primary-action" disabled={!searchResults.length} onClick={() => replaceSearchResults(true)}>Replace all</button>
          </div>
          <footer>Search never changes the map. Replacement only runs when you confirm it; Replace all is a single undo step.</footer>
        </section>
      </div> : null}

      {detailsOpen ? <NodeDetailsDialog
        elements={activeTab.document.scene.elements}
        nodeId={simpleSelectedNodeId}
        onApply={applyNodeDetails}
        onClose={() => setDetailsOpen(false)}
        announce={announce}
      /> : null}

      {nameRequest ? <div className="modal-backdrop" role="presentation">
        <form className="name-dialog" role="dialog" aria-modal="true" aria-label={nameRequest.copy ? "Save copy as" : "Save map locally"} onSubmit={(event) => {
          event.preventDefault();
          const data = new FormData(event.currentTarget);
          resolveMapName(String(data.get("mapName") || "").trim() || nameRequest.value);
        }}>
          <span className="eyebrow">LOCAL ONLY</span>
          <h2>{nameRequest.copy ? "Name this copy" : "Name this map"}</h2>
          <p>{nameRequest.copy ? "A separate map ID will be created." : "You will only be asked on the first save."}</p>
          <input autoFocus name="mapName" defaultValue={nameRequest.value} aria-label="Map name" />
          <div><button type="button" onClick={() => resolveMapName(null)}>Cancel</button><button type="submit" className="primary-action">{nameRequest.copy ? "Save copy" : "Save locally"}</button></div>
        </form>
      </div> : null}
    </main>
  );
}
