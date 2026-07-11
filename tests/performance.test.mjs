import test from "node:test";
import assert from "node:assert/strict";
import { performance } from "node:perf_hooks";
import { validateHierarchyIndex } from "../src/hierarchy-index.mjs";

test("validates a 10,000-node hierarchy in linear time", () => {
  const records = Array.from({ length: 10_000 }, (_, index) => ({
    nodeId: index === 0 ? "root" : `node-${index}`,
    parentNodeId: index === 0 ? null : index === 1 ? "root" : `node-${index - 1}`,
  }));
  const started = performance.now();
  const result = validateHierarchyIndex(records, "root");
  const elapsed = performance.now() - started;
  assert.equal(result.valid, true);
  assert.ok(elapsed < 1_000, `10,000-node validation took ${elapsed.toFixed(1)} ms`);
});

test("detects a cycle in a large hierarchy", () => {
  const records = Array.from({ length: 10_000 }, (_, index) => ({
    nodeId: index === 0 ? "root" : `node-${index}`,
    parentNodeId: index === 0 ? null : index === 1 ? "node-9999" : `node-${index - 1}`,
  }));
  const result = validateHierarchyIndex(records, "root");
  assert.equal(result.valid, false);
  assert.match(result.errors.join(" "), /cycle/i);
});
