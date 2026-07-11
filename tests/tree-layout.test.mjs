import test from "node:test";
import assert from "node:assert/strict";
import { calculateTreeLayout, TREE_VERTICAL_GAP } from "../src/tree-layout.mjs";

const node = (nodeId, parentNodeId, siblingOrder, x, y) => ({
  nodeId,
  parentNodeId,
  siblingOrder,
  x,
  y,
  width: 190,
  height: 84,
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

test("returns an empty layout for a missing root", () => {
  assert.equal(calculateTreeLayout([node("a", null, 0, 0, 0)], "root").size, 0);
});
