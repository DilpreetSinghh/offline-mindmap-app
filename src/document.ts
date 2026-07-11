import { convertToExcalidrawElements } from "@excalidraw/excalidraw";
import type { ExcalidrawElementSkeleton } from "@excalidraw/excalidraw/data/transform";
import type {
  ExcalidrawElement,
  OrderedExcalidrawElement,
} from "@excalidraw/excalidraw/element/types";
import {
  DOCUMENT_FORMAT,
  DOCUMENT_SCHEMA_VERSION,
  type DocumentV3,
  type DocumentValidation,
  type LegacyState,
  type MindmapConnectionData,
  type MindmapNodeData,
} from "./types";
import { validateHierarchyIndex } from "./hierarchy-index.mjs";

export function createId(prefix: string): string {
  const random = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `${prefix}-${random}`;
}

export function getMindmapNode(element: ExcalidrawElement): MindmapNodeData | null {
  const value = element.customData?.mindmapNode;
  if (!value || typeof value !== "object") return null;
  return value as MindmapNodeData;
}

export function getMindmapConnection(element: ExcalidrawElement): MindmapConnectionData | null {
  const value = element.customData?.mindmapConnection;
  if (!value || typeof value !== "object") return null;
  return value as MindmapConnectionData;
}

export function createMindmapElements(
  nodeId = "root",
  text = "Central idea",
  x = 280,
  y = 220,
  parentNodeId: string | null = null,
  siblingOrder = 0,
): OrderedExcalidrawElement[] {
  return convertToExcalidrawElements(
    [
      {
        type: "rectangle",
        id: nodeId,
        x,
        y,
        width: 190,
        height: 84,
        backgroundColor: parentNodeId === null ? "#f6c453" : "#fff2c2",
        strokeColor: parentNodeId === null ? "#8f5f00" : "#a46f16",
        fillStyle: "solid",
        strokeWidth: 2,
        roundness: { type: 3 },
        label: {
          text,
          fontSize: 20,
          textAlign: "center",
          verticalAlign: "middle",
          strokeColor: "#2c2417",
        },
        customData: {
          mindmapNode: { nodeId, parentNodeId, siblingOrder, collapsed: false },
        },
      },
    ],
    { regenerateIds: false },
  );
}

export function appendBoundConnection(
  elements: readonly OrderedExcalidrawElement[],
  fromElementId: string,
  toElementId: string,
  fromNodeId: string,
  toNodeId: string,
  role: MindmapConnectionData["role"],
): OrderedExcalidrawElement[] {
  const from = elements.find((element) => element.id === fromElementId);
  const to = elements.find((element) => element.id === toElementId);
  if (!from || !to) throw new Error("Cannot bind a connection to missing elements.");
  const fromCenter = { x: from.x + from.width / 2, y: from.y + from.height / 2 };
  const toCenter = { x: to.x + to.width / 2, y: to.y + to.height / 2 };
  const boundaryPoint = (element: ExcalidrawElement, towards: { x: number; y: number }) => {
    const center = { x: element.x + element.width / 2, y: element.y + element.height / 2 };
    const dx = towards.x - center.x;
    const dy = towards.y - center.y;
    const factor = 1 / Math.max(Math.abs(dx) / Math.max(element.width / 2, 1), Math.abs(dy) / Math.max(element.height / 2, 1), 1);
    return { x: center.x + dx * factor, y: center.y + dy * factor };
  };
  const startPoint = boundaryPoint(from, toCenter);
  const endPoint = boundaryPoint(to, fromCenter);
  const arrow: ExcalidrawElementSkeleton = {
    type: "arrow",
    id: createId(role === "hierarchy" ? "hierarchy" : "relationship"),
    x: startPoint.x,
    y: startPoint.y,
    points: [
      [0, 0],
      [endPoint.x - startPoint.x, endPoint.y - startPoint.y],
    ],
    start: { id: fromElementId },
    end: { id: toElementId },
    strokeColor: role === "hierarchy" ? "#8a6b37" : "#2563eb",
    strokeWidth: 2,
    strokeStyle: role === "hierarchy" ? "solid" : "dashed",
    startArrowhead: null,
    endArrowhead: "arrow",
    customData: { mindmapConnection: { role, fromNodeId, toNodeId } },
  };
  const bindingShape = (element: ExcalidrawElement): ExcalidrawElementSkeleton => ({
    type: element.type === "ellipse" || element.type === "diamond" ? element.type : "rectangle",
    id: element.id,
    x: element.x,
    y: element.y,
    width: element.width,
    height: element.height,
    angle: element.angle,
    strokeColor: element.strokeColor,
    backgroundColor: element.backgroundColor,
  });
  const converted = convertToExcalidrawElements(
    [bindingShape(from), bindingShape(to), arrow],
    { regenerateIds: false },
  );
  const boundArrow = converted.find((element) => element.id === arrow.id);
  if (!boundArrow || boundArrow.type !== "arrow" || !boundArrow.startBinding || !boundArrow.endBinding) {
    throw new Error("Excalidraw did not create a normalized bound arrow.");
  }
  return [
    ...elements.map((element) => {
      if (element.id !== fromElementId && element.id !== toElementId) return element;
      const existingBindings = element.boundElements?.filter((binding) => binding.id !== boundArrow.id) ?? [];
      return {
        ...element,
        boundElements: [...existingBindings, { id: boundArrow.id, type: "arrow" as const }],
      } as OrderedExcalidrawElement;
    }),
    boundArrow,
  ];
}

