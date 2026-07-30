export const DARK_EXPORT_BACKGROUND = "#121212";
export const MAX_PDF_PAGE_POINTS = 14_400;

export const PDF_QUALITY_PRESETS = Object.freeze({
  standard: Object.freeze({ scale: 1, maxDimension: 4096, maxPixels: 16_000_000, vectorPrecision: 4 }),
  high: Object.freeze({ scale: 2, maxDimension: 8192, maxPixels: 32_000_000, vectorPrecision: 8 }),
  maximum: Object.freeze({ scale: 3, maxDimension: 12_288, maxPixels: 64_000_000, vectorPrecision: 12 }),
});

export function pdfVectorPrecision(quality) {
  const preset = PDF_QUALITY_PRESETS[quality];
  if (!preset) throw new Error(`Unsupported PDF quality: ${quality}`);
  return preset.vectorPrecision;
}

function positiveDimensions(width, height) {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    throw new Error("PDF dimensions must be positive finite numbers.");
  }
}

export function boundedPdfDimensions(width, height, limit = PDF_QUALITY_PRESETS.standard.maxDimension) {
  positiveDimensions(width, height);
  if (!Number.isFinite(limit) || limit <= 0) {
    throw new Error("PDF dimensions must be positive finite numbers.");
  }
  const scale = Math.min(1, limit / Math.max(width, height));
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
    scale,
  };
}

export function planPdfRaster(width, height, quality) {
  positiveDimensions(width, height);
  const preset = PDF_QUALITY_PRESETS[quality];
  if (!preset) throw new Error(`Unsupported PDF quality: ${quality}`);

  const dimensionScale = preset.maxDimension / Math.max(width, height);
  const pixelScale = Math.sqrt(preset.maxPixels / (width * height));
  const scale = Math.min(preset.scale, dimensionScale, pixelScale);
  const roundDimension = scale < preset.scale ? Math.floor : Math.round;
  return {
    width: Math.max(1, roundDimension(width * scale)),
    height: Math.max(1, roundDimension(height * scale)),
    scale,
  };
}

export function pdfCanvasPageDimensions(width, height, pxToPt = 72 / 96) {
  positiveDimensions(width, height);
  const naturalWidth = width * pxToPt;
  const naturalHeight = height * pxToPt;
  const scale = Math.min(1, MAX_PDF_PAGE_POINTS / Math.max(naturalWidth, naturalHeight));
  return { width: naturalWidth * scale, height: naturalHeight * scale };
}

export function pdfExportAppState(currentAppState, background, dark) {
  return {
    ...currentAppState,
    exportBackground: background,
    exportWithDarkMode: dark,
    viewBackgroundColor: background && dark ? DARK_EXPORT_BACKGROUND : currentAppState.viewBackgroundColor,
  };
}
