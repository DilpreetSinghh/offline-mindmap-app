# Offline Mind Map App

A fully offline, client-side mind-map web application that runs entirely in the browser. It stores maps locally (in `localStorage`) and never sends your data to a server.

## Features

- Single-page application, works on desktop and mobile.
- Canvas-based mind-map editor with:
  - Node creation, text editing, drag-and-drop.
  - Miro-inspired sticky-note styling and whiteboard background.
  - Double-click inline editing on nodes.
  - Keyboard shortcuts: Tab for child node, Enter for sibling, Delete/Backspace to remove.
  - Panning and zooming (mouse wheel and pinch on touch).
  - Auto-fit to centre all nodes.
- Local persistence using `localStorage` (no backend, no analytics, no accounts).
- Settings panel for node colour, font size, connector style, and layout presets (radial/tree/flow).
- Export panel with:
  - Formats: PDF, PNG, JPEG, HEIF (with graceful fallback).
  - Quality presets (low/medium/high/max) that scale render resolution.
  - Output sizes: screen, A4, A3, or custom width × height in pixels.
- High-resolution exports rendered via an offscreen canvas so diagrams stay crisp when zoomed or printed.

## Technology

- Pure HTML/CSS/JavaScript bundle (no Node/SSR).
- Canvas-based rendering for interactive editing and export.
- [pdf-lib](https://github.com/Hopding/pdf-lib) for high-resolution client-side PDF generation using the exported canvas image.
- `canvas.toBlob` + `URL.createObjectURL` for PNG/JPEG/HEIF downloads.

## Running locally

1. Clone the repository:

   ```bash
   git clone https://github.com/DilpreetSinghh/offline-mindmap-app.git
   cd offline-mindmap-app
   ```

2. Open `index.html` directly in a modern browser, or serve the folder with a simple static server:

   ```bash
   python -m http.server 8000
   ```

3. Navigate to `http://localhost:8000` and start sketching mind maps.

All maps stay inside your browser storage. There is no telemetry, analytics, or server-side processing.

## Publishing

This repository is designed to be deployed as a static site (no backend). Common options:

- **GitHub Pages**
  - In GitHub, go to **Settings → Pages**.
  - Under **Source**, choose the `main` branch and the root (`/`) folder.
  - Save; GitHub will build and serve the site at a URL like `https://<user>.github.io/offline-mindmap-app/`.
- **Other static hosts** (Netlify, Vercel, Cloudflare Pages, etc.)
  - Connect this repo and configure as a static site with `index.html` as the entry point.
  - No build command is required; just serve the files as-is.

## License

This project is licensed under the **MIT License**. See the [LICENSE](LICENSE) file for details.

## Third‑party libraries

- [pdf-lib](https://github.com/Hopding/pdf-lib) — used for client-side PDF generation; it is licensed under the MIT license, and its license notice is preserved via this README and the linked LICENSE in the pdf-lib repository.
