import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";

const html = await readFile(new URL("../classic/index.html", import.meta.url), "utf8");
const betaHtml = await readFile(new URL("../index.html", import.meta.url), "utf8");
const app = await readFile(new URL("../app.js", import.meta.url), "utf8");
const betaApp = await readFile(new URL("../src/App.tsx", import.meta.url), "utf8");
const betaDocument = await readFile(new URL("../src/document.ts", import.meta.url), "utf8");
const betaDatabase = await readFile(new URL("../src/db.ts", import.meta.url), "utf8");
const betaCommands = await readFile(new URL("../src/commands.ts", import.meta.url), "utf8");
const betaOperations = await readFile(new URL("../src/mindmap-operations.ts", import.meta.url), "utf8");
const betaExports = await readFile(new URL("../src/exports.ts", import.meta.url), "utf8");
const simpleMindmap = await readFile(new URL("../src/SimpleMindmap.tsx", import.meta.url), "utf8");
const outlineView = await readFile(new URL("../src/OutlineView.tsx", import.meta.url), "utf8");
const scriptSources = [...html.matchAll(/<script\b[^>]*\bsrc=["']([^"']+)["']/gi)].map(
  (match) => match[1]
);

assert.equal(
  scriptSources.some((source) => /^https?:\/\//i.test(source)),
  false,
  "Runtime scripts must be served locally so the app works offline"
);
assert.ok(
  scriptSources.includes("../pdf-lib.min.js"),
  "classic recovery must load the vendored pdf-lib bundle"
);
assert.ok(scriptSources.includes("../storage.js"), "classic recovery must load the storage module");
assert.ok(scriptSources.includes("../hierarchy.js"), "classic recovery must load the hierarchy module");
assert.ok(scriptSources.includes("../shortcuts.js"), "classic recovery must load the shortcut module");

assert.doesNotMatch(html, /<button(?![^>]*\btype=["']button["'])/gi, "Every button must declare type=button");
assert.match(html, />Save locally<\/button>/, "The explicit map save action must be labelled Save locally");
assert.match(html, />Save as copy<\/button>/, "The toolbar must expose Save as copy");
assert.match(betaHtml, /name="source-commit" content="__SOURCE_SHA__"/, "The deploy build must expose its source SHA");
assert.match(betaHtml, /src="\/src\/main\.tsx"/, "The public beta must boot the Vite React editor");
assert.doesNotMatch(betaHtml, /Whiteboard Beta/, "The modern editor must be presented as the default experience");
assert.match(betaApp, /<Excalidraw/, "The public beta must embed Excalidraw core");
assert.match(betaApp, /Classic recovery/, "The public beta must retain a classic recovery path");
assert.match(betaApp, /Save locally/, "The public beta must expose local named-map save");
assert.match(betaApp, /Save as copy/, "The public beta must expose save-as-copy");
assert.match(betaApp, /surfaceMode === "whiteboard"/, "The default app must support whiteboard and simple views");
assert.match(betaApp, /detectsMobileUse/, "The app must automatically detect mobile use");
assert.match(betaApp, /editingTextElement:\s*null/, "Transient text-editing state must not survive recovery or reload");
assert.doesNotMatch(betaApp, /context-menu/, "The app must not layer a custom context menu over Excalidraw");
assert.match(betaCommands, /routeMindmapShortcut/, "Keyboard commands must use the platform-neutral tested shortcut router");
assert.match(betaApp, /aria-label="Search shortcuts"/, "The shortcut reference opened by ? must be searchable");
assert.match(betaCommands, /Rearrange mind map/, "Existing maps must expose an explicit spacing repair command");
assert.match(betaOperations, /shouldReflowAfterInsertion\(direction\)/, "All supported insertion paths must share the reflow policy");
assert.match(betaOperations, /inferBoundTree/, "Rearrange must include ordinary shapes connected with arrows");
assert.match(betaExports, /await import\("pdf-lib"\)/, "Modern PDF export must lazy-load its bundled offline PDF engine");
assert.doesNotMatch(betaExports, /mimeType: "image\/png", quality:/, "PNG export must not pass an ignored quality option");
assert.match(betaExports, /clipboard-download-fallback/, "Clipboard export must fall back to a PNG download when permission is unavailable");
assert.match(simpleMindmap, /Simple mind map/, "A non-Excalidraw simple mobile surface must be available");
assert.match(simpleMindmap, /simple-arrow/, "Simple mode must render visible hierarchy arrows");
assert.match(betaApp, /surfaceMode === "outline"/, "The active map must expose a synchronised outline surface");
assert.match(outlineView, /rows\.slice\(start, end\)/, "Large outlines must render a virtual window instead of every row");
assert.match(outlineView, /Alt\+↑\/↓ reorder/, "The outline must advertise keyboard structural editing");
assert.match(outlineView, /outlineMarkdown/, "The outline must support independent Markdown export");
assert.match(betaDocument, /schemaVersion:\s*DOCUMENT_SCHEMA_VERSION/, "DocumentV3 must carry an explicit schema version");
assert.match(betaDocument, /mindmapNode/, "Mind-map semantics must be stored in element customData");
assert.match(betaDocument, /mindmapConnection/, "Connection semantics must be stored in element customData");
assert.match(betaDocument, /if \(nodes\.size\)/, "Whiteboard-only documents must validate without a mind-map root");
assert.match(betaApp, /mergeFoldedScene\(tab\.document\.scene\.elements, api\.getSceneElements\(\)\)[\s\S]*normaliseRootlessWhiteboard\(merged, tab\.document\.rootNodeId\)/, "Local save must merge folded content and normalise a deleted-root scene before validation");
assert.match(betaCommands, /Selected shape is now the root mind-map node/, "A selected whiteboard shape must be promotable to a replacement root");
assert.match(betaCommands, /offline-mindmap-subtree/, "Subtree clipboard data must use an explicit versioned format");
assert.match(betaCommands, /appendStyledConnection/, "Subtree paste must restore internal styled connections");
assert.match(betaCommands, /removeMindmapSubtrees/, "Bulk deletion must remove selected branches in one transaction");
assert.match(betaApp, /addEventListener\("paste"/, "External Markdown and plain-text lists must be handled from the paste event");
assert.match(betaDocument, /projectFoldedElements/, "Collapsed descendants must be projected out of the Excalidraw scene");
assert.match(betaApp, /mergeFoldedScene/, "Visible Excalidraw edits must merge back into the full canonical document");
assert.match(betaCommands, /Collapse all branches/, "The command layer must expose level and all-branch folding");
assert.match(simpleMindmap, /Expand \+/, "Simple mode must show hidden descendant counts on collapsed nodes");
assert.match(betaDatabase, /indexedDB\.open/, "Schema-3 documents must use IndexedDB");
assert.match(betaDatabase, /compareMigration/, "Migration must perform read-back hierarchy verification");

await access(new URL("../vendor/pdf-lib.min.js", import.meta.url));
await access(new URL("../vendor/pdf-lib.LICENSE.md", import.meta.url));

assert.match(
  app,
  /connectorStyleSelect\.value\s*=\s*state\.connectorStyle/,
  "The connector-style control must be synchronised from the active tab"
);
assert.match(
  app,
  /if \(index < activeTabIndex\)[\s\S]*?activeTabIndex -= 1/,
  "Closing a tab to the left must preserve the active tab"
);
assert.match(
  app,
  /format === "heif" && !\/\^image\\\/hei\[cf\]/,
  "HEIF export must validate the encoder's returned MIME type"
);

console.log("Static offline-dependency checks passed.");
