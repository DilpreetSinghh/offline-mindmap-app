import assert from "node:assert/strict";
import test from "node:test";
import { isTaskOverdue, normaliseTags, propagateTaskRecords, taskIndicator, taskMarkdown } from "../src/tasks.mjs";

test("normalises reusable coloured tags", () => {
  assert.deepEqual(normaliseTags("Finance, #RBI, finance", "#123456"), [{ name: "Finance", color: "#123456" }, { name: "RBI", color: "#123456" }]);
  assert.deepEqual(normaliseTags("Finance, New", "#abcdef", [{ name: "Finance", color: "#123456" }]), [{ name: "Finance", color: "#123456" }, { name: "New", color: "#abcdef" }]);
});

test("propagates parent task progress from direct child tasks", () => {
  const result = propagateTaskRecords([
    { nodeId: "root", parentNodeId: null, task: { state: "open", autoProgress: true } },
    { nodeId: "a", parentNodeId: "root", task: { state: "done" } },
    { nodeId: "b", parentNodeId: "root", task: { state: "open", progress: 50 } },
  ]);
  assert.equal(result[0].task.progress, 75);
  assert.equal(result[0].task.state, "open");
});

test("propagates progress through non-task grouping nodes", () => {
  const result = propagateTaskRecords([
    { nodeId: "root", parentNodeId: null, task: { state: "open", autoProgress: true } },
    { nodeId: "group", parentNodeId: "root" },
    { nodeId: "a", parentNodeId: "group", task: { state: "done" } },
    { nodeId: "b", parentNodeId: "group", task: { state: "open", progress: 0 } },
  ]);
  assert.equal(result[0].task.progress, 50);
});

test("formats visible and TaskPaper-compatible task metadata", () => {
  const node = { task: { state: "open", priority: 1, dueDate: "2020-01-01", progress: 25, marker: "★" }, tags: [{ name: "RBI", color: "#f00" }] };
  assert.equal(isTaskOverdue(node.task, "2020-01-02"), true);
  assert.match(taskIndicator(node), /☐ P1 25% ★ OVERDUE #RBI/);
  assert.equal(taskMarkdown("Study", node), "- [ ] Study @priority(1) @due(2020-01-01) @progress(25) @marker(★) #RBI");
});

test("shows a node icon even when the node is not a task", () => {
  assert.equal(taskIndicator({ icon: "📈" }), "📈");
});
