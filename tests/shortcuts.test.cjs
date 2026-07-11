const test = require("node:test");
const assert = require("node:assert/strict");
const { getLocalSaveIntent } = require("../shortcuts.js");

test("maps macOS save shortcuts before editor guards", () => {
  assert.equal(getLocalSaveIntent({ key: "s", metaKey: true }), "save");
  assert.equal(getLocalSaveIntent({ key: "S", metaKey: true, shiftKey: true }), "copy");
});

test("maps Windows and Linux save shortcuts", () => {
  assert.equal(getLocalSaveIntent({ key: "s", ctrlKey: true }), "save");
  assert.equal(getLocalSaveIntent({ key: "s", ctrlKey: true, shiftKey: true }), "copy");
});

test("ignores browser and unrelated key combinations", () => {
  assert.equal(getLocalSaveIntent({ key: "s" }), null);
  assert.equal(getLocalSaveIntent({ key: "s", ctrlKey: true, altKey: true }), null);
  assert.equal(getLocalSaveIntent({ key: "z", metaKey: true }), null);
});
