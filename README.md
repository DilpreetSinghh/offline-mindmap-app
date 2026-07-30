# Offline Whiteboard

**Powered by Excalidraw.** Offline Whiteboard is a static, local-first drawing editor for GitHub Pages. The root application embeds the stock Excalidraw 0.18.1 editor and keeps its native tools, properties, shortcuts, search, help, themes, libraries, image handling and export controls.

There is no backend, account, collaboration service, AI, telemetry or Obsidian dependency. Drawing data remains in browser storage or files explicitly exported by the user.

## Application-specific features

- **Browser drawings and version history** use the isolated `offline-whiteboard-v1` IndexedDB database. Dirty drawings receive distinct revisions every 30 seconds and before drawing switches, imports, explicit saves, tab hiding and page exit when the browser permits it.
- **Recovery on reload** restores the latest valid revision of the active browser drawing.
- **Storage management** requests persistent storage, monitors quota, prunes only old non-latest revisions above the newest 25 per drawing, and garbage-collects unreferenced binary assets. Native Excalidraw editing and file operations remain available if storage fails.
- **PDF export** supports one-page A4 auto-fit, one canvas-sized page, and tiled A4 output with 10 mm margins and 5 mm overlap at 96 CSS pixels per inch.
- **Permanent legacy recovery** at `/legacy/` reads old data without migrating or overwriting it. `/classic/` redirects to that frozen export-only surface.

## File compatibility

The editor uses Excalidraw's official `loadFromBlob` import path for native `.excalidraw`/JSON files and PNG/SVG files containing embedded Excalidraw scenes. The stock export interface provides `.excalidraw`, PNG, SVG and clipboard output. PDF is the only additional rendering format.

## Development

```bash
npm install
npm run dev
```

Required acceptance checks:

```bash
npm test
npm run build
```

The Vite build produces independent root and `/legacy/` entry points plus the `/classic/` redirect. `SOURCE_SHA` is embedded in page metadata during deployment.

## Deployment

The project is a static site suitable for GitHub Pages. All Excalidraw fonts, application assets and PDF code are bundled locally; the production application makes no CDN or runtime data requests.

## Legacy recovery policy

The legacy route is permanent but frozen. Maintenance is limited to data-loss, compatibility and security fixes. It supports schema-3 `offline-mindmap-v3` IndexedDB records, schema-2 workspace data, schema-1/classic local-storage maps and user-selected historical backup JSON files.

## Licence and attribution

Offline Whiteboard is distributed under the [MIT Licence](LICENSE).

- [Excalidraw](https://github.com/excalidraw/excalidraw), pinned at 0.18.1, is MIT-licensed.
- [pdf-lib](https://github.com/Hopding/pdf-lib) is MIT-licensed; its vendored notice is retained in `vendor/pdf-lib.LICENSE.md`.

“Excalidraw” is used solely to identify the upstream open-source editor that powers this application.
