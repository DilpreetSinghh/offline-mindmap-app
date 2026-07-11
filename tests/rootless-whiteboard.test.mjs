import assert from "node:assert/strict";
import test from "node:test";
import { normaliseRootlessWhiteboard } from "../src/rootless-whiteboard.mjs";

const node = (id, nodeId, isDeleted = false) => ({
  id,
  type: "rectangle",
  isDeleted,
  customData: { mindmapNode: { nodeId, parentNodeId: null, siblingOrder: 0, collapsed: false } },
});

test("keeps an intact mind map unchanged", () => {
  const elements = [node("root-shape", "root")];
  const result = normaliseRootlessWhiteboard(elements, "root");
  assert.equal(result.changed, false);
  assert.equal(result.elements, elements);
});

test("preserves visible orphaned shapes and arrows as an ordinary whiteboard", () => {
  const elements = [
    node("deleted-root", "root", true),
    { id: "child", type: "rectangle", customData: { mindmapNode: { nodeId: "child", parentNodeId: "root", siblingOrder: 0 }, pluginFlag: true } },
    { id: "arrow", type: "arrow", customData: { mindmapConnection: { role: "hierarchy", fromNodeId: "root", toNodeId: "child" } } },
    { id: "drawing", type: "freedraw" },
  ];
  const result = normaliseRootlessWhiteboard(elements, "root");
  assert.equal(result.changed, true);
  assert.equal(result.elements.length, elements.length);
  assert.equal(result.elements.find((element) => element.id === "child").customData.pluginFlag, true);
  assert.equal(result.elements.find((element) => element.id === "child").customData.mindmapNode, undefined);
  assert.equal(result.elements.find((element) => element.id === "arrow").customData, undefined);
  assert.equal(result.elements.find((element) => element.id === "drawing"), elements[3]);
});

test("leaves an already rootless whiteboard untouched", () => {
  const elements = [{ id: "shape", type: "diamond" }, { id: "stroke", type: "freedraw" }];
  const result = normaliseRootlessWhiteboard(elements, "root");
  assert.equal(result.changed, false);
  assert.equal(result.elements, elements);
});

test("removes stale metadata when the deleted root was the only mind-map node", () => {
  const elements = [node("deleted-root", "root", true), { id: "drawing", type: "freedraw" }];
  const result = normaliseRootlessWhiteboard(elements, "root");
  assert.equal(result.changed, true);
  assert.equal(result.elements[0].customData, undefined);
  assert.equal(result.elements[1], elements[1]);
});
