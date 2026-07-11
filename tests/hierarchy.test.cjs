const test = require("node:test");
const assert = require("node:assert/strict");
const {
  canReparent,
  getChildren,
  getLowestCommonAncestorId,
  indentNode,
  moveSibling,
  normaliseAllOrders,
  outdentNode,
  reparentNode,
} = require("../hierarchy.js");

function fixture() {
  return {
    nodes: [
      { id: "root", parentId: null, order: 0 },
      { id: "a", parentId: "root", order: 0 },
      { id: "b", parentId: "root", order: 1 },
      { id: "a1", parentId: "a", order: 0 },
    ],
    connections: [
      { from: "root", to: "a" },
      { from: "root", to: "b" },
      { from: "a", to: "a1" },
    ],
  };
}

test("normalises legacy sibling order deterministically", () => {
  const nodes = fixture().nodes.map(({ order, ...node }) => node);
  normaliseAllOrders(nodes);
  assert.deepEqual(getChildren(nodes, "root").map((node) => node.id), ["a", "b"]);
  assert.deepEqual(getChildren(nodes, "root").map((node) => node.order), [0, 1]);
});

test("reparents a subtree and replaces its hierarchy connection", () => {
  const { nodes, connections } = fixture();
  assert.equal(reparentNode(nodes, connections, "a1", "b"), true);
  assert.equal(nodes.find((node) => node.id === "a1").parentId, "b");
  assert.deepEqual(
    connections.filter((connection) => connection.to === "a1"),
    [{ from: "b", to: "a1", kind: "hierarchy" }]
  );
});

test("prevents self, root, unchanged-parent, and descendant cycles", () => {
  const { nodes } = fixture();
  assert.equal(canReparent(nodes, "root", "a"), false);
  assert.equal(canReparent(nodes, "a", "a"), false);
  assert.equal(canReparent(nodes, "a", "root"), false);
  assert.equal(canReparent(nodes, "a", "a1"), false);
});

test("moves siblings while preserving contiguous order", () => {
  const { nodes } = fixture();
  assert.equal(moveSibling(nodes, "b", -1), true);
  assert.deepEqual(getChildren(nodes, "root").map((node) => node.id), ["b", "a"]);
  assert.deepEqual(getChildren(nodes, "root").map((node) => node.order), [0, 1]);
});

test("indents under the previous sibling and outdents after the parent", () => {
  const { nodes, connections } = fixture();
  assert.equal(indentNode(nodes, connections, "b"), true);
  assert.equal(nodes.find((node) => node.id === "b").parentId, "a");
  assert.equal(outdentNode(nodes, connections, "a1"), true);
  assert.equal(nodes.find((node) => node.id === "a1").parentId, "root");
  assert.deepEqual(getChildren(nodes, "root").map((node) => node.id), ["a", "a1"]);
});

test("finds the narrowest branch affected by a structural move", () => {
  const nodes = [
    { id: "root", parentId: null },
    { id: "left", parentId: "root" },
    { id: "right", parentId: "root" },
    { id: "left-a", parentId: "left" },
    { id: "left-b", parentId: "left" },
  ];

  assert.equal(getLowestCommonAncestorId(nodes, "left-a", "left-b"), "left");
  assert.equal(getLowestCommonAncestorId(nodes, "left", "right"), "root");
  assert.equal(getLowestCommonAncestorId(nodes, "missing", "right"), null);
});
