import {
  exportToBlob,
  exportToClipboard,
  exportToSvg,
  serializeAsJSON,
} from "@excalidraw/excalidraw";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import type { DocumentV3 } from "./types";
import { referencedBinaryFiles } from "./attachments.mjs";

export type ExportFormat = "png" | "svg" | "pdf" | "clipboard" | "excalidraw";
export type ExportOutcome = "created" | "clipboard-download-fallback";

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
  const elements = api.getSceneElements();
  return {
    elements,
    appState: { ...api.getAppState(), exportBackground: true, exportWithDarkMode: false },
    files: referencedBinaryFiles(elements, api.getFiles()),
  };
}

export async function exportScene(api: ExcalidrawImperativeAPI, name: string, format: ExportFormat): Promise<ExportOutcome> {
  const state = exportState(api);
  const filename = safeName(name);
  if (format === "clipboard") {
    try {
      await Promise.race([
        exportToClipboard({ ...state, type: "png" }),
        new Promise<never>((_, reject) => window.setTimeout(() => reject(new Error("Clipboard export timed out.")), 3_000)),
      ]);
      return "created";
    } catch {
      const png = await exportToBlob({ ...state, mimeType: "image/png" });
      if (!png) throw new Error("Clipboard and fallback PNG export failed.");
      downloadBlob(png, `${filename}.png`);
      return "clipboard-download-fallback";
    }
  }
  if (format === "excalidraw") {
    const json = serializeAsJSON(state.elements, state.appState, state.files, "local");
    downloadBlob(new Blob([json], { type: "application/json" }), `${filename}.excalidraw`);
    return "created";
  }
  if (format === "svg") {
    const svg = await exportToSvg(state);
    downloadBlob(new Blob([svg.outerHTML], { type: "image/svg+xml" }), `${filename}.svg`);
    return "created";
  }
  const png = await exportToBlob({ ...state, mimeType: "image/png" });
  if (!png) throw new Error("PNG export failed.");
  if (format === "png") {
    downloadBlob(png, `${filename}.png`);
    return "created";
  }
  const { PDFDocument } = await import("pdf-lib");
  const pdf = await PDFDocument.create();
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
  return "created";
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
