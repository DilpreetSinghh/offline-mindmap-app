# Offline Mind Map App

A fully offline, client-side mind-map web application that runs entirely in the browser. It stores maps locally (in `localStorage`) and never sends your data to a server.

The UI is inspired by tools like Apple Freeform and Miro: you drag a canvas around, drop sticky-style nodes, and build branches using directional handles around each node.

## Key features

- **Runs completely offline**
  - Pure HTML/CSS/JavaScript bundle – no Node backend, no server calls.
  - All data is kept in browser memory and `localStorage`; there is no telemetry, analytics, or account system.

- **Tabbed workspace**
  - Open multiple maps at once using a tab bar at the top of the canvas.
  - Each tab has its own independent state (nodes, layout, camera position, styles).
  - Tabs can be renamed via the Save flow (name = map name) and closed individually.

- **Local map storage**
  - Maps are stored under a single key in `localStorage` (`offline-mindmap-maps-v1`).[cite:168]
  - The toolbar offers:
    - **New tab** – start a fresh map in a new tab.
    - **Save** – prompt for a name and persist the active tab’s state.
    - **Open in new tab** – load a saved map from the dropdown into its own tab.
  - No map content is ever uploaded anywhere – everything stays in your browser.

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
  - **Esc** – clear the current selection.

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

- **index.html**
  - Defines the SPA chrome: toolbar, tab bar, left Settings panel, central canvas, and right Export panel.[cite:167]
  - Loads `pdf-lib` from a CDN for client-side PDF generation and the app script (`app.js`).

- **app.js**
  - Implements the entire editor:
    - Data model for nodes, connections, tabs, history, and view transforms (pan/zoom).
    - Canvas rendering of nodes and connectors, including Freeform-style arrow handles.
    - Inline editing logic (floating textarea), drag-and-drop, pan/zoom, and pinch handling.
    - Layout algorithms (free, radial, tree, flow) and optional periodic auto layout.
    - Local storage of maps and the toolbar flows for New / Save / Open.
    - Export engine using offscreen canvases plus `pdf-lib` for PDF and `canvas.toBlob` + `URL.createObjectURL` for image formats.[cite:168]

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

2. Open `index.html` directly in a modern browser **or** serve the folder with a simple static server:

   ```bash
   python -m http.server 8000
   ```

3. Navigate to `http://localhost:8000` (or the port you chose) and start sketching mind maps.

All maps stay inside your browser storage. There is no telemetry, analytics, or server-side processing.

## Publishing

This repository is designed to be deployed as a static site (no backend). Common options:

- **GitHub Pages**
  - In GitHub, go to **Settings → Pages** for this repository.
  - Under **Build and deployment → Source**, choose **Deploy from a branch**.
  - Select the `main` branch and the root (`/`) folder.
  - Save; GitHub will build and serve the site at a URL like `https://<user>.github.io/offline-mindmap-app/`.[cite:170]

- **Other static hosts** (Netlify, Vercel, Cloudflare Pages, etc.)
  - Connect this repo and configure it as a static site with `index.html` as the entry point.
  - No build step is required – just serve the files as they are.

## Roadmap ideas

Some ideas that could be explored on top of the current foundation:

- More advanced automatic layouts (force-directed, orthogonal tree, mind-map style left/right balancing).
- Inline icons / emojis inside nodes.
- Export/import of maps as JSON files.
- Optional IndexedDB persistence for larger maps.

## License

This project is licensed under the **MIT License**. See the [LICENSE](LICENSE) file for details.

## Third‑party libraries

- [pdf-lib](https://github.com/Hopding/pdf-lib) — used for client-side PDF generation; it is licensed under the MIT licence, and its licence notice is preserved via this README and the linked upstream repository.
