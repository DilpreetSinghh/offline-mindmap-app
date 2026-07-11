import {
  exportToBlob,
  exportToClipboard,
  exportToSvg,
  serializeAsJSON,
} from "@excalidraw/excalidraw";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import type { DocumentV3 } from "./types";

export type ExportFormat = "png" | "svg" | "pdf" | "clipboard" | "excalidraw";

function safeName(name: string): string {
  return name.trim().replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase() || "mind-map";
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 2_000);
}

function exportState(api: ExcalidrawImperativeAPI) {
  return {
    elements: api.getSceneElements(),
    appState: { ...api.getAppState(), exportBackground: true, exportWithDarkMode: false },
    files: api.getFiles(),
  };
}

export async function exportScene(api: ExcalidrawImperativeAPI, name: string, format: ExportFormat): Promise<void> {
  const state = exportState(api);
  const filename = safeName(name);
  if (format === "clipboard") {
    await exportToClipboard({ ...state, type: "png" });
    return;
  }
  if (format === "excalidraw") {
    const json = serializeAsJSON(state.elements, state.appState, state.files, "local");
    downloadBlob(new Blob([json], { type: "application/json" }), `${filename}.excalidraw`);
    return;
  }
  if (format === "svg") {
    const svg = await exportToSvg(state);
    downloadBlob(new Blob([svg.outerHTML], { type: "image/svg+xml" }), `${filename}.svg`);
    return;
  }
  const png = await exportToBlob({ ...state, mimeType: "image/png", quality: 1 });
  if (!png) throw new Error("PNG export failed.");
  if (format === "png") {
    downloadBlob(png, `${filename}.png`);
    return;
  }
  if (!window.PDFLib?.PDFDocument) throw new Error("The local PDF exporter is unavailable.");
  const pdf = await window.PDFLib.PDFDocument.create();
  const image = await pdf.embedPng(await png.arrayBuffer());
  const pageWidth = 842;
  const pageHeight = 595;
  const scale = Math.min(pageWidth / image.width, pageHeight / image.height);
  const width = image.width * scale;
  const height = image.height * scale;
  const page = pdf.addPage([pageWidth, pageHeight]);
  page.drawImage(image, { x: (pageWidth - width) / 2, y: (pageHeight - height) / 2, width, height });
  const bytes = await pdf.save();
  const buffer = new Uint8Array(bytes).buffer;
  downloadBlob(new Blob([buffer], { type: "application/pdf" }), `${filename}.pdf`);
}

export function downloadNativeBackup(documents: DocumentV3[]): void {
  const payload = {
    format: "offline-mindmap-native-backup",
    schemaVersion: 3,
    exportedAt: new Date().toISOString(),
    documents,
  };
  const stamp = payload.exportedAt.slice(0, 19).replace(/[:T]/g, "-");
  downloadBlob(new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" }), `offline-mindmap-backup-${stamp}.json`);
}
