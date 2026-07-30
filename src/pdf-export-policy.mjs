export const MAX_PDF_RASTER_DIMENSION = 4096;
export const DARK_EXPORT_BACKGROUND = "#121212";

export function pdfRasterLimit(layout) {
  if (!new Set(["a4-fit", "canvas", "a4-tiles"]).has(layout)) {
    throw new Error(`Unsupported PDF layout: ${layout}`);
  }
  return MAX_PDF_RASTER_DIMENSION;
}

export function boundedPdfDimensions(width, height, limit = MAX_PDF_RASTER_DIMENSION) {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0 || limit <= 0) {
    throw new Error("PDF dimensions must be positive finite numbers.");
  }
  const scale = Math.min(1, limit / Math.max(width, height));
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
    scale,
  };
}

export function pdfBackgroundColour(currentBackground, background, dark) {
  return background && dark ? DARK_EXPORT_BACKGROUND : currentBackground;
}
