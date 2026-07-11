# Offline Mind Map App

A fully offline, client-side mind-map and whiteboard application. The `public-beta` build uses Excalidraw core, React, TypeScript and IndexedDB while retaining the original canvas editor as a classic recovery route. It never sends map data to a server.

The beta combines a keyboard-fast semantic mind-map layer with Excalidraw's general whiteboard tools. The classic canvas UI remains available at `classic/index.html` for one recovery deployment.

## Public beta editor

- **Excalidraw whiteboard**
  - Rectangle, ellipse, diamond, text, image, line, arrow, freehand, eraser and frame tools.
  - Marquee and multi-selection, resize, rotate, align, distribute, groups, layers, locking, snapping, grid and zoom.
  - Local libraries and image files are persisted in IndexedDB; production fonts and editor assets are bundled locally.
  - Built-in blank mind-map and four-branch brainstorm templates are reusable without a network connection.
- **Semantic mind maps**
  - Mind-map node and hierarchy metadata live in Excalidraw element `customData`.
  - Tab/Enter create child and sibling nodes; Cmd/Ctrl+Arrow creates a bound node in a direction.
  - Plain arrows navigate to the nearest visible mind-map node.
  - Subtree copy, cut, paste, duplication and deletion share one command registry with the toolbar, context menu and searchable command palette.
  - Hierarchy arrows reject cycles; relationship arrows allow cycles and never change hierarchy.
- **Local persistence**
  - Named schema-3 documents and binary assets are stored in IndexedDB.
  - Autosave writes a separate validated workspace-recovery snapshot.
  - First launch migrates schema-2 saved maps and open tabs, reads the result back, compares counts/hierarchy and retains the schema-2 localStorage copy.
  - **Save locally** asks for a name only on first save; **Save as copy** creates a new ID.
- **Export and recovery**
  - PNG, SVG, PDF, clipboard and native Excalidraw JSON exports.
  - Native schema-3 backup/restore includes binary files and validates the complete backup before an atomic database write.
  - The classic editor and schema-2 JSON backup remain available for recovery.

## Key features

- **Runs completely offline**
  - Static Vite bundle – no backend, account, telemetry or map-data network calls.
  - Documents and assets use IndexedDB; schema-2 recovery remains in `localStorage`.

- **Tabbed workspace**
  - Open multiple maps at once using a tab bar at the top of the canvas.
  - Each tab has its own independent state (nodes, layout, camera position, styles).
  - Tabs are named on first explicit save and can be closed individually.

- **Local map storage**
  - Beta maps are schema-3 documents in IndexedDB; classic maps remain under `offline-mindmap-maps-v1` for recovery.
  - The toolbar offers:
    - **New tab** – start a fresh map in a new tab.
    - **Save locally** – prompt once for a name, then silently update that named map.
    - **Save as copy** – create a new named map with a separate local ID.
    - **Open in new tab** – load a saved map from the dropdown into its own tab.
  - No map content is ever uploaded anywhere – everything stays in your browser.

- **Autosave and recovery**
  - Workspace changes are saved automatically after a short delay.
  - Open tabs, the active tab, map content, camera position, styles, and layout settings return after a refresh or browser restart.
  - The previous valid recovery snapshot is retained if the latest snapshot is corrupt or cannot be written.
  - Versioned JSON backup and restore provides a portable offline copy of saved maps and the open workspace.
  - Backup files are validated before any existing data is replaced.

- **Canvas-based editor**
  - Nodes are drawn on an HTML `<canvas>` with rounded rectangles and soft drop shadows.[cite:168]
  - Connector lines are drawn between parent and child nodes, with support for solid or dashed styles.
  - Rendering is pan/zoom aware so you can freely move around large diagrams.

- **Freeform-style node handles**
  - When you hover or select a node, circular arrow handles appear around it (top, bottom, left, right, and diagonals).[cite:168]
  - Clicking a handle instantly creates a child node in that direction, already connected to the parent.
  - This makes it fast to grow branches without going back to the toolbar.

- **Inline node editing**
  - Double-click a node to edit its text directly in place – a floating textarea appears on top of the node.[cite:168]
  - New nodes open the inline editor automatically so you can type straight away.
  - Press **Enter** to confirm (single line), **Shift+Enter** for a line break, and **Esc** to cancel.

- **Keyboard shortcuts**
  - **Tab** – create a child node of the currently selected node and focus its editor.
  - **Enter** – create a sibling node underneath the current node.
  - **Delete / Backspace** – delete the selected node (and its descendants), protected so the root cannot be removed.[cite:168]
  - **Ctrl/Cmd+Z** – undo, **Ctrl/Cmd+Shift+Z** – redo.[cite:168]
  - **Ctrl/Cmd+S** – save locally, **Ctrl/Cmd+Shift+S** – save as a new copy.
  - **Esc** – clear the current selection.
  - **Shift+Alt+← / →** – outdent or indent the selected node.
  - **Shift+Alt+↑ / ↓** – move the selected node before or after its sibling.

- **Structural editing**
  - Drag a node onto another node to reparent its complete subtree.
  - Valid drop targets receive a green outline; self-links and hierarchy cycles are blocked.
  - Explicit sibling order persists through layout, autosave, backup, and restore.

- **Navigation and zooming**
  - **Pan** by dragging the canvas background with mouse or single-finger touch.
  - **Zoom** with the mouse wheel (zoom-to-cursor behaviour) or two-finger pinch on touch devices.[cite:168]
  - **Auto-fit** button recentres and scales the view to fit all nodes with a margin.

