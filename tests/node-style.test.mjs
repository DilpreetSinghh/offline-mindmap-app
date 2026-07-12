import assert from "node:assert/strict";
import test from "node:test";
import { inheritedNodeStyle } from "../src/node-style.mjs";

test("new topics inherit source shape and text styling without content", () => {
  const style = inheritedNodeStyle(
    { backgroundColor: "#abc", strokeColor: "#123", fillStyle: "solid", strokeWidth: 4, strokeStyle: "dashed", roughness: 0, opacity: 70, roundness: { type: 3 }, customData: { mindmapNode: { notes: "private" } } },
    { fontFamily: 2, fontSize: 28, strokeColor: "#456", textAlign: "left", verticalAlign: "top", opacity: 80, text: "Parent" },
  );
  assert.equal(style.shape.backgroundColor, "#abc");
  assert.equal(style.label.fontSize, 28);
  assert.equal("customData" in style.shape, false);
  assert.equal("text" in style.label, false);
});
