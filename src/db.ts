import type { BinaryFileData, BinaryFiles } from "@excalidraw/excalidraw/types";
import { assertValidDocument, compareMigration, migrateLegacyState } from "./document";
import type { DocumentV3, LegacyMap, LegacyState } from "./types";

const DB_NAME = "offline-mindmap-v3";
const DB_VERSION = 1;
const DOCUMENT_STORE = "documents";
const ASSET_STORE = "assets";
const META_STORE = "meta";
const RECOVERY_KEY = "workspace-recovery";
const MIGRATION_KEY = "schema-2-migration-complete";
const LEGACY_MAPS_KEY = "offline-mindmap-maps-v1";
const LEGACY_WORKSPACE_KEY = "offline-mindmap-workspace-v2";

type AssetRecord = BinaryFileData & { documentId: string };
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

function assetRecords(documentId: string, files: BinaryFiles): AssetRecord[] {
  return Object.values(files).map((file) => ({ ...file, documentId }));
}

export async function putDocument(document: DocumentV3): Promise<DocumentV3> {
  assertValidDocument(document);
  const database = await openDatabase();
  const transaction = database.transaction([DOCUMENT_STORE, ASSET_STORE], "readwrite");
  transaction.objectStore(DOCUMENT_STORE).put(structuredClone(document));
  const assets = transaction.objectStore(ASSET_STORE);
  for (const record of assetRecords(document.id, document.scene.files)) assets.put(record);
  await transactionDone(transaction);
  const saved = await getDocument(document.id);
  if (!saved) throw new Error("Local save verification failed.");
  assertValidDocument(saved);
  return saved;
}

export async function putDocuments(documents: DocumentV3[]): Promise<DocumentV3[]> {
  for (const document of documents) assertValidDocument(document);
  const database = await openDatabase();
  const transaction = database.transaction([DOCUMENT_STORE, ASSET_STORE], "readwrite");
  const documentStore = transaction.objectStore(DOCUMENT_STORE);
  const assetStore = transaction.objectStore(ASSET_STORE);
  for (const document of documents) {
    documentStore.put(structuredClone(document));
    for (const record of assetRecords(document.id, document.scene.files)) assetStore.put(record);
  }
  await transactionDone(transaction);
  const verified = await Promise.all(documents.map((document) => getDocument(document.id)));
  for (const document of verified) {
    if (!document) throw new Error("Native backup read-back verification failed.");
    assertValidDocument(document);
  }
  return verified as DocumentV3[];
}

export async function getDocument(id: string): Promise<DocumentV3 | null> {
  const database = await openDatabase();
  const transaction = database.transaction(DOCUMENT_STORE, "readonly");
  const value = await requestValue(transaction.objectStore(DOCUMENT_STORE).get(id));
  return (value as DocumentV3 | undefined) ?? null;
}

export async function listDocuments(): Promise<DocumentV3[]> {
  const database = await openDatabase();
  const transaction = database.transaction(DOCUMENT_STORE, "readonly");
  const values = (await requestValue(transaction.objectStore(DOCUMENT_STORE).getAll())) as DocumentV3[];
  return values.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
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
