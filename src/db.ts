import type { BinaryFileData, BinaryFiles } from "@excalidraw/excalidraw/types";
import { assertValidDocument, compareMigration, migrateLegacyState } from "./document";
import type { DocumentV3, LegacyMap, LegacyState, OfflineAttachmentData } from "./types";

const DB_NAME = "offline-mindmap-v3";
const DB_VERSION = 1;
const DOCUMENT_STORE = "documents";
const ASSET_STORE = "assets";
const META_STORE = "meta";
const RECOVERY_KEY = "workspace-recovery";
const MIGRATION_KEY = "schema-2-migration-complete";
const LEGACY_MAPS_KEY = "offline-mindmap-maps-v1";
const LEGACY_WORKSPACE_KEY = "offline-mindmap-workspace-v2";

type BinaryAssetRecord = BinaryFileData & { documentId: string; assetKind?: "binary" };
type OfflineAssetRecord = OfflineAttachmentData & { documentId: string; assetKind: "attachment" };
type AssetRecord = BinaryAssetRecord | OfflineAssetRecord;
type MetaRecord = { key: string; value: unknown };

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
    transaction.onabort = () => reject(transaction.error ?? new Error("IndexedDB transaction was aborted."));
  });
}

export async function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(DOCUMENT_STORE)) database.createObjectStore(DOCUMENT_STORE, { keyPath: "id" });
      if (!database.objectStoreNames.contains(ASSET_STORE)) database.createObjectStore(ASSET_STORE, { keyPath: ["documentId", "id"] });
      if (!database.objectStoreNames.contains(META_STORE)) database.createObjectStore(META_STORE, { keyPath: "key" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Unable to open local database."));
  });
}

function assetRange(documentId: string): IDBKeyRange {
  return IDBKeyRange.bound([documentId, ""], [documentId, "\uffff"]);
}

function assetRecords(document: DocumentV3): AssetRecord[] {
  const files = Object.values(document.scene.files).map((file) => ({ ...file, documentId: document.id, assetKind: "binary" as const }));
  const attachments = Object.values(document.attachments ?? {}).map((attachment) => ({ ...attachment, documentId: document.id, assetKind: "attachment" as const }));
  return [...files, ...attachments];
}

function documentWithoutAssetPayloads(document: DocumentV3): DocumentV3 {
  return {
    ...document,
    attachments: {},
    scene: { ...document.scene, files: {} },
  };
}

function hydrateDocument(document: DocumentV3, records: AssetRecord[]): DocumentV3 {
  const files: BinaryFiles = { ...document.scene.files };
  const attachments: Record<string, OfflineAttachmentData> = { ...(document.attachments ?? {}) };
  for (const record of records) {
    const { documentId: _documentId, assetKind, ...data } = record;
    if (assetKind === "attachment") attachments[record.id] = data as OfflineAttachmentData;
    else files[record.id] = data as BinaryFileData;
  }
  return { ...document, attachments, scene: { ...document.scene, files } };
}

function replaceAssetRecords(store: IDBObjectStore, document: DocumentV3): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = store.openCursor(assetRange(document.id));
    request.onerror = () => reject(request.error ?? new Error("Unable to replace local attachment records."));
    request.onsuccess = () => {
      const cursor = request.result;
      if (cursor) {
        cursor.delete();
        cursor.continue();
        return;
      }
      for (const record of assetRecords(document)) store.put(record);
      resolve();
    };
  });
}

export async function putDocument(document: DocumentV3): Promise<DocumentV3> {
  assertValidDocument(document);
  const database = await openDatabase();
  const transaction = database.transaction([DOCUMENT_STORE, ASSET_STORE], "readwrite");
  const done = transactionDone(transaction);
  transaction.objectStore(DOCUMENT_STORE).put(structuredClone(documentWithoutAssetPayloads(document)));
  await replaceAssetRecords(transaction.objectStore(ASSET_STORE), document);
  await done;
  const saved = await getDocument(document.id);
  if (!saved) throw new Error("Local save verification failed.");
  assertValidDocument(saved);
  return saved;
}

export async function putDocuments(documents: DocumentV3[]): Promise<DocumentV3[]> {
  for (const document of documents) assertValidDocument(document);
  const database = await openDatabase();
  const transaction = database.transaction([DOCUMENT_STORE, ASSET_STORE], "readwrite");
  const done = transactionDone(transaction);
  const documentStore = transaction.objectStore(DOCUMENT_STORE);
  const assetStore = transaction.objectStore(ASSET_STORE);
  for (const document of documents) {
    documentStore.put(structuredClone(documentWithoutAssetPayloads(document)));
  }
  await Promise.all(documents.map((document) => replaceAssetRecords(assetStore, document)));
  await done;
  const verified = await Promise.all(documents.map((document) => getDocument(document.id)));
  for (const document of verified) {
    if (!document) throw new Error("Native backup read-back verification failed.");
    assertValidDocument(document);
  }
  return verified as DocumentV3[];
}