export function createBlankDocument(name = "Untitled map"): DocumentV3 {
  const now = new Date().toISOString();
  return {
    format: DOCUMENT_FORMAT,
    schemaVersion: DOCUMENT_SCHEMA_VERSION,
    id: createId("draft"),
    name,
    createdAt: now,
    updatedAt: now,
    rootNodeId: "root",
    scene: {
      elements: createMindmapElements(),
      appState: { viewBackgroundColor: "#f8f6f1", theme: "light", selectedElementIds: { root: true } },
      files: {},
    },
  };
}

export function createTemplateDocument(template: "mindmap" | "brainstorm"): DocumentV3 {
  const document = createBlankDocument(template === "brainstorm" ? "Brainstorm" : "Untitled map");
  if (template === "mindmap") return document;
  const root = document.scene.elements.find((element) => getMindmapNode(element)?.nodeId === "root")!;
  const branches = [
    { text: "Opportunity", x: 570, y: 110 },
    { text: "Evidence", x: 570, y: 240 },
    { text: "Risk", x: 570, y: 370 },
    { text: "Next step", x: 280, y: 390 },
  ];
  let elements = [...document.scene.elements];
  branches.forEach((branch, index) => {
    const nodeId = createId("node");
    const created = createMindmapElements(nodeId, branch.text, branch.x, branch.y, "root", index);
    const shape = created.find((element) => getMindmapNode(element))!;
    elements = appendBoundConnection([...elements, ...created], root.id, shape.id, "root", nodeId, "hierarchy");
  });
  return { ...document, scene: { ...document.scene, elements } };
}

