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
    { text: "子 topic", parentIndex: 0, depth: 1 },
    { text: "Second", parentIndex: null, depth: 0 },
  ]);
});

test("only claims structured paste payloads", () => {
  assert.equal(isOutlinePaste("ordinary sentence"), false);
  assert.equal(isOutlinePaste("- one"), true);
  assert.equal(isOutlinePaste("one\n  two"), true);
});
