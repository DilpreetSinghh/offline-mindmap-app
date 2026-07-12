import assert from "node:assert/strict";
import test from "node:test";
import { formatShortcutLabel, routeMindmapShortcut } from "../src/shortcut-routing.mjs";

test("maps all macOS and Windows/Linux directional creation shortcuts", () => {
  for (const [key, command] of [["ArrowLeft", "new-left"], ["ArrowRight", "new-right"], ["ArrowUp", "new-up"], ["ArrowDown", "new-down"]]) {
    assert.equal(routeMindmapShortcut({ key, metaKey: true }), command);
    assert.equal(routeMindmapShortcut({ key, ctrlKey: true }), command);
  }
});

test("maps navigation, child, sibling and help shortcuts", () => {
  assert.equal(routeMindmapShortcut({ key: "ArrowLeft" }), "select-left");
  assert.equal(routeMindmapShortcut({ key: "ArrowRight" }), "select-right");
  assert.equal(routeMindmapShortcut({ key: "ArrowUp" }), "select-up");
  assert.equal(routeMindmapShortcut({ key: "ArrowDown" }), "select-down");
  assert.equal(routeMindmapShortcut({ key: "Tab" }), "new-child");
  assert.equal(routeMindmapShortcut({ key: "Enter", metaKey: true }), "new-sibling");
  assert.equal(routeMindmapShortcut({ key: "Enter", ctrlKey: true }), "new-sibling");
  assert.equal(routeMindmapShortcut({ key: "Enter" }), null);
  assert.equal(routeMindmapShortcut({ key: "?", shiftKey: true }), "shortcut-help");
  assert.equal(routeMindmapShortcut({ key: "f", metaKey: true }), "search-map");
  assert.equal(routeMindmapShortcut({ key: "F", ctrlKey: true }), "search-map");
});

test("does not intercept editing, form controls or browser modifier combinations", () => {
  assert.equal(routeMindmapShortcut({ key: "ArrowRight", metaKey: true }, { editing: true }), null);
  assert.equal(routeMindmapShortcut({ key: "Enter" }, { formControl: true }), null);
  assert.equal(routeMindmapShortcut({ key: "ArrowLeft", altKey: true }), null);
  assert.equal(routeMindmapShortcut({ key: "ArrowLeft", shiftKey: true }), null);
  assert.equal(routeMindmapShortcut({ key: "Tab", shiftKey: true }), null);
  assert.equal(routeMindmapShortcut({ key: "v", metaKey: true }), null);
});

test("formats platform-appropriate modifier labels", () => {
  assert.equal(formatShortcutLabel("Cmd/Ctrl+→", "MacIntel"), "⌘→");
  assert.equal(formatShortcutLabel("Cmd/Ctrl+→", "Win32"), "Ctrl+→");
  assert.equal(formatShortcutLabel("Cmd/Ctrl+Enter", "Linux x86_64"), "Ctrl+Enter");
});
