import { exportToCanvas } from "@excalidraw/excalidraw";
import type { AppState, BinaryFiles, ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import type { NonDeletedExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import { pdfBackgroundColour, pdfRasterLimit } from "./pdf-export-policy.mjs";

export type PdfLayout = "a4-fit" | "canvas" | "a4-tiles";
export type PdfOptions = {
  layout: PdfLayout;
  selectionOnly: boolean;
  background: boolean;
  dark: boolean;
};

const MM_TO_PT = 72 / 25.4;
const PX_TO_PT = 72 / 96;
const A4_PORTRAIT: [number, number] = [210 * MM_TO_PT, 297 * MM_TO_PT];

export type TilePlan = {
  pageWidth: number;
  pageHeight: number;
  margin: number;
  overlapPx: number;
  tileWidthPx: number;
  tileHeightPx: number;
  columns: number;
  rows: number;
};

export function planA4Tiles(widthPx: number, heightPx: number): TilePlan {
  const margin = 10 * MM_TO_PT;
  const printableWidthPt = A4_PORTRAIT[0] - margin * 2;
  const printableHeightPt = A4_PORTRAIT[1] - margin * 2;
  const tileWidthPx = printableWidthPt / PX_TO_PT;
  const tileHeightPx = printableHeightPt / PX_TO_PT;
  const overlapPx = 5 * 96 / 25.4;
  return {
    pageWidth: A4_PORTRAIT[0], pageHeight: A4_PORTRAIT[1], margin, overlapPx,
    tileWidthPx, tileHeightPx,
    columns: Math.max(1, Math.ceil(Math.max(0, widthPx - overlapPx) / (tileWidthPx - overlapPx))),
    rows: Math.max(1, Math.ceil(Math.max(0, heightPx - overlapPx) / (tileHeightPx - overlapPx))),
  };
}

function exportElements(api: ExcalidrawImperativeAPI, selectionOnly: boolean): readonly NonDeletedExcalidrawElement[] {
  const selected = api.getAppState().selectedElementIds;
  return api.getSceneElements().filter((element) => !element.isDeleted && (!selectionOnly || selected[element.id])) as readonly NonDeletedExcalidrawElement[];
}

async function sceneCanvas(api: ExcalidrawImperativeAPI, options: PdfOptions): Promise<HTMLCanvasElement> {
  const appState: Partial<AppState> = {
    ...api.getAppState(),
    exportBackground: options.background,
    exportWithDarkMode: options.dark,
    viewBackgroundColor: pdfBackgroundColour(api.getAppState().viewBackgroundColor, options.background, options.dark),
  };
  return exportToCanvas({
    elements: exportElements(api, options.selectionOnly),
    appState,
    files: api.getFiles() as BinaryFiles,
    exportPadding: 0,
    // Browsers refuse to serialise very large canvases. Bound the raster before
    // converting it to PNG so every PDF layout remains usable on large scenes.
    maxWidthOrHeight: pdfRasterLimit(options.layout),
  });
}

async function canvasPng(canvas: HTMLCanvasElement): Promise<ArrayBuffer> {
  const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((value) => value ? resolve(value) : reject(new Error("Unable to render PDF image.")), "image/png"));
  return blob.arrayBuffer();
}

function safeName(name: string): string {
  return name.trim().replace(/[^a-z0-9._-]+/gi, "-") || "offline-whiteboard";
}

export async function createPdf(api: ExcalidrawImperativeAPI, options: PdfOptions): Promise<Uint8Array> {
  const canvas = await sceneCanvas(api, options);
  if (!canvas.width || !canvas.height) throw new Error("There is nothing to export.");
  const { PDFDocument } = await import("pdf-lib");
  const pdf = await PDFDocument.create();

  if (options.layout === "canvas") {
    const width = canvas.width * PX_TO_PT;
    const height = canvas.height * PX_TO_PT;
    const image = await pdf.embedPng(await canvasPng(canvas));
    pdf.addPage([width, height]).drawImage(image, { x: 0, y: 0, width, height });
  } else if (options.layout === "a4-fit") {
    const landscape = canvas.width > canvas.height;
    const [pageWidth, pageHeight] = landscape ? [A4_PORTRAIT[1], A4_PORTRAIT[0]] : A4_PORTRAIT;
    const margin = 10 * MM_TO_PT;
    const scale = Math.min((pageWidth - margin * 2) / canvas.width, (pageHeight - margin * 2) / canvas.height);
    const width = canvas.width * scale;
    const height = canvas.height * scale;
    const image = await pdf.embedPng(await canvasPng(canvas));
    pdf.addPage([pageWidth, pageHeight]).drawImage(image, { x: (pageWidth - width) / 2, y: (pageHeight - height) / 2, width, height });
  } else {
    const plan = planA4Tiles(canvas.width, canvas.height);
    const strideX = plan.tileWidthPx - plan.overlapPx;
    const strideY = plan.tileHeightPx - plan.overlapPx;
    for (let row = 0; row < plan.rows; row += 1) {
      for (let column = 0; column < plan.columns; column += 1) {
        const sourceX = Math.round(column * strideX);
        const sourceY = Math.round(row * strideY);
        const sourceWidth = Math.min(Math.ceil(plan.tileWidthPx), canvas.width - sourceX);
        const sourceHeight = Math.min(Math.ceil(plan.tileHeightPx), canvas.height - sourceY);
        const tile = document.createElement("canvas");
        tile.width = sourceWidth;
        tile.height = sourceHeight;
        tile.getContext("2d")?.drawImage(canvas, sourceX, sourceY, sourceWidth, sourceHeight, 0, 0, sourceWidth, sourceHeight);
        const image = await pdf.embedPng(await canvasPng(tile));
        const width = sourceWidth * PX_TO_PT;
        const height = sourceHeight * PX_TO_PT;
        pdf.addPage([plan.pageWidth, plan.pageHeight]).drawImage(image, {
          x: plan.margin, y: plan.pageHeight - plan.margin - height, width, height,
        });
      }
    }
  }
  return pdf.save();
}

export async function downloadPdf(api: ExcalidrawImperativeAPI, name: string, options: PdfOptions): Promise<void> {
  const bytes = await createPdf(api, options);
  const buffer = new Uint8Array(bytes).buffer;
  const url = URL.createObjectURL(new Blob([buffer], { type: "application/pdf" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${safeName(name)}.pdf`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  // Safari may not begin consuming the Blob URL until after the click task.
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
