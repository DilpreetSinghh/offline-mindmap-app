/// <reference types="vite/client" />

declare const __SOURCE_SHA__: string;

interface Window {
  EXCALIDRAW_ASSET_PATH?: string;
  PDFLib?: {
    PDFDocument: {
      create(): Promise<{
        embedPng(data: ArrayBuffer): Promise<{ width: number; height: number }>;
        addPage(size: [number, number]): {
          drawImage(image: unknown, options: { x: number; y: number; width: number; height: number }): void;
        };
        save(): Promise<Uint8Array>;
      }>;
    };
  };
}