- **Layout modes**
  - **Free** – manual layout; nodes stay where you drag them.
  - **Radial** – places direct children of the root in a circle around the centre.
  - **Tree** – uses a simple tree layout algorithm:
    - Computes depths and horizontal indices to keep siblings aligned.
    - Supports directions: top→bottom, bottom→top, left→right, right→left.[cite:168]
  - **Flow (left-to-right)** – arranges root children in a horizontal flow and scatters deeper descendants around their parents.
  - Optional **auto layout** can reapply the chosen layout every _N_ seconds.

- **Styling controls**
  - Node **outline**, **fill**, **text**, and **connector** colours.
  - Node **font size** (per-node, with an option to apply to all nodes at once).
  - Connector style: **solid** or **dashed**.

- **High-resolution export**
  - Export panel supports **PDF**, **PNG**, **JPEG**, and **HEIF** (with graceful fallback if the browser does not support HEIF).[cite:167][cite:168]
  - Quality presets (low / medium / high / max) control both DPI-like scale and JPEG/HEIF quality factors.
  - Output sizes: **screen**, **A4**, **A3**, or **custom width × height** in pixels.
  - Exports render to an offscreen canvas at the requested resolution so files stay crisp when zoomed or printed.

- **Privacy by design**
  - There are no analytics scripts, no network requests for map data, and no cookies beyond what the browser itself uses for normal operation.

## Architecture overview

- **src/App.tsx**
  - React application shell, tabs, named local maps, command palette, keyboard routing, save/backup/restore and Excalidraw integration.

- **src/document.ts**
  - DocumentV3 creation and validation, schema-2 conversion, canonical mind-map metadata, bound-arrow construction and cycle-safe retargeting.

- **src/db.ts**
  - IndexedDB documents, binary assets, local libraries, recovery snapshots and verified migration.

- **src/commands.ts**
  - Single transaction-oriented command registry used by mind-map buttons, shortcuts, context menu and command palette.

- **classic/index.html**, **app.js**, **storage.js**, **hierarchy.js**
  - The original schema-2 canvas editor retained as a recovery route.

- **index.html**
  - Defines the SPA chrome: toolbar, tab bar, left Settings panel, central canvas, and right Export panel.[cite:167]
  - Loads the vendored `pdf-lib` browser bundle for offline PDF generation and the app script (`app.js`).

- **app.js**
  - Implements the entire editor:
    - Data model for nodes, connections, tabs, history, and view transforms (pan/zoom).
    - Canvas rendering of nodes and connectors, including Freeform-style arrow handles.
    - Inline editing logic (floating textarea), drag-and-drop, pan/zoom, and pinch handling.
    - Layout algorithms (free, radial, tree, flow) and optional periodic auto layout.
    - Local storage of maps and the toolbar flows for New / Save / Open.
    - Export engine using offscreen canvases plus `pdf-lib` for PDF and `canvas.toBlob` + `URL.createObjectURL` for image formats.[cite:168]

- **storage.js**
  - Defines the versioned backup schema, validation rules, and migrations used by autosave and JSON restore.

- **shortcuts.js**
  - Defines platform-neutral shortcut intent detection, including local save and save-as-copy.

- **styles.css**
  - Dark, glassy UI with soft gradients and rounded panels.
  - Responsive three-column layout on desktop (Settings → Canvas → Export), collapsing to stacked panels on smaller screens.
  - Styling for the tab bar, buttons, inline node editor, and hint overlay at the bottom of the canvas.[cite:169]

## Running locally

1. Clone the repository:

   ```bash
   git clone https://github.com/DilpreetSinghh/offline-mindmap-app.git
   cd offline-mindmap-app
   ```

2. Install the exact locked dependencies and start Vite:

   ```bash
   npm install
   npm run dev
   ```

3. Open the local URL printed by Vite. Use `npm run build` to create the production `dist/` bundle.

All maps stay inside your browser storage. There is no telemetry, analytics, or server-side processing.

## Publishing

This repository is deployed as a static Vite site with no backend.

- **GitHub Pages**
  - In GitHub, go to **Settings → Pages** and set **Build and deployment → Source** to **GitHub Actions**.
  - Pushes to `public-beta` install the locked dependencies, run TypeScript and Vite builds, and publish `dist/`.
  - The deployed `index.html` includes a `source-commit` meta tag containing the source commit SHA for smoke-test verification.

- **Other static hosts** (Netlify, Vercel, Cloudflare Pages, etc.)
  - Build with `npm run build` and serve the generated `dist/` directory.

## Roadmap ideas

Some ideas that could be explored on top of the current foundation:

- More advanced automatic layouts (force-directed, orthogonal tree, mind-map style left/right balancing).
- Inline icons / emojis inside nodes.
- PWA packaging, the 10,000-node benchmark and the complete accessibility audit are tracked in issues #23 and #24.

## License

This project is licensed under the **MIT License**. See the [LICENSE](LICENSE) file for details.

## Third‑party libraries

- [pdf-lib](https://github.com/Hopding/pdf-lib) 1.17.1 — vendored for offline client-side PDF generation. Its MIT licence is preserved in [`vendor/pdf-lib.LICENSE.md`](vendor/pdf-lib.LICENSE.md).
- [Excalidraw](https://github.com/excalidraw/excalidraw) 0.18.1 — MIT-licensed editor core. No source from the AGPL Obsidian Excalidraw plugin is included.
- React and React DOM 19.2.7; Vite 8.1.4.
