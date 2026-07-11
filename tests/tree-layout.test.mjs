import test from "node:test";
import assert from "node:assert/strict";
import {
  calculateTreeLayout,
  shouldReflowAfterInsertion,
  TREE_VERTICAL_GAP,
} from "../src/tree-layout.mjs";

const node = (nodeId, parentNodeId, siblingOrder, x, y, height = 84) => ({
  nodeId,
  parentNodeId,
  siblingOrder,
  x,
  y,
  width: 190,
  height,
});

test("keeps the root centred while making room for third-level branches", () => {
  const records = [
    node("root", null, 0, 100, 300),
    node("a", "root", 0, 400, 240),
    node("b", "root", 1, 400, 390),
    node("a1", "a", 0, 700, 180),
    node("a2", "a", 1, 700, 300),
    node("a3", "a", 2, 700, 420),
  ];
  const positions = calculateTreeLayout(records, "root");
  const root = positions.get("root");
  const a1 = positions.get("a1");
  const a3 = positions.get("a3");
  const b = positions.get("b");

  assert.equal(root.y + 42, 342, "root centre must remain anchored");
  assert.ok(a1.y + 84 + TREE_VERTICAL_GAP <= a3.y, "grandchildren must receive distinct vertical slots");
  assert.ok(a3.y + 84 + TREE_VERTICAL_GAP <= b.y, "the next level-two branch must move below the expanded subtree");
});

test("uses stable sibling ordering and aligned depth columns", () => {
  const records = [
    node("root", null, 0, 80, 200),
    node("later", "root", 2, 360, 300),
    node("first", "root", 0, 360, 100),
    node("middle", "root", 1, 360, 200),
    node("deep", "first", 0, 640, 100),
  ];
  const positions = calculateTreeLayout(records, "root");
  assert.ok(positions.get("first").y < positions.get("middle").y);
  assert.ok(positions.get("middle").y < positions.get("later").y);
  assert.equal(positions.get("first").x, positions.get("middle").x);
  assert.ok(positions.get("deep").x > positions.get("first").x);
});

test("separates two expanded sibling subtrees like the reported red and green branches", () => {
  const records = [
    node("root", null, 0, 80, 260, 54),
    node("green", "root", 0, 360, 190, 54),
    node("red", "root", 1, 360, 290, 54),
    ...Array.from({ length: 4 }, (_, index) => node(`green-${index}`, "green", index, 640, 80 + index * 54, 54)),
    ...Array.from({ length: 4 }, (_, index) => node(`red-${index}`, "red", index, 640, 130 + index * 54, 54)),
  ];
  const positions = calculateTreeLayout(records, "root");
  const greenChildren = records.filter((record) => record.parentNodeId === "green").map((record) => positions.get(record.nodeId));
  const redChildren = records.filter((record) => record.parentNodeId === "red").map((record) => positions.get(record.nodeId));
  const greenBottom = Math.max(...greenChildren.map((position) => position.y + 54));
  const redTop = Math.min(...redChildren.map((position) => position.y));

  assert.ok(greenBottom + TREE_VERTICAL_GAP <= redTop, "expanded sibling subtree ranges must not overlap");
  assert.ok(positions.get("green").y < positions.get("red").y, "parent order must remain green before red");
});

test("reflows toolbar, sibling, and right-arrow child creation paths", () => {
  assert.equal(shouldReflowAfterInsertion("child"), true);
  assert.equal(shouldReflowAfterInsertion("sibling"), true);
  assert.equal(shouldReflowAfterInsertion("right"), true);
  assert.equal(shouldReflowAfterInsertion("left"), false);
  assert.equal(shouldReflowAfterInsertion("up"), false);
  assert.equal(shouldReflowAfterInsertion("down"), false);
});

test("returns an empty layout for a missing root", () => {
  assert.equal(calculateTreeLayout([node("a", null, 0, 0, 0)], "root").size, 0);
});
