import assert from "node:assert/strict";
import test from "node:test";
import { internalLinkStatus, nodeContentIndicators, sanitiseNodeUrl } from "../src/node-content.mjs";

test("sanitises supported web and file links", () => {
  assert.equal(sanitiseNodeUrl("https://example.com/a b"), "https://example.com/a%20b");
  assert.equal(sanitiseNodeUrl("file:///Users/example/note.pdf"), "file:///Users/example/note.pdf");
  assert.equal(sanitiseNodeUrl(""), "");
});

test("rejects unsafe and incomplete URLs", () => {
  assert.throws(() => sanitiseNodeUrl("javascript:alert(1)"), /Unsafe URL scheme/);
  assert.throws(() => sanitiseNodeUrl("example.com"), /complete http/);
});

test("reports broken internal targets and compact indicators", () => {
  const elements = [{ customData: { mindmapNode: { nodeId: "a" } } }];
  assert.equal(internalLinkStatus(elements, "a"), "valid");
  assert.equal(internalLinkStatus(elements, "missing"), "broken");
  assert.deepEqual(nodeContentIndicators({ notes: "N", url: "https://example.com", internalTargetNodeId: "a" }), ["note", "link", "topic"]);
});
