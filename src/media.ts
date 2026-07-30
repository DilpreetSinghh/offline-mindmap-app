import { convertToExcalidrawElements, getDataURL } from "@excalidraw/excalidraw";
import type { BinaryFileData } from "@excalidraw/excalidraw/types";
import type { FileId, OrderedExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import { validateAttachmentFile, validateImageFile } from "./attachments.mjs";
import type { NodeAttachmentMetadata, OfflineAttachmentData } from "./types";

function mediaId(prefix: string): string {
  return `${prefix}-${crypto.randomUUID()}`;
}

async function fileId(file: File): Promise<FileId> {
  const digest = await crypto.subtle.digest("SHA-1", await file.arrayBuffer());
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("") as FileId;
}

function imageDimensions(file: File): Promise<{ width: number; height: number }> {
  const url = URL.createObjectURL(file);
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => {
      const naturalWidth = Math.max(1, image.naturalWidth);
      const naturalHeight = Math.max(1, image.naturalHeight);
      const scale = Math.min(1, 180 / naturalWidth, 130 / naturalHeight);
      URL.revokeObjectURL(url);
      resolve({ width: Math.round(naturalWidth * scale), height: Math.round(naturalHeight * scale) });
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("The image could not be decoded safely."));
    };
    image.src = url;
  });
}

function readDataURL(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => typeof reader.result === "string" ? resolve(reader.result) : reject(new Error("The local file could not be read."));
    reader.onerror = () => reject(reader.error ?? new Error("The local file could not be read."));
    reader.readAsDataURL(file);
  });
}

export async function createNodeImage(
  file: File,
  nodeShape: OrderedExcalidrawElement,
  nodeId: string,
  limitMb: number,
): Promise<{ element: OrderedExcalidrawElement; file: BinaryFileData; metadata: NodeAttachmentMetadata }> {
  const validation = validateImageFile(file, limitMb);
  if (!validation.valid) throw new Error(validation.error);
  const [id, dataURL, dimensions] = await Promise.all([fileId(file), getDataURL(file), imageDimensions(file)]);
  const attachmentId = mediaId("attachment");
  const elementId = mediaId("node-image");
  const [element] = convertToExcalidrawElements([{
    type: "image",
    id: elementId,
    fileId: id,
    x: nodeShape.x + nodeShape.width + 24,
    y: nodeShape.y + Math.max(0, (nodeShape.height - dimensions.height) / 2),
    width: dimensions.width,
    height: dimensions.height,
    status: "saved",
    scale: [1, 1],
    strokeColor: "transparent",
    backgroundColor: "transparent",
    customData: { nodeAttachment: { attachmentId, ownerNodeId: nodeId, name: file.name, size: file.size, mimeType: file.type } },
  }], { regenerateIds: false });
  const createdAt = new Date().toISOString();
  return {
    element,
    file: { id, dataURL, mimeType: file.type as BinaryFileData["mimeType"], created: Date.now() },
    metadata: { id: attachmentId, kind: "image", name: file.name, mimeType: file.type, size: file.size, createdAt, elementId, fileId: id },
  };
}

export async function createOfflineAttachment(file: File, limitMb: number): Promise<{ data: OfflineAttachmentData; metadata: NodeAttachmentMetadata }> {
  const validation = validateAttachmentFile(file, limitMb);
  if (!validation.valid) throw new Error(validation.error);
  const id = mediaId("attachment");
  const createdAt = new Date().toISOString();
  const data: OfflineAttachmentData = {
    id,
    name: file.name,
    mimeType: file.type || "application/octet-stream",
    size: file.size,
    createdAt,
    dataURL: await readDataURL(file),
  };
  return { data, metadata: { id, kind: "file", name: data.name, mimeType: data.mimeType, size: data.size, createdAt } };
}

export function dataURLToBlob(dataURL: string): Blob {
  const match = dataURL.match(/^data:([^;,]*)(;base64)?,(.*)$/s);
  if (!match) throw new Error("Attachment data is invalid.");
  const mimeType = match[1] || "application/octet-stream";
  if (!match[2]) return new Blob([decodeURIComponent(match[3])], { type: mimeType });
  const binary = atob(match[3]);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return new Blob([bytes], { type: mimeType });
}