export function migrateLegacyState(id: string, name: string, state: LegacyState): DocumentV3 {
  const nodes = state.nodes ?? [];
  const nodeSkeletons: ExcalidrawElementSkeleton[] = nodes.map((node, index) => ({
    type: "rectangle",
    id: node.id,
    x: node.x - 95,
    y: node.y - 42,
    width: 190,
    height: 84,
    backgroundColor: node.fillColor || "#facc15",
    strokeColor: node.borderColor || "#7c5b00",
    fillStyle: "solid",
    strokeWidth: 2,
    roundness: { type: 3 },
    label: {
      text: node.text || "Untitled node",
      fontSize: node.fontSize || 16,
      textAlign: "center",
      verticalAlign: "middle",
      strokeColor: node.textColor || "#111827",
    },
    customData: {
      mindmapNode: {
        nodeId: node.id,
        parentNodeId: node.parentId ?? null,
        siblingOrder: Number.isFinite(node.order) ? node.order : index,
        collapsed: false,
      },
    },
  }));
  const nodeElements = convertToExcalidrawElements(nodeSkeletons, { regenerateIds: false });
  let convertedElements = [...nodeElements];
  for (const connection of state.connections ?? []) {
    convertedElements = appendBoundConnection(
      convertedElements,
      connection.from,
      connection.to,
      connection.from,
      connection.to,
      connection.kind === "relationship" ? "relationship" : "hierarchy",
    ).map((element) => element.type === "arrow" && getMindmapConnection(element) ? {
      ...element,
      strokeColor: state.connectionColor || element.strokeColor,
      strokeStyle: state.connectorStyle || element.strokeStyle,
    } as OrderedExcalidrawElement : element);
  }
  const rootNodeId = nodes.find((node) => node.parentId == null)?.id ?? nodes[0]?.id ?? "root";
  const now = new Date().toISOString();
  const elements = nodeElements.length ? convertedElements : createMindmapElements();
  return {
    format: DOCUMENT_FORMAT,
    schemaVersion: DOCUMENT_SCHEMA_VERSION,
    id: id || createId("map"),
    name: name || "Migrated map",
    createdAt: now,
    updatedAt: now,
    rootNodeId,
    scene: {
      elements,
      appState: {
        scrollX: Number.isFinite(state.panX) ? state.panX : 0,
        scrollY: Number.isFinite(state.panY) ? state.panY : 0,
        zoom: { value: Math.min(3, Math.max(0.1, state.scale || 1)) as never },
        viewBackgroundColor: "#f8f6f1",
        theme: "light",
        selectedElementIds: state.selectedNodeId ? { [state.selectedNodeId]: true } : {},
      },
      files: {},
    },
  };
}

export function validateDocument(document: DocumentV3): DocumentValidation {
  const errors: string[] = [];
  if (!document || document.format !== DOCUMENT_FORMAT) errors.push("Unsupported document format.");
  if (document?.schemaVersion !== DOCUMENT_SCHEMA_VERSION) errors.push("Unsupported document schema version.");
  if (!document?.id || !document?.name) errors.push("Document ID and name are required.");
  if (!Array.isArray(document?.scene?.elements)) errors.push("Scene elements are required.");

  const nodes = new Map<string, MindmapNodeData>();
  const elementIds = new Set<string>();
  for (const element of document?.scene?.elements ?? []) {
    if (elementIds.has(element.id)) errors.push(`Duplicate element ID: ${element.id}`);
    elementIds.add(element.id);
    const node = getMindmapNode(element);
    if (!node) continue;
    if (!node.nodeId || nodes.has(node.nodeId)) errors.push(`Duplicate or missing node ID: ${node.nodeId}`);
    else nodes.set(node.nodeId, node);
    if (!Number.isFinite(node.siblingOrder)) errors.push(`Invalid sibling order: ${node.nodeId}`);
  }
  errors.push(...validateHierarchyIndex([...nodes.values()], document?.rootNodeId).errors);

  const hierarchyParents = new Map<string, number>();
  for (const element of document?.scene?.elements ?? []) {
    const connection = getMindmapConnection(element);
    if (!connection) continue;
    if (!nodes.has(connection.fromNodeId) || !nodes.has(connection.toNodeId)) {
      errors.push(`Connection ${element.id} refers to a missing mind-map node.`);
    }
    if (connection.role === "hierarchy") {
      hierarchyParents.set(connection.toNodeId, (hierarchyParents.get(connection.toNodeId) ?? 0) + 1);
      const target = nodes.get(connection.toNodeId);
      if (target && target.parentNodeId !== connection.fromNodeId) {
        errors.push(`Hierarchy metadata mismatch for ${connection.toNodeId}.`);
      }
    }
    if (element.type !== "arrow" || !element.startBinding || !element.endBinding) {
      errors.push(`Mind-map connection ${element.id} must remain a bound arrow.`);
    }
  }
  for (const [nodeId, node] of nodes) {
    const incoming = hierarchyParents.get(nodeId) ?? 0;
    if (nodeId === document.rootNodeId && incoming !== 0) errors.push("The root node cannot have an incoming hierarchy arrow.");
    if (nodeId !== document.rootNodeId && incoming !== 1) errors.push(`Node ${nodeId} must have exactly one hierarchy arrow.`);
  }
  return { valid: errors.length === 0, errors };
}

