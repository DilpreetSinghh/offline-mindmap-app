import assert from "node:assert/strict";
import test from "node:test";
import { expandSelectedBranches } from "../src/subtree-selection.mjs";

const nodes = [
  { nodeId: "root", parentNodeId: null },
  { nodeId: "a", parentNodeId: "root" },
  { nodeId: "a1", parentNodeId: "a" },
  { nodeId: "b", parentNodeId: "root" },
  { nodeId: "b1", parentNodeId: "b" },
];

test("expands multiple selected branches and their descendants once", () => {
  assert.deepEqual(expandSelectedBranches(nodes, ["a", "b"], "root"), {
    blockedByRoot: false,
    nodeIds: ["a", "b", "a1", "b1"],
  });
  assert.deepEqual(expandSelectedBranches(nodes, ["a", "a1"], "root").nodeIds, ["a", "a1"]);
});

test("blocks every bulk deletion that includes the root", () => {
  assert.deepEqual(expandSelectedBranches(nodes, ["root", "a"], "root"), {
    blockedByRoot: true,
    nodeIds: [],
  });
});
