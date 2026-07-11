import assert from "node:assert/strict";
import test from "node:test";
import { moveOutlineRecords } from "../src/outline-hierarchy.mjs";

const records = () => [
  { nodeId: "root", parentNodeId: null, siblingOrder: 0 },
  { nodeId: "a", parentNodeId: "root", siblingOrder: 0 },
  { nodeId: "a1", parentNodeId: "a", siblingOrder: 0 },
  { nodeId: "b", parentNodeId: "root", siblingOrder: 1 },
];

test("outline sibling moves keep contiguous ordering", () => {
  const moved = moveOutlineRecords(records(), "b", "up");
  assert.deepEqual(moved.filter((node) => node.parentNodeId === "root").map((node) => [node.nodeId, node.siblingOrder]), [["a", 1], ["b", 0]]);
});

test("outline indent and outdent update the canonical hierarchy", () => {
  const indented = moveOutlineRecords(records(), "b", "indent");
  assert.equal(indented.find((node) => node.nodeId === "b").parentNodeId, "a");
  const outdented = moveOutlineRecords(records(), "a1", "outdent");
  assert.deepEqual(outdented.find((node) => node.nodeId === "a1"), { nodeId: "a1", parentNodeId: "root", siblingOrder: 1 });
});

test("outline moves protect the root and reject impossible edges", () => {
  assert.equal(moveOutlineRecords(records(), "root", "indent"), null);
  assert.equal(moveOutlineRecords(records(), "a", "up"), null);
  assert.equal(moveOutlineRecords(records(), "a", "outdent"), null);
});
