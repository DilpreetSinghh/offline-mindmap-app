import assert from "node:assert/strict";
import test from "node:test";
import { isOutlinePaste, parseIndentedOutline } from "../src/outline-format.mjs";

test("parses Markdown and numbered lists into a stable hierarchy", () => {
  const records = parseIndentedOutline(`- Alpha
  - Beta
    1. Gamma
  - Delta
- Epsilon`);
  assert.deepEqual(records, [
    { text: "Alpha", parentIndex: null, depth: 0 },
    { text: "Beta", parentIndex: 0, depth: 1 },
    { text: "Gamma", parentIndex: 1, depth: 2 },
    { text: "Delta", parentIndex: 0, depth: 1 },
    { text: "Epsilon", parentIndex: null, depth: 0 },
  ]);
});

test("supports tabs, Unicode, plain text and task markers", () => {
  assert.deepEqual(parseIndentedOutline("भारत\n\t[ ] 子 topic\nSecond"), [
    { text: "भारत", parentIndex: null, depth: 0 },
    { text: "子 topic", parentIndex: 0, depth: 1, task: { state: "open" } },
    { text: "Second", parentIndex: null, depth: 0 },
  ]);
});

test("round-trips task metadata and tags from Markdown or TaskPaper", () => {
  const records = parseIndentedOutline(`- [ ] Study RBI @priority(1) @due(2026-08-15) @progress(25) @marker(★) #Finance #RBI\n  - Finished @done #Revision`);
  assert.deepEqual(records[0].task, { state: "open", priority: 1, dueDate: "2026-08-15", progress: 25, marker: "★" });
  assert.deepEqual(records[0].tags.map((tag) => tag.name), ["Finance", "RBI"]);
  assert.equal(records[0].text, "Study RBI");
  assert.equal(records[1].task.state, "done");
  assert.equal(records[1].parentIndex, 0);
});

test("only claims structured paste payloads", () => {
  assert.equal(isOutlinePaste("ordinary sentence"), false);
  assert.equal(isOutlinePaste("- one"), true);
  assert.equal(isOutlinePaste("one\n  two"), true);
});
