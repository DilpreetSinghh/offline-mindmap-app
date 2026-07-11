import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";

const html = await readFile(new URL("../index.html", import.meta.url), "utf8");
const app = await readFile(new URL("../app.js", import.meta.url), "utf8");
const scriptSources = [...html.matchAll(/<script\b[^>]*\bsrc=["']([^"']+)["']/gi)].map(
  (match) => match[1]
);

assert.equal(
  scriptSources.some((source) => /^https?:\/\//i.test(source)),
  false,
  "Runtime scripts must be served locally so the app works offline"
);
assert.ok(
  scriptSources.includes("vendor/pdf-lib.min.js"),
  "index.html must load the vendored pdf-lib bundle"
);
assert.ok(scriptSources.includes("storage.js"), "index.html must load the storage module");
assert.ok(scriptSources.includes("hierarchy.js"), "index.html must load the hierarchy module");
assert.ok(scriptSources.includes("shortcuts.js"), "index.html must load the shortcut module");

assert.doesNotMatch(html, /<button(?![^>]*\btype=["']button["'])/gi, "Every button must declare type=button");
assert.match(html, />Save locally<\/button>/, "The explicit map save action must be labelled Save locally");
assert.match(html, />Save as copy<\/button>/, "The toolbar must expose Save as copy");
assert.match(html, /name="source-commit" content="__SOURCE_SHA__"/, "The deploy build must expose its source SHA");

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
