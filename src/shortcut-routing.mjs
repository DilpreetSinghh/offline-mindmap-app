/**
 * Route app-level keyboard events without depending on DOM or React state.
 * This keeps platform behaviour directly testable in Node.
 *
 * @param {{key?: string, metaKey?: boolean, ctrlKey?: boolean, altKey?: boolean, shiftKey?: boolean}} event
 * @param {{editing?: boolean, formControl?: boolean}} [state]
 * @returns {string | null}
 */
export function routeMindmapShortcut(event, state = {}) {
  const key = event.key ?? "";
  const modifier = Boolean(event.metaKey || event.ctrlKey);
  if (modifier && !event.altKey && key.toLowerCase() === "k") return "command-palette";
  if (state.editing || state.formControl) return null;
  if (!modifier && !event.altKey && key === "?") return "shortcut-help";
  if (event.altKey || event.shiftKey) return null;
  if (modifier && key.startsWith("Arrow")) return `new-${key.slice(5).toLowerCase()}`;
  if (!modifier && key.startsWith("Arrow")) return `select-${key.slice(5).toLowerCase()}`;
  if (!modifier && key === "Tab") return "new-child";
  if (!modifier && key === "Enter") return "new-sibling";
  if (modifier && key.toLowerCase() === "c") return "copy-subtree";
  if (modifier && key.toLowerCase() === "x") return "cut-subtree";
  if (modifier && key.toLowerCase() === "v") return "paste-subtree";
  if (modifier && key.toLowerCase() === "d") return "duplicate-subtree";
  if (!modifier && (key === "Delete" || key === "Backspace")) return "delete-subtree";
  return null;
}

/** @param {string} shortcut @param {string} platform */
export function formatShortcutLabel(shortcut, platform) {
  const isMac = /mac|iphone|ipad|ipod/i.test(platform);
  return shortcut.replaceAll("Cmd/Ctrl+", isMac ? "⌘" : "Ctrl+");
}
