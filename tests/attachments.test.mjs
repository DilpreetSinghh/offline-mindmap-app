import assert from "node:assert/strict";
import test from "node:test";
import { estimateDataUrlBytes, formatBytes, referencedBinaryFiles, referencedOfflineAttachments, sanitiseSceneMedia, validateAttachmentFile, validateImageFile } from "../src/attachments.mjs";
import { searchBuiltInIcons } from "../src/icons.mjs";

test("validates supported images and configurable size limits", () => {
  assert.equal(validateImageFile({ type: "image/png", size: 1024 }, 2).valid, true);
  assert.match(validateImageFile({ type: "image/png", size: 3 * 1024 ** 2 }, 2).error, /2 MB/);
  assert.match(validateImageFile({ type: "application/pdf", size: 10 }, 2).error, /Unsupported image/);
  assert.equal(formatBytes(1536), "1.5 KB");
});

test("accepts safe offline documents and rejects executables", () => {
  assert.equal(validateAttachmentFile({ name: "report.pdf", type: "application/pdf", size: 1024 }, 8).valid, true);
  assert.equal(validateAttachmentFile({ name: "notes.md", type: "", size: 1024 }, 8).valid, true);
  assert.equal(validateAttachmentFile({ name: "run.exe", type: "application/x-msdownload", size: 1024 }, 8).valid, false);
});

test("prunes deleted binary and file attachments", () => {
  const elements = [
    { type: "image", fileId: "keep" },
    { customData: { mindmapNode: { attachments: [{ id: "doc", kind: "file" }] } } },
  ];
  assert.deepEqual(Object.keys(referencedBinaryFiles(elements, { keep: {}, stale: {} })), ["keep"]);
  assert.deepEqual(Object.keys(referencedOfflineAttachments(elements, { doc: {}, old: {} })), ["doc"]);
});

test("removes missing and oversized scene images safely", () => {
  const small = "data:image/png;base64,AAAA";
  const large = `data:image/png;base64,${"A".repeat(4 * 1024 ** 2)}`;
  assert.equal(estimateDataUrlBytes(small), 3);
  const result = sanitiseSceneMedia([
    { id: "small", type: "image", fileId: "small" },
    { id: "large", type: "image", fileId: "large" },
    { id: "missing", type: "image", fileId: "missing" },
  ], {
    small: { mimeType: "image/png", dataURL: small },
    large: { mimeType: "image/png", dataURL: large },
  }, 2);
  assert.deepEqual(result.elements.map((item) => item.id), ["small"]);
  assert.deepEqual(Object.keys(result.files), ["small"]);
  assert.equal(result.errors.length, 2);
});

test("allows pending Excalidraw images to finish loading", () => {
  const result = sanitiseSceneMedia([{ id: "pending", type: "image", fileId: "later", status: "pending" }], {}, 1);
  assert.equal(result.pending, true);
  assert.equal(result.elements.length, 1);
  assert.equal(result.errors.length, 0);
});

test("searches the bundled offline icon catalogue", () => {
  assert.equal(searchBuiltInIcons("finance").some((icon) => icon.emoji === "📈"), true);
  assert.equal(searchBuiltInIcons("question")[0].emoji, "❓");
});
