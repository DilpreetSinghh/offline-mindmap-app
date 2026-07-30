import test from "node:test";
import assert from "node:assert/strict";
import {
  DARK_EXPORT_BACKGROUND,
  MAX_PDF_RASTER_DIMENSION,
  boundedPdfDimensions,
  pdfBackgroundColour,
  pdfRasterLimit,
} from "../src/pdf-export-policy.mjs";

test("bounds a very large landscape export without changing its aspect ratio", () => {
  const result = boundedPdfDimensions(120_000, 60_000);
  assert.deepEqual(result, { width: 4096, height: 2048, scale: 4096 / 120_000 });
  assert.ok(result.width * result.height <= MAX_PDF_RASTER_DIMENSION ** 2);
});

test("bounds a very large portrait export without changing its aspect ratio", () => {
  const result = boundedPdfDimensions(40_000, 160_000);
  assert.deepEqual(result, { width: 1024, height: 4096, scale: 4096 / 160_000 });
});

test("keeps ordinary export dimensions at their original size", () => {
  assert.deepEqual(boundedPdfDimensions(1920, 1080), { width: 1920, height: 1080, scale: 1 });
});

test("applies the safe raster limit to every PDF layout", () => {
  for (const layout of ["a4-fit", "canvas", "a4-tiles"]) {
    assert.equal(pdfRasterLimit(layout), MAX_PDF_RASTER_DIMENSION);
  }
  assert.throws(() => pdfRasterLimit("unknown"), /Unsupported PDF layout/);
});

test("uses an explicit dark page only when background and dark rendering are enabled", () => {
  assert.equal(pdfBackgroundColour("#f8f6f1", true, true), DARK_EXPORT_BACKGROUND);
  assert.equal(pdfBackgroundColour("#f8f6f1", true, false), "#f8f6f1");
  assert.equal(pdfBackgroundColour("#f8f6f1", false, true), "#f8f6f1");
});

test("rejects invalid raster dimensions", () => {
  assert.throws(() => boundedPdfDimensions(0, 100), /positive finite/);
  assert.throws(() => boundedPdfDimensions(Number.POSITIVE_INFINITY, 100), /positive finite/);
});
