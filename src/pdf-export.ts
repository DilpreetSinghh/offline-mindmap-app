import { exportToCanvas, exportToSvg } from "@excalidraw/excalidraw";
import type { AppState, BinaryFiles, ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import type { NonDeletedExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import {
  boundedPdfDimensions,
  pdfCanvasPageDimensions,
  pdfExportAppState,
  pdfVectorPrecision,
  planPdfRaster,
} from "./pdf-export-policy.mjs";

export type PdfLayout = "a4-fit" | "canvas" | "a4-tiles";
export type PdfQuality = "standard" | "high" | "maximum";
export type PdfOptions = {
  layout: PdfLayout;
  quality: PdfQuality;
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

type SceneCanvas = {
  canvas: HTMLCanvasElement;
  sourceWidth: number;
  sourceHeight: number;
};

async function sceneCanvas(api: ExcalidrawImperativeAPI, options: PdfOptions): Promise<SceneCanvas> {
  const appState: Partial<AppState> = pdfExportAppState(api.getAppState(), options.background, options.dark);
  let sourceWidth = 0;
  let sourceHeight = 0;
  const canvas = await exportToCanvas({
    elements: exportElements(api, options.selectionOnly),
    appState,
    files: api.getFiles() as BinaryFiles,
    exportPadding: 0,
    getDimensions: (width: number, height: number) => {
      sourceWidth = width;
      sourceHeight = height;
      return planPdfRaster(width, height, options.quality);
    },
  });
  return { canvas, sourceWidth, sourceHeight };
}

type SceneSvg = {
  svg: SVGSVGElement;
  sourceWidth: number;
  sourceHeight: number;
};

async function sceneSvg(api: ExcalidrawImperativeAPI, options: PdfOptions): Promise<SceneSvg> {
  const svg = await exportToSvg({
    elements: exportElements(api, options.selectionOnly),
    appState: pdfExportAppState(api.getAppState(), options.background, options.dark),
    files: api.getFiles() as BinaryFiles,
    exportPadding: 0,
    skipInliningFonts: true,
  });
  const viewBox = svg.viewBox.baseVal;
  if (!viewBox.width || !viewBox.height) throw new Error("There is nothing to export.");
  return { svg, sourceWidth: viewBox.width, sourceHeight: viewBox.height };
}

async function canvasPng(canvas: HTMLCanvasElement): Promise<ArrayBuffer> {
  const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((value) => value ? resolve(value) : reject(new Error("Unable to render PDF image.")), "image/png"));
  return blob.arrayBuffer();
}

function safeName(name: string): string {
  return name.trim().replace(/[^a-z0-9._-]+/gi, "-") || "offline-whiteboard";
}

export async function createPdf(api: ExcalidrawImperativeAPI, options: PdfOptions): Promise<Uint8Array> {
  if (options.layout === "canvas" || options.layout === "a4-fit") {
    const { svg, sourceWidth, sourceHeight } = await sceneSvg(api, options);
    const [{ jsPDF }] = await Promise.all([import("jspdf"), import("svg2pdf.js")]);
    let pageWidth: number;
    let pageHeight: number;
    let x = 0;
    let y = 0;
    let width: number;
    let height: number;
    if (options.layout === "canvas") {
      ({ width: pageWidth, height: pageHeight } = pdfCanvasPageDimensions(sourceWidth, sourceHeight, PX_TO_PT));
      width = pageWidth;
      height = pageHeight;
    } else {
      const landscape = sourceWidth > sourceHeight;
      [pageWidth, pageHeight] = landscape ? [A4_PORTRAIT[1], A4_PORTRAIT[0]] : A4_PORTRAIT;
      const margin = 10 * MM_TO_PT;
      const scale = Math.min((pageWidth - margin * 2) / sourceWidth, (pageHeight - margin * 2) / sourceHeight);
      width = sourceWidth * scale;
      height = sourceHeight * scale;
      x = (pageWidth - width) / 2;
      y = (pageHeight - height) / 2;
    }
    const pdf = new jsPDF({
      orientation: pageWidth > pageHeight ? "landscape" : "portrait",
      unit: "pt",
      format: [pageWidth, pageHeight],
      compress: options.quality !== "maximum",
      precision: pdfVectorPrecision(options.quality),
      putOnlyUsedFonts: true,
    });
    await pdf.svg(svg, { x, y, width, height });
    return new Uint8Array(pdf.output("arraybuffer"));
  }

  const { canvas, sourceWidth, sourceHeight } = await sceneCanvas(api, options);
  if (!canvas.width || !canvas.height) throw new Error("There is nothing to export.");
  const { PDFDocument } = await import("pdf-lib");
  const pdf = await PDFDocument.create();
  {
    const logical = boundedPdfDimensions(sourceWidth, sourceHeight);
    const plan = planA4Tiles(logical.width, logical.height);
    const strideX = plan.tileWidthPx - plan.overlapPx;
    const strideY = plan.tileHeightPx - plan.overlapPx;
    const rasterScaleX = canvas.width / logical.width;
    const rasterScaleY = canvas.height / logical.height;
    for (let row = 0; row < plan.rows; row += 1) {
      for (let column = 0; column < plan.columns; column += 1) {
        const logicalX = Math.round(column * strideX);
        const logicalY = Math.round(row * strideY);
        const logicalWidth = Math.min(Math.ceil(plan.tileWidthPx), logical.width - logicalX);
        const logicalHeight = Math.min(Math.ceil(plan.tileHeightPx), logical.height - logicalY);
        const sourceX = Math.round(logicalX * rasterScaleX);
        const sourceY = Math.round(logicalY * rasterScaleY);
        const tileWidth = Math.min(Math.ceil(logicalWidth * rasterScaleX), canvas.width - sourceX);
        const tileHeight = Math.min(Math.ceil(logicalHeight * rasterScaleY), canvas.height - sourceY);
        const tile = document.createElement("canvas");
        tile.width = tileWidth;
        tile.height = tileHeight;
        tile.getContext("2d")?.drawImage(canvas, sourceX, sourceY, tileWidth, tileHeight, 0, 0, tileWidth, tileHeight);
        const image = await pdf.embedPng(await canvasPng(tile));
        const width = logicalWidth * PX_TO_PT;
        const height = logicalHeight * PX_TO_PT;
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