export async function getDocument(id: string): Promise<DocumentV3 | null> {
  const database = await openDatabase();
  const transaction = database.transaction([DOCUMENT_STORE, ASSET_STORE], "readonly");
  const [value, records] = await Promise.all([
    requestValue(transaction.objectStore(DOCUMENT_STORE).get(id)),
    requestValue(transaction.objectStore(ASSET_STORE).getAll(assetRange(id))),
  ]);
  const document = value as DocumentV3 | undefined;
  return document ? hydrateDocument(document, records as AssetRecord[]) : null;
}

export async function listDocuments(): Promise<DocumentV3[]> {
  const database = await openDatabase();
  const transaction = database.transaction([DOCUMENT_STORE, ASSET_STORE], "readonly");
  const [values, assets] = await Promise.all([
    requestValue(transaction.objectStore(DOCUMENT_STORE).getAll()),
    requestValue(transaction.objectStore(ASSET_STORE).getAll()),
  ]) as [DocumentV3[], AssetRecord[]];
  const assetsByDocument = new Map<string, AssetRecord[]>();
  for (const record of assets) assetsByDocument.set(record.documentId, [...(assetsByDocument.get(record.documentId) ?? []), record]);
  return values.map((document) => hydrateDocument(document, assetsByDocument.get(document.id) ?? [])).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function putRecoveryDocument(document: DocumentV3): Promise<void> {
  assertValidDocument(document);
  const database = await openDatabase();
  const transaction = database.transaction(META_STORE, "readwrite");
  transaction.objectStore(META_STORE).put({ key: RECOVERY_KEY, value: structuredClone(document) } satisfies MetaRecord);
  await transactionDone(transaction);
}

export async function getRecoveryDocument(): Promise<DocumentV3 | null> {
  const database = await openDatabase();
  const transaction = database.transaction(META_STORE, "readonly");
  const record = (await requestValue(transaction.objectStore(META_STORE).get(RECOVERY_KEY))) as MetaRecord | undefined;
  return (record?.value as DocumentV3 | undefined) ?? null;
}

export async function putLibrary(libraryItems: unknown): Promise<void> {
  await putMeta("excalidraw-library", structuredClone(libraryItems));
}

export async function getLibrary(): Promise<unknown> {
  return getMeta("excalidraw-library");
}

async function getMeta(key: string): Promise<unknown> {
  const database = await openDatabase();
  const transaction = database.transaction(META_STORE, "readonly");
  const record = (await requestValue(transaction.objectStore(META_STORE).get(key))) as MetaRecord | undefined;
  return record?.value;
}

async function putMeta(key: string, value: unknown): Promise<void> {
  const database = await openDatabase();
  const transaction = database.transaction(META_STORE, "readwrite");
  transaction.objectStore(META_STORE).put({ key, value } satisfies MetaRecord);
  await transactionDone(transaction);
}

function readLegacyCandidates(): Array<{ id: string; name: string; state: LegacyState }> {
  const candidates: Array<{ id: string; name: string; state: LegacyState }> = [];
  const seen = new Set<string>();
  try {
    const maps = JSON.parse(localStorage.getItem(LEGACY_MAPS_KEY) || "[]") as LegacyMap[];
    for (const map of maps) {
      if (!map?.id || !map?.data || seen.has(map.id)) continue;
      seen.add(map.id);
      candidates.push({ id: map.id, name: map.name, state: map.data });
    }
  } catch {
    // A corrupt legacy collection remains untouched for classic recovery.
  }
  try {
    const workspace = JSON.parse(localStorage.getItem(LEGACY_WORKSPACE_KEY) || "null") as
      | { tabs?: Array<{ id?: string | null; name?: string; state?: LegacyState }> }
      | null;
    for (const [index, tab] of (workspace?.tabs ?? []).entries()) {
      if (!tab?.state) continue;
      const id = tab.id || `workspace-${index + 1}`;
      if (seen.has(id)) continue;
      seen.add(id);
      candidates.push({ id, name: tab.name || `Recovered tab ${index + 1}`, state: tab.state });
    }
  } catch {
    // The previous valid localStorage snapshot is still available to classic mode.
  }
  return candidates;
}

export async function migrateLegacyDocuments(): Promise<{ migrated: DocumentV3[]; errors: string[] }> {
  if (await getMeta(MIGRATION_KEY)) return { migrated: [], errors: [] };
  const migrated: DocumentV3[] = [];
  const errors: string[] = [];
  const candidates = readLegacyCandidates();
  for (const candidate of candidates) {
    try {
      const document = migrateLegacyState(candidate.id, candidate.name, candidate.state);
      assertValidDocument(document);
      await putDocument(document);
      const verified = await getDocument(document.id);
      if (!verified) throw new Error("Read-back verification failed.");
      const comparison = compareMigration(candidate.state, verified);
      if (!comparison.valid) throw new Error(comparison.errors.join(" "));
      migrated.push(verified);
    } catch (error) {
      errors.push(`${candidate.name}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  if (errors.length === 0) await putMeta(MIGRATION_KEY, { completedAt: new Date().toISOString(), count: migrated.length });
  return { migrated, errors };
}
