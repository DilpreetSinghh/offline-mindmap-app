import assert from "node:assert/strict";
import test from "node:test";
import { revealFoldedNode } from "../src/folding.mjs";
import { buildSearchRecords, replaceTextMatches, searchMindmap } from "../src/search-index.mjs";

const shape = (nodeId, parentNodeId, collapsed = false, extra = {}) => ({
  id: `shape-${nodeId}`,
  type: "rectangle",
  customData: { mindmapNode: { nodeId, parentNodeId, siblingOrder: 0, collapsed, ...extra } },
});
const label = (nodeId, text) => ({ id: `label-${nodeId}`, type: "text", containerId: `shape-${nodeId}`, text, originalText: text });

test("searches titles and future notes, links and tags with filters", () => {
  const scene = [
    shape("root", null), label("root", "Central Idea"),
    shape("a", "root", true, { notes: "Quarterly finance", tags: ["RBI"], taskState: "open" }), label("a", "Alpha"),
    shape("a1", "a"), label("a1", "Hidden Finance"),
  ];
  const records = buildSearchRecords(scene);
  assert.equal(searchMindmap(records, "finance").length, 2);
  assert.equal(searchMindmap(records, "finance", { visibility: "hidden" })[0].nodeId, "a1");
  assert.equal(searchMindmap(records, "quarterly", { tag: "rbi", taskState: "open", depth: 1 })[0].nodeId, "a");
  assert.equal(searchMindmap(records, "idea", { caseSensitive: true }).length, 0);
  assert.equal(searchMindmap(records, "Idea", { caseSensitive: true, wholeWord: true }).length, 1);
});

test("replace-one and replace-all honour case and whole-word options", () => {
  assert.equal(replaceTextMatches("Map map mapping", "map", "Node"), "Node map mapping");
  assert.equal(replaceTextMatches("Map map mapping", "map", "Node", { all: true, wholeWord: true }), "Node Node mapping");
  assert.equal(replaceTextMatches("Map map", "map", "Node", { all: true, caseSensitive: true }), "Map Node");
});

test("revealing a collapsed result expands all of its ancestors", () => {
  const scene = [shape("root", null, true), shape("a", "root", true), shape("a1", "a")];
  const revealed = revealFoldedNode(scene, "a1");
  assert.equal(revealed[0].customData.mindmapNode.collapsed, false);
  assert.equal(revealed[1].customData.mindmapNode.collapsed, false);
});

test("search remains linear and responsive for 5,000 nodes", () => {
  const scene = [];
  for (let index = 0; index < 5_000; index += 1) {
    scene.push(shape(`n${index}`, index ? `n${index - 1}` : null), label(`n${index}`, `Node ${index}`));
  }
  const started = performance.now();
  const records = buildSearchRecords(scene);
  const matches = searchMindmap(records, "Node 4999", { wholeWord: false });
  assert.equal(matches.length, 1);
  assert.ok(performance.now() - started < 1_000);
});