export function normaliseConnectionBindings(
  elements: readonly OrderedExcalidrawElement[],
): { elements: readonly OrderedExcalidrawElement[]; changed: boolean; errors: string[] } {
  const nodeByElementId = new Map<string, MindmapNodeData>();
  for (const element of elements) {
    const node = getMindmapNode(element);
    if (node) nodeByElementId.set(element.id, node);
  }
  let changed = false;
  const errors: string[] = [];
  const next = elements.map((element) => {
    const connection = getMindmapConnection(element);
    if (!connection) return element;
    if (element.type !== "arrow" || !element.startBinding || !element.endBinding) {
      errors.push(`Mind-map connection ${element.id} must remain bound at both ends.`);
      return element;
    }
    const from = nodeByElementId.get(element.startBinding.elementId);
    const to = nodeByElementId.get(element.endBinding.elementId);
    if (!from || !to) {
      errors.push(`Mind-map connection ${element.id} must bind to mind-map nodes.`);
      return element;
    }
    if (from.nodeId === to.nodeId) {
      errors.push("A mind-map connection cannot connect a node to itself.");
      return element;
    }
    if (connection.fromNodeId === from.nodeId && connection.toNodeId === to.nodeId) return element;
    changed = true;
    return {
      ...element,
      customData: {
        ...element.customData,
        mindmapConnection: { ...connection, fromNodeId: from.nodeId, toNodeId: to.nodeId },
      },
    } as OrderedExcalidrawElement;
  });

  const parentByNode = new Map<string, string | null>();
  for (const element of next) {
    const node = getMindmapNode(element);
    if (node) parentByNode.set(node.nodeId, node.parentNodeId);
  }
  for (const element of next) {
    const connection = getMindmapConnection(element);
    if (connection?.role === "hierarchy") parentByNode.set(connection.toNodeId, connection.fromNodeId);
  }
  for (const nodeId of parentByNode.keys()) {
    const visited = new Set<string>();
    let cursor: string | null | undefined = nodeId;
    while (cursor) {
      if (visited.has(cursor)) {
        errors.push(`Hierarchy retargeting would create a cycle at ${cursor}.`);
        break;
      }
      visited.add(cursor);
      cursor = parentByNode.get(cursor);
    }
  }
  if (errors.length) return { elements, changed: false, errors };

  const withParents = next.map((element) => {
    const node = getMindmapNode(element);
    if (!node) return element;
    const parentNodeId = parentByNode.get(node.nodeId) ?? null;
    if (node.parentNodeId === parentNodeId) return element;
    changed = true;
    return {
      ...element,
      customData: { ...element.customData, mindmapNode: { ...node, parentNodeId } },
    } as OrderedExcalidrawElement;
  });
  return { elements: withParents, changed, errors };
}

export function assertValidDocument(document: DocumentV3): void {
  const validation = validateDocument(document);
  if (!validation.valid) throw new Error(validation.errors.join("\n"));
}

export function compareMigration(source: LegacyState, document: DocumentV3): DocumentValidation {
  const errors: string[] = [];
  const migratedNodes = document.scene.elements.map(getMindmapNode).filter(Boolean) as MindmapNodeData[];
  const migratedConnections = document.scene.elements
    .map(getMindmapConnection)
    .filter((value): value is MindmapConnectionData => value?.role === "hierarchy");
  if (migratedNodes.length !== source.nodes.length) errors.push("Migrated node count does not match source.");
  const sourceHierarchy = source.connections.filter((item) => item.kind !== "relationship");
  if (migratedConnections.length !== sourceHierarchy.length) errors.push("Migrated hierarchy count does not match source.");
  for (const node of source.nodes) {
    const migrated = migratedNodes.find((item) => item.nodeId === node.id);
    if (!migrated || migrated.parentNodeId !== (node.parentId ?? null)) {
      errors.push(`Migrated hierarchy differs for ${node.id}.`);
    }
  }
  return { valid: errors.length === 0, errors };
}
