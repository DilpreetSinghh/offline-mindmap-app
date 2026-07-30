import type { BinaryFileData, BinaryFiles } from "@excalidraw/excalidraw/types";
import { migrateLegacyState } from "./document";
import type { DocumentV3, LegacyMap, LegacyState, OfflineAttachmentData } from "./types";

const LEGACY_DB = "offline-mindmap-v3";
const MAPS_KEY = "offline-mindmap-maps-v1";
const WORKSPACE_KEY = "offline-mindmap-workspace-v2";

export type LegacyCandidate = {
  id: string;
  name: string;
  source: "schema-3" | "schema-2" | "schema-1" | "backup";
  raw: unknown;
  document: DocumentV3;
};

function requestValue<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Legacy database read failed."));
  });
}

async function databaseExists(name: string): Promise<boolean> {
  if (!("databases" in indexedDB)) return true;
  const databases = await indexedDB.databases();
  return databases.some((database) => database.name === name);
}

async function openExistingDatabase(name: string): Promise<IDBDatabase | null> {
  if (!(await databaseExists(name))) return null;
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(name);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Unable to read the legacy database."));
  });
}

export async function readSchema3(): Promise<LegacyCandidate[]> {
  const database = await openExistingDatabase(LEGACY_DB);
  if (!database) return [];
  try {
    if (!database.objectStoreNames.contains("documents") || !database.objectStoreNames.contains("assets")) return [];
    const transaction = database.transaction(["documents", "assets"], "readonly");
    const [documents, assets] = await Promise.all([
      requestValue(transaction.objectStore("documents").getAll()) as Promise<DocumentV3[]>,
      requestValue(transaction.objectStore("assets").getAll()) as Promise<Array<(BinaryFileData | OfflineAttachmentData) & { documentId: string; assetKind?: string }>>,
    ]);
    return documents.map((document) => {
      const files: BinaryFiles = {};
      const attachments: Record<string, OfflineAttachmentData> = {};
      for (const record of assets.filter((asset) => asset.documentId === document.id)) {
        const { documentId: _documentId, assetKind, ...data } = record;
        if (assetKind === "attachment") attachments[record.id] = data as OfflineAttachmentData;
        else files[record.id] = data as BinaryFileData;
      }
      const hydrated = { ...document, attachments, scene: { ...document.scene, files } };
      return { id: document.id, name: document.name, source: "schema-3" as const, raw: hydrated, document: hydrated };
    });
  } finally {
    database.close();
  }
}

function converted(id: string, name: string, state: LegacyState, source: LegacyCandidate["source"], raw: unknown): LegacyCandidate {
  return { id, name, source, raw, document: migrateLegacyState(id, name, state) };
}

export function readLocalStorage(storage: Pick<Storage, "getItem"> = localStorage): LegacyCandidate[] {
  const candidates: LegacyCandidate[] = [];
  try {
    const workspace = JSON.parse(storage.getItem(WORKSPACE_KEY) || "null") as { tabs?: Array<{ id?: string; name?: string; state?: LegacyState }> } | null;
    for (const [index, tab] of (workspace?.tabs ?? []).entries()) {
      if (tab.state) candidates.push(converted(tab.id || `workspace-${index}`, tab.name || `Recovered tab ${index + 1}`, tab.state, "schema-2", tab));
    }
  } catch {
    // Corrupt legacy values remain untouched and can still be exported from a selected backup.
  }
  try {
    const maps = JSON.parse(storage.getItem(MAPS_KEY) || "[]") as LegacyMap[];
    for (const map of maps) if (map?.data) candidates.push(converted(map.id, map.name || "Recovered map", map.data, "schema-1", map));
  } catch {
    // Read-only recovery never repairs or rewrites corrupt source bytes.
  }
  return candidates;
}

export function readBackup(value: unknown): LegacyCandidate[] {
  const candidates: LegacyCandidate[] = [];
  const payload = value as { documents?: DocumentV3[]; maps?: LegacyMap[]; tabs?: Array<{ id?: string; name?: string; state?: LegacyState }> };
  for (const document of payload?.documents ?? []) {
    if (document?.scene?.elements) candidates.push({ id: document.id, name: document.name, source: "backup", raw: document, document });
  }
  for (const map of payload?.maps ?? []) {
    if (map?.data) candidates.push(converted(map.id, map.name || "Recovered map", map.data, "backup", map));
  }
  for (const [index, tab] of (payload?.tabs ?? []).entries()) {
    if (tab.state) candidates.push(converted(tab.id || `backup-${index}`, tab.name || `Recovered tab ${index + 1}`, tab.state, "backup", tab));
  }
  if (!candidates.length && Array.isArray(value)) {
    for (const map of value as LegacyMap[]) if (map?.data) candidates.push(converted(map.id, map.name || "Recovered map", map.data, "backup", map));
  }
  return candidates;
}

export async function readAllLegacy(): Promise<LegacyCandidate[]> {
  const [schema3, local] = await Promise.all([readSchema3(), Promise.resolve(readLocalStorage())]);
  return [...schema3, ...local];
}
