import type { AppState, BinaryFiles } from "@excalidraw/excalidraw/types";
import type { OrderedExcalidrawElement } from "@excalidraw/excalidraw/element/types";

export const DOCUMENT_FORMAT = "offline-mindmap-document";
export const DOCUMENT_SCHEMA_VERSION = 3;

export type MindmapNodeData = {
  nodeId: string;
  parentNodeId: string | null;
  siblingOrder: number;
  collapsed: boolean;
  notes?: string;
  url?: string;
  internalTargetNodeId?: string;
};

export type MindmapConnectionData = {
  role: "hierarchy" | "relationship";
  fromNodeId: string;
  toNodeId: string;
};

export type DocumentV3 = {
  format: typeof DOCUMENT_FORMAT;
  schemaVersion: typeof DOCUMENT_SCHEMA_VERSION;
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  rootNodeId: string;
  scene: {
    elements: readonly OrderedExcalidrawElement[];
    appState: Partial<AppState>;
    files: BinaryFiles;
  };
};

export type LegacyNode = {
  id: string;
  text?: string;
  x: number;
  y: number;
  parentId?: string | null;
  order?: number;
  fillColor?: string;
  borderColor?: string;
  textColor?: string;
  fontSize?: number;
};

export type LegacyState = {
  nodes: LegacyNode[];
  connections: Array<{ from: string; to: string; kind?: string }>;
  panX?: number;
  panY?: number;
  scale?: number;
  selectedNodeId?: string | null;
  connectionColor?: string;
  connectorStyle?: "solid" | "dashed";
};

export type LegacyMap = { id: string; name: string; data: LegacyState };

export type DocumentValidation = { valid: boolean; errors: string[] };

export type EditorTab = {
  key: string;
  document: DocumentV3;
  persisted: boolean;
};
