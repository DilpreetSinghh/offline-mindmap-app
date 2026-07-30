import test from "node:test";
import assert from "node:assert/strict";
import {
  DARK_EXPORT_BACKGROUND,
  MAX_PDF_PAGE_POINTS,
  PDF_QUALITY_PRESETS,
  boundedPdfDimensions,
  pdfCanvasPageDimensions,
  pdfExportAppState,
  pdfVectorPrecision,
  planPdfRaster,
} from "../src/pdf-export-policy.mjs";

test("offers progressively sharper raster plans for a very large export", () => {
  const standard = planPdfRaster(120_000, 60_000, "standard");
  const high = planPdfRaster(120_000, 60_000, "high");
  const maximum = planPdfRaster(120_000, 60_000, "maximum");

  assert.deepEqual(standard, { width: 4096, height: 2048, scale: 4096 / 120_000 });
  assert.ok(high.width > standard.width);
  assert.ok(maximum.width > high.width);
  assert.ok(high.width * high.height <= PDF_QUALITY_PRESETS.high.maxPixels);
  assert.ok(maximum.width * maximum.height <= PDF_QUALITY_PRESETS.maximum.maxPixels);
  assert.ok(Math.abs(high.width / high.height - 2) < 0.001);
  assert.ok(Math.abs(maximum.width / maximum.height - 2) < 0.001);
});

test("increases ordinary-scene resolution at high and maximum quality", () => {
  assert.deepEqual(planPdfRaster(1920, 1080, "standard"), { width: 1920, height: 1080, scale: 1 });
  assert.deepEqual(planPdfRaster(1920, 1080, "high"), { width: 3840, height: 2160, scale: 2 });
  assert.deepEqual(planPdfRaster(1920, 1080, "maximum"), { width: 5760, height: 3240, scale: 3 });
});

test("increases vector precision at each quality level", () => {
  assert.equal(pdfVectorPrecision("standard"), 4);
  assert.equal(pdfVectorPrecision("high"), 8);
  assert.equal(pdfVectorPrecision("maximum"), 12);
  assert.throws(() => pdfVectorPrecision("unknown"), /Unsupported PDF quality/);
});

test("keeps canvas page geometry independent from raster quality and within PDF limits", () => {
  const page = pdfCanvasPageDimensions(120_000, 60_000);
  assert.equal(Math.max(page.width, page.height), MAX_PDF_PAGE_POINTS);
  assert.equal(page.width / page.height, 2);
});

test("keeps tiled layout geometry at a stable compatibility size", () => {
  assert.deepEqual(boundedPdfDimensions(120_000, 60_000), { width: 4096, height: 2048, scale: 4096 / 120_000 });
});

test("constructs the exact Excalidraw dark-background export state", () => {
  const current = { viewBackgroundColor: "#f8f6f1", theme: "light", exportScale: 1 };
  assert.deepEqual(pdfExportAppState(current, true, true), {
    ...current,
    exportBackground: true,
    exportWithDarkMode: true,
    viewBackgroundColor: DARK_EXPORT_BACKGROUND,
  });
  assert.deepEqual(pdfExportAppState(current, false, true), {
    ...current,
    exportBackground: false,
    exportWithDarkMode: true,
    viewBackgroundColor: current.viewBackgroundColor,
  });
});

test("rejects invalid quality and raster dimensions", () => {
  assert.throws(() => planPdfRaster(100, 100, "unknown"), /Unsupported PDF quality/);
  assert.throws(() => planPdfRaster(0, 100, "high"), /positive finite/);
  assert.throws(() => boundedPdfDimensions(Number.POSITIVE_INFINITY, 100), /positive finite/);
});
