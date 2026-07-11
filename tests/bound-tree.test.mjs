import test from "node:test";
import assert from "node:assert/strict";
import { inferBoundTree } from "../src/bound-tree.mjs";
import { calculateTreeLayout, TREE_VERTICAL_GAP } from "../src/tree-layout.mjs";

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

test("chooses the largest native one-to-many flowchart when no semantic root exists", () => {
  const result = inferBoundTree([
    shape("first", 100, 240),
    shape("black", 400, 80),
    shape("red", 400, 240),
    shape("green", 400, 400),
    shape("red-child", 700, 180),
    shape("green-child", 700, 460),
    shape("unrelated", 40, 700),
    shape("unrelated-child", 300, 700),
    arrow("first-black", "first", "black"),
    arrow("first-red", "first", "red"),
    arrow("first-green", "first", "green"),
    arrow("red-child-arrow", "red", "red-child"),
    arrow("green-child-arrow", "green", "green-child"),
    arrow("small-component", "unrelated", "unrelated-child"),
  ]);

  assert.equal(result.rootNodeId, "first");
  assert.equal(result.records.length, 6);
  assert.equal(result.records.filter((record) => record.parentNodeId === "first").length, 3);
});

test("falls back to visible endpoints when bindings target non-node labels", () => {
  const result = inferBoundTree([
    shape("first", 100, 100),
    shape("child", 500, 100),
    {
      id: "label-bound-arrow",
      type: "arrow",
      x: 290,
      y: 140,
      points: [[0, 0], [210, 0]],
      startBinding: { elementId: "first-label" },
      endBinding: { elementId: "child-label" },
    },
  ]);

  assert.equal(result.rootNodeId, "first");
  assert.equal(result.records.find((record) => record.elementId === "child").parentNodeId, "first");
});

test("separates expanded native branches so their child rectangles do not overlap", () => {
  const elements = [
    shape("first", 100, 260),
    shape("red", 400, 180),
    shape("green", 400, 340),
    arrow("first-red", "first", "red"),
    arrow("first-green", "first", "green"),
  ];
  for (let index = 0; index < 4; index += 1) {
    elements.push(shape(`red-${index}`, 700, 80 + index * 80));
    elements.push(shape(`green-${index}`, 700, 300 + index * 80));
    elements.push(arrow(`red-arrow-${index}`, "red", `red-${index}`));
    elements.push(arrow(`green-arrow-${index}`, "green", `green-${index}`));
  }
  const inferred = inferBoundTree(elements);
  const positions = calculateTreeLayout(inferred.records, inferred.rootNodeId);
  const redChildren = inferred.records.filter((record) => record.parentNodeId === "red");
  const greenChildren = inferred.records.filter((record) => record.parentNodeId === "green");
  const redBottom = Math.max(...redChildren.map((record) => positions.get(record.nodeId).y + record.height));
  const greenTop = Math.min(...greenChildren.map((record) => positions.get(record.nodeId).y));

  assert.ok(redBottom + TREE_VERTICAL_GAP <= greenTop);
});
