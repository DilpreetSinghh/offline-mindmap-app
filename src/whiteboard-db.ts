import type { AppState, BinaryFileData, BinaryFiles, LibraryItems } from "@excalidraw/excalidraw/types";
import type { OrderedExcalidrawElement } from "@excalidraw/excalidraw/element/types";

export const WHITEBOARD_DB_NAME = "offline-whiteboard-v1";
export const WHITEBOARD_DB_VERSION = 1;
export const DRAWINGS_STORE = "drawings";
export const REVISIONS_STORE = "revisions";
export const ASSETS_STORE = "assets";
export const WORKSPACE_STORE = "workspace";

export type DrawingRecord = {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  latestRevisionId: string | null;
};

export type BinaryAssetReference = { fileId: string; assetId: string };

export type RevisionRecord = {
  id: string;
  drawingId: string;
  createdAt: number;
  scene: { elements: readonly OrderedExcalidrawElement[]; appState: Partial<AppState> };
  contentHash: string;
  binaryAssetReferences: BinaryAssetReference[];
  size: number;
};

export type AssetRecord = {
  id: string;
  data: BinaryFileData;
  size: number;
};

export type WorkspaceMeta = {
  key: "workspace";
  activeDrawingId: string | null;
  libraryItems: LibraryItems;
  storagePolicy: {
    revisionsEnabled: boolean;
    warning: string | null;
    persistRequested: boolean;
    lastQuotaCheck: number | null;
  };
};

export type WhiteboardScene = {
  elements: readonly OrderedExcalidrawElement[];
  appState: Partial<AppState>;
  files: BinaryFiles;
};

const DEFAULT_META: WorkspaceMeta = {
  key: "workspace",
  activeDrawingId: null,
  libraryItems: [],
  storagePolicy: {
    revisionsEnabled: true,
    warning: null,
    persistRequested: false,
    lastQuotaCheck: null,
  },
};

function requestValue<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("IndexedDB request failed."));
  });
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error("IndexedDB transaction failed."));
    transaction.onabort = () => reject(transaction.error ?? new Error("IndexedDB transaction aborted."));
  });
}

export function openWhiteboardDatabase(name = WHITEBOARD_DB_NAME): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(name, WHITEBOARD_DB_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(DRAWINGS_STORE)) {
        database.createObjectStore(DRAWINGS_STORE, { keyPath: "id" });
      }
      if (!database.objectStoreNames.contains(REVISIONS_STORE)) {
        const revisions = database.createObjectStore(REVISIONS_STORE, { keyPath: "id" });
        revisions.createIndex("drawingId", "drawingId");
        revisions.createIndex("createdAt", "createdAt");
      }
      if (!database.objectStoreNames.contains(ASSETS_STORE)) {
        database.createObjectStore(ASSETS_STORE, { keyPath: "id" });
      }
      if (!database.objectStoreNames.contains(WORKSPACE_STORE)) {
        database.createObjectStore(WORKSPACE_STORE, { keyPath: "key" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Unable to open browser drawing storage."));
  });
}

function uuid(): string {
  return crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function cleanAppState(appState: Partial<AppState>): Partial<AppState> {
  const {
    collaborators: _collaborators,
    contextMenu: _contextMenu,
    openDialog: _openDialog,
    openMenu: _openMenu,
    openPopup: _openPopup,
    toast: _toast,
    editingTextElement: _editingTextElement,
    editingLinearElement: _editingLinearElement,
    selectedElementIds: _selectedElementIds,
    selectedGroupIds: _selectedGroupIds,
    ...persisted
  } = appState;
  return persisted;
}

function stable(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, stable(item)]));
  }
  return value;
}

export function stableStringify(value: unknown): string {
  return JSON.stringify(stable(value));
}

export async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function assetRecord(file: BinaryFileData): Promise<AssetRecord> {
  const id = await sha256(file.dataURL);
  return { id, data: structuredClone(file), size: new Blob([file.dataURL]).size };
}

export async function cleanScene(scene: WhiteboardScene): Promise<{
  scene: RevisionRecord["scene"];
  contentHash: string;
  assets: AssetRecord[];
  references: BinaryAssetReference[];
  size: number;
}> {
  const assets = await Promise.all(Object.values(scene.files).map(assetRecord));
  const references = Object.keys(scene.files).map((fileId, index) => ({ fileId, assetId: assets[index].id }));
  const cleaned = {
    elements: structuredClone(scene.elements),
    appState: structuredClone(cleanAppState(scene.appState)),
  };
  const serialised = stableStringify({ ...cleaned, references });
  return {
    scene: cleaned,
    contentHash: await sha256(serialised),
    assets,
    references,
    size: new Blob([serialised]).size + assets.reduce((total, asset) => total + asset.size, 0),
  };
}

