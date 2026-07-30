export const DEFAULT_ATTACHMENT_LIMIT_MB = 8;
export const ATTACHMENT_LIMIT_OPTIONS = [2, 5, 8, 15, 25];

const IMAGE_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
  "image/svg+xml",
  "image/avif",
]);

const FILE_TYPES = new Set([
  "application/pdf",
  "application/json",
  "application/zip",
  "application/epub+zip",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
]);

const FILE_EXTENSIONS = new Set([
  "pdf", "txt", "md", "csv", "json", "zip", "epub", "doc", "docx", "xls", "xlsx", "ppt", "pptx",
]);

export function normaliseAttachmentLimit(value) {
  const limit = Number(value);
  return ATTACHMENT_LIMIT_OPTIONS.includes(limit) ? limit : DEFAULT_ATTACHMENT_LIMIT_MB;
}

export function formatBytes(value) {
  const bytes = Math.max(0, Number(value) || 0);
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) {
    const kilobytes = bytes / 1024;
    return `${Number.isInteger(kilobytes) ? kilobytes : kilobytes.toFixed(kilobytes < 10 ? 1 : 0)} KB`;
  }
  const megabytes = bytes / 1024 ** 2;
  return `${Number.isInteger(megabytes) ? megabytes : megabytes.toFixed(megabytes < 10 ? 1 : 0)} MB`;
}

export function estimateDataUrlBytes(value) {
  const dataURL = String(value ?? "");
  const comma = dataURL.indexOf(",");
  if (comma < 0) return 0;
  const body = dataURL.slice(comma + 1);
  if (/;base64,/i.test(dataURL.slice(0, comma + 1))) {
    const padding = body.endsWith("==") ? 2 : body.endsWith("=") ? 1 : 0;
    return Math.max(0, Math.floor(body.length * 3 / 4) - padding);
  }
  try { return new TextEncoder().encode(decodeURIComponent(body)).byteLength; } catch { return body.length; }
}

function fileExtension(name) {
  const match = String(name ?? "").toLowerCase().match(/\.([a-z0-9]+)$/);
  return match?.[1] ?? "";
}

function sizeError(size, limitMb) {
  const maxBytes = normaliseAttachmentLimit(limitMb) * 1024 ** 2;
  return Number(size) > maxBytes ? `File exceeds the ${formatBytes(maxBytes)} local attachment limit.` : "";
}

export function validateImageFile(file, limitMb = DEFAULT_ATTACHMENT_LIMIT_MB) {
  const type = String(file?.type ?? "").toLowerCase();
  if (!IMAGE_TYPES.has(type)) return { valid: false, error: "Unsupported image. Use PNG, JPEG, GIF, WebP, AVIF, or SVG." };
  const error = sizeError(file?.size, limitMb);
  return error ? { valid: false, error } : { valid: true, error: "" };
}

export function validateAttachmentFile(file, limitMb = DEFAULT_ATTACHMENT_LIMIT_MB) {
  const type = String(file?.type ?? "").toLowerCase();
  const extension = fileExtension(file?.name);
  if (!(type.startsWith("text/") || IMAGE_TYPES.has(type) || FILE_TYPES.has(type) || FILE_EXTENSIONS.has(extension))) {
    return { valid: false, error: "Unsupported attachment. Use a document, text, spreadsheet, presentation, PDF, EPUB, image, or ZIP file." };
  }
  const error = sizeError(file?.size, limitMb);
  return error ? { valid: false, error } : { valid: true, error: "" };
}

/** @param {readonly any[]} elements @param {Record<string, any>} files */
export function referencedBinaryFiles(elements, files) {
  const wanted = new Set(elements.flatMap((element) => element.type === "image" && element.fileId && !element.isDeleted ? [element.fileId] : []));
  return Object.fromEntries(Object.entries(files ?? {}).filter(([id]) => wanted.has(id)));
}

/** @param {readonly any[]} elements @param {Record<string, any>} attachments */
export function referencedOfflineAttachments(elements, attachments) {
  const wanted = new Set(elements.flatMap((element) => {
    const node = element.customData?.mindmapNode;
    return Array.isArray(node?.attachments) ? node.attachments.filter((item) => item?.kind === "file").map((item) => item.id) : [];
  }));
  return Object.fromEntries(Object.entries(attachments ?? {}).filter(([id]) => wanted.has(id)));
}

/** @param {readonly any[]} elements @param {Record<string, any>} files */
export function sanitiseSceneMedia(elements, files, limitMb = DEFAULT_ATTACHMENT_LIMIT_MB) {
  const errors = [];
  const rejected = new Set();
  let pending = false;
  const maxBytes = normaliseAttachmentLimit(limitMb) * 1024 ** 2;
  for (const element of elements) {
    if (element.type !== "image" || !element.fileId || element.isDeleted) continue;
    const file = files?.[element.fileId];
    if (!file) {
      if (element.status === "pending") {
        pending = true;
        continue;
      }
      rejected.add(element.fileId);
      errors.push("An image reference was missing its local data and was removed safely.");
      continue;
    }
    if (!IMAGE_TYPES.has(String(file.mimeType).toLowerCase())) {
      rejected.add(element.fileId);
      errors.push("An unsupported image was removed. Use PNG, JPEG, GIF, WebP, AVIF, or SVG.");
      continue;
    }
    if (estimateDataUrlBytes(file.dataURL) > maxBytes) {
      rejected.add(element.fileId);
      errors.push(`An image exceeded the ${formatBytes(maxBytes)} local attachment limit and was removed.`);
    }
  }
  const safeElements = elements.filter((element) => element.type !== "image" || !element.fileId || !rejected.has(element.fileId));
  return { elements: safeElements, files: referencedBinaryFiles(safeElements, files), errors: [...new Set(errors)], pending };
}
