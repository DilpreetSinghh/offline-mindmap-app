import test from "node:test";
import assert from "node:assert/strict";
import { inferBoundTree } from "../src/bound-tree.mjs";

const shape = (id, x, y, node) => ({
  id,
  type: "rectangle",
  x,
  y,
  width: 190,
  height: 84,
  customData: node ? { mindmapNode: node } : undefined,
});
const arrow = (id, from, to, role) => ({
  id,
  type: "arrow",
  startBinding: { elementId: from },
  endBinding: { elementId: to },
  customData: role ? { mindmapConnection: { role } } : undefined,
});

test("infers and orders a native bound-arrow tree from the semantic root", () => {
  const result = inferBoundTree([
    shape("root-shape", 0, 200, { nodeId: "root", parentNodeId: null, siblingOrder: 0 }),
    shape("green", 300, 100),
    shape("red", 300, 300),
    shape("green-child", 600, 80),
    shape("red-child", 600, 320),
    arrow("root-green", "root-shape", "green"),
    arrow("root-red", "root-shape", "red"),
    arrow("green-child-arrow", "green", "green-child"),
    arrow("red-child-arrow", "red", "red-child"),
  ], "root");

  assert.ok(result);
  assert.equal(result.records.length, 5);
  assert.equal(result.records.find((record) => record.elementId === "green").parentNodeId, "root");
  assert.equal(result.records.find((record) => record.elementId === "red").siblingOrder, 1);
  assert.equal(result.records.find((record) => record.elementId === "green-child").parentNodeId, "green");
  assert.equal(result.treeArrowIdByTarget.get("red-child"), "red-child-arrow");
});

test("ignores relationships, loose arrows, and cycles while inferring a tree", () => {
  const result = inferBoundTree([
    shape("root", 0, 0, { nodeId: "root", parentNodeId: null, siblingOrder: 0 }),
    shape("child", 300, 0),
    shape("unrelated", 300, 200),
    arrow("tree", "root", "child"),
    arrow("relationship", "root", "unrelated", "relationship"),
    arrow("cycle", "child", "root"),
    { id: "loose", type: "arrow" },
  ], "root");

  assert.deepEqual(result.records.map((record) => record.elementId).sort(), ["child", "root"]);
  assert.equal(result.treeArrowIdByTarget.get("child"), "tree");
});

test("infers a hand-drawn arrow when its endpoints touch the shapes", () => {
  const result = inferBoundTree([
    shape("root", 100, 100, { nodeId: "root", parentNodeId: null, siblingOrder: 0 }),
    shape("manual", 500, 120),
    {
      id: "hand-drawn",
      type: "arrow",
      x: 290,
      y: 142,
      points: [[0, 0], [210, 20]],
    },
  ], "root");

  assert.equal(result.records.length, 2);
  assert.equal(result.records.find((record) => record.elementId === "manual").parentNodeId, "root");
  assert.equal(result.treeArrowIdByTarget.get("manual"), "hand-drawn");
});