export async function getWorkspaceMeta(database: IDBDatabase): Promise<WorkspaceMeta> {
  const transaction = database.transaction(WORKSPACE_STORE, "readonly");
  const record = await requestValue(transaction.objectStore(WORKSPACE_STORE).get("workspace"));
  return record ? structuredClone(record as WorkspaceMeta) : structuredClone(DEFAULT_META);
}

export async function putWorkspaceMeta(database: IDBDatabase, meta: WorkspaceMeta): Promise<void> {
  const transaction = database.transaction(WORKSPACE_STORE, "readwrite");
  transaction.objectStore(WORKSPACE_STORE).put(structuredClone(meta));
  await transactionDone(transaction);
}

export async function createDrawing(database: IDBDatabase, name = "Untitled drawing"): Promise<DrawingRecord> {
  const now = Date.now();
  const drawing: DrawingRecord = { id: uuid(), name, createdAt: now, updatedAt: now, latestRevisionId: null };
  const meta = await getWorkspaceMeta(database);
  const transaction = database.transaction([DRAWINGS_STORE, WORKSPACE_STORE], "readwrite");
  transaction.objectStore(DRAWINGS_STORE).add(drawing);
  transaction.objectStore(WORKSPACE_STORE).put({ ...meta, activeDrawingId: drawing.id });
  await transactionDone(transaction);
  return drawing;
}

