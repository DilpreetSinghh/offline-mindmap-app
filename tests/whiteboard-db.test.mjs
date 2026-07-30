import test from "node:test";
import assert from "node:assert/strict";
import "fake-indexeddb/auto";
import {
  ASSETS_STORE,
  REVISIONS_STORE,
  assetIdsReferencedBy,
  cleanScene,
  createDrawing,
  createRevision,
  deleteDrawing,
  duplicateDrawing,
  garbageCollectAssets,
  getDrawing,
  hydrateRevision,
  listDrawings,
  listRevisions,
  openWhiteboardDatabase,
  pruneForQuota,
  renameDrawing,
  restoreRevision,
  selectPrunableRevisions,
} from "../src/whiteboard-db.ts";

let sequence = 0;

async function database() {
  return openWhiteboardDatabase(`offline-whiteboard-test-${++sequence}`);
}

function scene(text = "hello", dataURL = null) {
  const files = dataURL ? {
    file1: { id: "file1", mimeType: "image/png", dataURL, created: 1, lastRetrieved: 1 },
  } : {};
  return {
    elements: [{ id: "text1", type: "text", text, isDeleted: false }],
    appState: { theme: "light", selectedElementIds: { text1: true }, openMenu: "canvas" },
    files,
  };
}

test("creates, lists, renames, duplicates and deletes drawings", async () => {
  const db = await database();
  const drawing = await createDrawing(db, "First");
  await createRevision(db, drawing.id, scene());
  await renameDrawing(db, drawing.id, "Renamed");
  const duplicate = await duplicateDrawing(db, drawing.id);
  assert.equal((await getDrawing(db, drawing.id)).name, "Renamed");
  assert.equal((await listRevisions(db, duplicate.id)).length, 1);
  await deleteDrawing(db, drawing.id);
  assert.deepEqual((await listDrawings(db)).map((item) => item.id), [duplicate.id]);
  db.close();
});

test("hashes cleaned scenes and skips unchanged revisions", async () => {
  const db = await database();
  const drawing = await createDrawing(db);
  const first = await createRevision(db, drawing.id, scene());
  const duplicate = await createRevision(db, drawing.id, scene());
  const changed = await createRevision(db, drawing.id, scene("changed"));
  assert.ok(first?.contentHash);
  assert.equal(duplicate, null);
  assert.notEqual(changed?.contentHash, first?.contentHash);
  db.close();
});

test("deduplicates binary assets and hydrates their original file IDs", async () => {
  const db = await database();
  const one = await createDrawing(db, "One");
  const two = await createDrawing(db, "Two");
  const dataURL = "data:image/png;base64,aGVsbG8=";
  const revisionOne = await createRevision(db, one.id, scene("one", dataURL));
  const revisionTwo = await createRevision(db, two.id, scene("two", dataURL));
  const assets = await new Promise((resolve, reject) => {
    const request = db.transaction(ASSETS_STORE).objectStore(ASSETS_STORE).getAll();
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  assert.equal(assets.length, 1);
  assert.equal((await hydrateRevision(db, revisionOne)).files.file1.dataURL, dataURL);
  assert.equal(assetIdsReferencedBy([revisionOne, revisionTwo]).size, 1);
  db.close();
});

test("restores history by appending a new latest revision", async () => {
  const db = await database();
  const drawing = await createDrawing(db);
  const old = await createRevision(db, drawing.id, scene("old"));
  await createRevision(db, drawing.id, scene("new"));
  const restored = await restoreRevision(db, drawing.id, old.id);
  assert.notEqual(restored.id, old.id);
  assert.equal(restored.contentHash, old.contentHash);
  assert.equal((await listRevisions(db, drawing.id)).length, 3);
  assert.equal((await getDrawing(db, drawing.id)).latestRevisionId, restored.id);
  db.close();
});

test("selects only old non-latest revisions beyond the newest 25", () => {
  const revisions = Array.from({ length: 30 }, (_, index) => ({
    id: `r${index}`, drawingId: "d", createdAt: index, size: 10, binaryAssetReferences: [], scene: {}, contentHash: `${index}`,
  }));
  const candidates = selectPrunableRevisions([{ id: "d", latestRevisionId: "r29" }], revisions);
  assert.deepEqual(candidates.map((revision) => revision.id), ["r0", "r1", "r2", "r3", "r4"]);
});

test("prunes towards 60 percent and garbage-collects unreferenced assets", async () => {
  const db = await database();
  const drawing = await createDrawing(db);
  for (let index = 0; index < 30; index += 1) await createRevision(db, drawing.id, scene(`${index}`), true);
  const result = await pruneForQuota(db, 750, 1000);
  assert.ok(result.deleted > 0);
  assert.ok((await listRevisions(db, drawing.id)).length >= 25);
  assert.equal(await garbageCollectAssets(db), 0);
  db.close();
});

test("surfaces transaction failure without corrupting a prior revision", async () => {
  const db = await database();
  const drawing = await createDrawing(db);
  await createRevision(db, drawing.id, scene("safe"));
  db.close();
  await assert.rejects(createRevision(db, drawing.id, scene("unsafe")));
});

test("cleaning excludes transient editor state from the content hash", async () => {
  const first = await cleanScene(scene());
  const changedSelection = scene();
  changedSelection.appState.selectedElementIds = {};
  changedSelection.appState.openMenu = null;
  const second = await cleanScene(changedSelection);
  assert.equal(first.contentHash, second.contentHash);
});

test("preserves a large Unicode writing exactly through revision storage", async () => {
  const db = await database();
  const drawing = await createDrawing(db, "Long-form writing");
  const paragraph = "Monetary policy transmission — मुद्रास्फीति, employment, and expectations.\n";
  const writing = paragraph.repeat(20_000);
  const revision = await createRevision(db, drawing.id, scene(writing));
  const restored = await hydrateRevision(db, revision);

  assert.equal(restored.elements[0].text, writing);
  assert.equal(restored.elements[0].text.length, writing.length);
  assert.ok(revision.size > 1_000_000);
  db.close();
});
