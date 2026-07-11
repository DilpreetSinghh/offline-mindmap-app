(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.MindMapShortcuts = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  function getLocalSaveIntent(event) {
    if (!event || String(event.key).toLowerCase() !== "s") return null;
    if (!event.metaKey && !event.ctrlKey) return null;
    if (event.altKey) return null;
    return event.shiftKey ? "copy" : "save";
  }

  return { getLocalSaveIntent };
});
