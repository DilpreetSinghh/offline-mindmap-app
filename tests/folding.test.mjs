import assert from "node:assert/strict";
import test from "node:test";
import { foldingIndex, mergeFoldedElements, setNodesCollapsed, visibleFoldedElements } from "../src/folding.mjs";

const shape = (nodeId, parentNodeId, collapsed = false) => ({
  id: `shape-${nodeId}`,
  type: "rectangle",
  customData: { mindmapNode: { nodeId, parentNodeId, siblingOrder: 0, collapsed } },
});
const label = (nodeId) => ({ id: `label-${nodeId}`, type: "text", containerId: `shape-${nodeId}` });
const arrow = (fromNodeId, toNodeId) => ({
  id: `arrow-${fromNodeId}-${toNodeId}`,
  type: "arrow",
  customData: { mindmapConnection: { role: "hierarchy", fromNodeId, toNodeId } },
});
const scene = [
  shape("root", null), label("root"),
  shape("a", "root", true), label("a"), arrow("root", "a"),
  shape("a1", "a"), label("a1"), arrow("a", "a1"),
  shape("a2", "a1"), label("a2"), arrow("a1", "a2"),
  shape("b", "root"), label("b"), arrow("root", "b"),
  { id: "drawing", type: "freedraw" },
];

test("folding hides descendants, their labels and connections but preserves whiteboard objects", () => {
  const index = foldingIndex(scene);
  assert.deepEqual([...index.hiddenNodeIds], ["a1", "a2"]);
  assert.equal(index.hiddenDescendantCount.get("a"), 2);
  assert.deepEqual(visibleFoldedElements(scene).map((element) => element.id), [
    "shape-root", "label-root", "shape-a", "label-a", "arrow-root-a", "shape-b", "label-b", "arrow-root-b", "drawing",
  ]);
});

test("merging projected edits keeps hidden canonical descendants and removes deleted visible elements", () => {
  const projected = visibleFoldedElements(scene)
    .filter((element) => element.id !== "shape-b" && element.id !== "label-b" && element.id !== "arrow-root-b")
    .map((element) => element.id === "shape-a" ? { ...element, x: 500 } : element)
    .concat({ id: "fold-badge-shape-a", type: "text", customData: { foldBadge: true } });
  const merged = mergeFoldedElements(scene, projected);
  assert.equal(merged.find((element) => element.id === "shape-a").x, 500);
  assert.ok(merged.some((element) => element.id === "shape-a2"));
  assert.ok(!merged.some((element) => element.id === "shape-b"));
  assert.ok(!merged.some((element) => element.customData?.foldBadge));
});

test("collapsed state changes without mutating unrelated elements", () => {
  const expanded = setNodesCollapsed(scene, ["a"], false);
  assert.equal(expanded.find((element) => element.id === "shape-a").customData.mindmapNode.collapsed, false);
  assert.equal(expanded.find((element) => element.id === "shape-root"), scene[0]);
});

test("merging a new collapse keeps descendants that disappear from the projection", () => {
  const expandedScene = setNodesCollapsed(scene, ["a"], false);
  const collapsedScene = setNodesCollapsed(expandedScene, ["a"], true);
  const merged = mergeFoldedElements(expandedScene, visibleFoldedElements(collapsedScene));
  assert.equal(merged.find((element) => element.id === "shape-a").customData.mindmapNode.collapsed, true);
  assert.ok(merged.some((element) => element.id === "shape-a1"));
  assert.ok(merged.some((element) => element.id === "shape-a2"));
});