export async function listDrawings(database: IDBDatabase): Promise<DrawingRecord[]> {
  const transaction = database.transaction(DRAWINGS_STORE, "readonly");
  const drawings = await requestValue(transaction.objectStore(DRAWINGS_STORE).getAll()) as DrawingRecord[];
  return drawings.sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function getDrawing(database: IDBDatabase, id: string): Promise<DrawingRecord | null> {
  const transaction = database.transaction(DRAWINGS_STORE, "readonly");
  return (await requestValue(transaction.objectStore(DRAWINGS_STORE).get(id)) as DrawingRecord | undefined) ?? null;
}

export async function renameDrawing(database: IDBDatabase, id: string, name: string): Promise<void> {
  const drawing = await getDrawing(database, id);
  if (!drawing) throw new Error("Drawing not found.");
  const transaction = database.transaction(DRAWINGS_STORE, "readwrite");
  transaction.objectStore(DRAWINGS_STORE).put({ ...drawing, name: name.trim() || drawing.name, updatedAt: Date.now() });
  await transactionDone(transaction);
}

export async function listRevisions(database: IDBDatabase, drawingId: string): Promise<RevisionRecord[]> {
  const transaction = database.transaction(REVISIONS_STORE, "readonly");
  const records = await requestValue(transaction.objectStore(REVISIONS_STORE).index("drawingId").getAll(drawingId)) as RevisionRecord[];
  return records.sort((a, b) => b.createdAt - a.createdAt);
}

export async function getRevision(database: IDBDatabase, id: string): Promise<RevisionRecord | null> {
  const transaction = database.transaction(REVISIONS_STORE, "readonly");
  return (await requestValue(transaction.objectStore(REVISIONS_STORE).get(id)) as RevisionRecord | undefined) ?? null;
}

export async function hydrateRevision(database: IDBDatabase, revision: RevisionRecord): Promise<WhiteboardScene> {
  const transaction = database.transaction(ASSETS_STORE, "readonly");
  const records = await Promise.all(revision.binaryAssetReferences.map((reference) => requestValue(transaction.objectStore(ASSETS_STORE).get(reference.assetId)))) as Array<AssetRecord | undefined>;
  const files: BinaryFiles = {};
  records.forEach((record, index) => {
    if (record) files[revision.binaryAssetReferences[index].fileId] = record.data;
  });
  return { ...structuredClone(revision.scene), files };
}

export async function createRevision(database: IDBDatabase, drawingId: string, input: WhiteboardScene, force = false): Promise<RevisionRecord | null> {
  const drawing = await getDrawing(database, drawingId);
  if (!drawing) throw new Error("Drawing not found.");
  const cleaned = await cleanScene(input);
  if (drawing.latestRevisionId) {
    const latest = await getRevision(database, drawing.latestRevisionId);
    if (!force && latest?.contentHash === cleaned.contentHash) return null;
  }
  const revision: RevisionRecord = {
    id: uuid(), drawingId, createdAt: Date.now(), scene: cleaned.scene,
    contentHash: cleaned.contentHash, binaryAssetReferences: cleaned.references, size: cleaned.size,
  };
  const transaction = database.transaction([DRAWINGS_STORE, REVISIONS_STORE, ASSETS_STORE], "readwrite");
  const done = transactionDone(transaction);
  transaction.objectStore(REVISIONS_STORE).add(revision);
  for (const asset of cleaned.assets) transaction.objectStore(ASSETS_STORE).put(asset);
  transaction.objectStore(DRAWINGS_STORE).put({ ...drawing, updatedAt: revision.createdAt, latestRevisionId: revision.id });
  await done;
  return revision;
}

export async function restoreRevision(database: IDBDatabase, drawingId: string, revisionId: string): Promise<RevisionRecord> {
  const historical = await getRevision(database, revisionId);
  if (!historical || historical.drawingId !== drawingId) throw new Error("Revision not found.");
  const scene = await hydrateRevision(database, historical);
  const restored = await createRevision(database, drawingId, scene, true);
  if (!restored) throw new Error("Unable to append restored revision.");
  return restored;
}

export async function duplicateDrawing(database: IDBDatabase, sourceId: string): Promise<DrawingRecord> {
  const source = await getDrawing(database, sourceId);
  if (!source) throw new Error("Drawing not found.");
  const duplicate = await createDrawing(database, `${source.name} copy`);
  if (source.latestRevisionId) {
    const revision = await getRevision(database, source.latestRevisionId);
    if (revision) await createRevision(database, duplicate.id, await hydrateRevision(database, revision));
  }
  return (await getDrawing(database, duplicate.id)) ?? duplicate;
}

export function assetIdsReferencedBy(revisions: RevisionRecord[]): Set<string> {
  return new Set(revisions.flatMap((revision) => revision.binaryAssetReferences.map((reference) => reference.assetId)));
}

export async function garbageCollectAssets(database: IDBDatabase): Promise<number> {
  const transaction = database.transaction([REVISIONS_STORE, ASSETS_STORE], "readwrite");
  const revisions = await requestValue(transaction.objectStore(REVISIONS_STORE).getAll()) as RevisionRecord[];
  const assets = await requestValue(transaction.objectStore(ASSETS_STORE).getAll()) as AssetRecord[];
  const referenced = assetIdsReferencedBy(revisions);
  let deleted = 0;
  for (const asset of assets) {
    if (!referenced.has(asset.id)) {
      transaction.objectStore(ASSETS_STORE).delete(asset.id);
      deleted += 1;
    }
  }
  await transactionDone(transaction);
  return deleted;
}

export async function deleteDrawing(database: IDBDatabase, id: string): Promise<void> {
  const revisions = await listRevisions(database, id);
  const meta = await getWorkspaceMeta(database);
  const transaction = database.transaction([DRAWINGS_STORE, REVISIONS_STORE, WORKSPACE_STORE], "readwrite");
  transaction.objectStore(DRAWINGS_STORE).delete(id);
  for (const revision of revisions) transaction.objectStore(REVISIONS_STORE).delete(revision.id);
  if (meta.activeDrawingId === id) transaction.objectStore(WORKSPACE_STORE).put({ ...meta, activeDrawingId: null });
  await transactionDone(transaction);
  await garbageCollectAssets(database);
}

export function selectPrunableRevisions(drawings: DrawingRecord[], revisions: RevisionRecord[], minimumPerDrawing = 25): RevisionRecord[] {
  const latestIds = new Set(drawings.map((drawing) => drawing.latestRevisionId).filter(Boolean));
  const byDrawing = new Map<string, RevisionRecord[]>();
  for (const revision of revisions) byDrawing.set(revision.drawingId, [...(byDrawing.get(revision.drawingId) ?? []), revision]);
  const candidates: RevisionRecord[] = [];
  for (const records of byDrawing.values()) {
    records.sort((a, b) => b.createdAt - a.createdAt);
    candidates.push(...records.slice(minimumPerDrawing).filter((revision) => !latestIds.has(revision.id)));
  }
  return candidates.sort((a, b) => a.createdAt - b.createdAt);
}

export async function pruneForQuota(database: IDBDatabase, usage: number, quota: number): Promise<{ deleted: number; projectedUsage: number }> {
  if (!quota || usage / quota < 0.7) return { deleted: 0, projectedUsage: usage };
  const [drawings, allRevisions] = await Promise.all([
    listDrawings(database),
    requestValue(openRevisionRead(database)),
  ]) as [DrawingRecord[], RevisionRecord[]];
  const candidates = selectPrunableRevisions(drawings, allRevisions);
  let projectedUsage = usage;
  let deleted = 0;
  const transaction = database.transaction(REVISIONS_STORE, "readwrite");
  for (const revision of candidates) {
    if (projectedUsage / quota < 0.6) break;
    transaction.objectStore(REVISIONS_STORE).delete(revision.id);
    projectedUsage -= revision.size;
    deleted += 1;
  }
  await transactionDone(transaction);
  if (deleted) await garbageCollectAssets(database);
  return { deleted, projectedUsage };
}

function openRevisionRead(database: IDBDatabase): IDBRequest<RevisionRecord[]> {
  return database.transaction(REVISIONS_STORE, "readonly").objectStore(REVISIONS_STORE).getAll();
}
