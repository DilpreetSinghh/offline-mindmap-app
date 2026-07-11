import { newElementWith } from "@excalidraw/excalidraw";
import type { ExcalidrawElement, OrderedExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import {
  appendBoundConnection,
  createId,
  createMindmapElements,
  getMindmapConnection,
  getMindmapNode,
  refreshMindmapConnectionGeometry,
} from "./document";
import { calculateTreeLayout, shouldReflowAfterInsertion } from "./tree-layout.mjs";
import { inferBoundTree } from "./bound-tree.mjs";

export type NodeDirection = "left" | "right" | "up" | "down" | "child" | "sibling";

export type AddNodeResult = {
  elements: OrderedExcalidrawElement[];
  nodeElementId: string;
  nodeId: string;
};

function nextSiblingOrder(elements: readonly ExcalidrawElement[], parentNodeId: string | null): number {
  return elements.reduce((count, element) => {
    const node = getMindmapNode(element);
    return node?.parentNodeId === parentNodeId ? Math.max(count, node.siblingOrder + 1) : count;
  }, 0);
}

export function getMindmapNodeText(
  elements: readonly ExcalidrawElement[],
  nodeId: string,
): string {
  const shape = elements.find((element) => getMindmapNode(element)?.nodeId === nodeId);
  if (!shape) return "Untitled node";
  const text = elements.find((element) => element.type === "text" && element.containerId === shape.id);
  return text?.type === "text" ? text.originalText || text.text : "Untitled node";
}

export function ensureEditableMindmapElements(
  elements: readonly OrderedExcalidrawElement[],
): OrderedExcalidrawElement[] {
  const additions: OrderedExcalidrawElement[] = [];
  const mindmapShapeIds = new Set(elements.filter((element) => getMindmapNode(element)).map((element) => element.id));
  const textByContainer = new Map(
    elements
      .filter((element) => element.type === "text" && element.containerId)
      .map((element) => [element.type === "text" ? element.containerId : null, element]),
  );
  const next = elements.map((element) => {
    const node = getMindmapNode(element);
    if (!node) {
      if (element.type === "text" && element.containerId && mindmapShapeIds.has(element.containerId) && element.locked) {
        return newElementWith(element, { locked: false }) as OrderedExcalidrawElement;
      }
      return element;
    }
    let text = textByContainer.get(element.id);
    if (!text) {
      const template = createMindmapElements(
        element.id,
        node.parentNodeId === null ? "Central idea" : "Untitled node",
        element.x,
        element.y,
        node.parentNodeId,
        node.siblingOrder,
      );
      text = template.find((candidate) => candidate.type === "text");
      if (text) additions.push(text);
    }
    const boundElements = element.boundElements ?? [];
    const hasTextBinding = text && boundElements.some((binding) => binding.id === text.id && binding.type === "text");
    if (!element.locked && (!text || hasTextBinding)) return element;
    return newElementWith(element, {
      locked: false,
      boundElements: text && !hasTextBinding
        ? [...boundElements, { id: text.id, type: "text" as const }]
        : boundElements,
    }) as OrderedExcalidrawElement;
  });
  return additions.length ? [...next, ...additions] : next;
}

export function renameMindmapNode(
  elements: readonly OrderedExcalidrawElement[],
  nodeId: string,
  value: string,
): OrderedExcalidrawElement[] {
  const textValue = value.trim() || "Untitled node";
  const editable = ensureEditableMindmapElements(elements);
  const shape = editable.find((element) => getMindmapNode(element)?.nodeId === nodeId);
  if (!shape) return [...editable];
  return editable.map((element) => {
    if (element.type !== "text" || element.containerId !== shape.id) return element;
    return newElementWith(element, {
      text: textValue,
      originalText: textValue,
      locked: false,
    }) as OrderedExcalidrawElement;
  });
}

export function reflowMindmapElements(
  elements: readonly OrderedExcalidrawElement[],
  requestedRootNodeId?: string,
): OrderedExcalidrawElement[] {
  const shapes = elements.filter((element) => getMindmapNode(element));
  if (shapes.length < 2) return [...elements];
  const rootShape = requestedRootNodeId
    ? shapes.find((element) => getMindmapNode(element)?.nodeId === requestedRootNodeId)
    : shapes.find((element) => getMindmapNode(element)?.parentNodeId === null);
  const rootNode = rootShape && getMindmapNode(rootShape);
  if (!rootShape || !rootNode) return [...elements];

  const records = shapes.map((element) => {
    const node = getMindmapNode(element)!;
    return {
      nodeId: node.nodeId,
      parentNodeId: node.parentNodeId,
      siblingOrder: node.siblingOrder,
      x: element.x,
      y: element.y,
      width: element.width,
      height: element.height,
    };
  });
  const positions = calculateTreeLayout(records, rootNode.nodeId);
  const deltaByElementId = new Map<string, { x: number; y: number }>();
  for (const shape of shapes) {
    const node = getMindmapNode(shape)!;
    const position = positions.get(node.nodeId);
    if (!position) continue;
    deltaByElementId.set(shape.id, { x: position.x - shape.x, y: position.y - shape.y });
  }

  const moved = elements.map((element) => {
    const node = getMindmapNode(element);
    if (node) {
      const delta = deltaByElementId.get(element.id);
      if (!delta || (!delta.x && !delta.y)) return element;
      return newElementWith(element, { x: element.x + delta.x, y: element.y + delta.y }) as OrderedExcalidrawElement;
    }
    if (element.type === "text" && element.containerId) {
      const delta = deltaByElementId.get(element.containerId);
      if (!delta || (!delta.x && !delta.y)) return element;
      return newElementWith(element, { x: element.x + delta.x, y: element.y + delta.y }) as OrderedExcalidrawElement;
    }
    return element;
  });
  return refreshMindmapConnectionGeometry(moved);
}

export function reflowConnectedMindmapTree(
  elements: readonly OrderedExcalidrawElement[],
  requestedRootNodeId?: string,
): { elements: OrderedExcalidrawElement[]; includedWhiteboardNodeCount: number; nodeCount: number; arrangedElementIds: string[] } {
  const inferred = inferBoundTree(elements, requestedRootNodeId);
  if (!inferred || inferred.records.length < 2) {
    return { elements: [...elements], includedWhiteboardNodeCount: 0, nodeCount: inferred?.records.length ?? 0, arrangedElementIds: [] };
  }

  const elementById = new Map(elements.map((element) => [element.id, element]));
  const positions = calculateTreeLayout(inferred.records, inferred.rootNodeId);
  const deltaByElementId = new Map<string, { x: number; y: number }>();
  for (const record of inferred.records) {
    const position = positions.get(record.nodeId);
    if (position) deltaByElementId.set(record.elementId, { x: position.x - record.x, y: position.y - record.y });
  }

  const inferredConnections = new Map<string, { fromElementId: string; toElementId: string }>();
  for (const [targetElementId, arrowId] of inferred.treeArrowIdByTarget) {
    const fromElementId = inferred.parentElementId.get(targetElementId);
    if (fromElementId) inferredConnections.set(arrowId, { fromElementId, toElementId: targetElementId });
  }

  const moved = elements.map((element) => {
    const delta = deltaByElementId.get(element.id)
      ?? (element.type === "text" && element.containerId ? deltaByElementId.get(element.containerId) : undefined);
    if (!delta || (!delta.x && !delta.y)) return element;
    return newElementWith(element, { x: element.x + delta.x, y: element.y + delta.y }) as OrderedExcalidrawElement;
  });
  let includedWhiteboardNodeCount = 0;
  for (const record of inferred.records) {
    const element = elementById.get(record.elementId);
    if (element && !getMindmapNode(element)) includedWhiteboardNodeCount += 1;
  }
  return {
    elements: refreshMindmapConnectionGeometry(moved, inferredConnections),
    includedWhiteboardNodeCount,
    nodeCount: inferred.records.length,
    arrangedElementIds: inferred.records.map((record) => record.elementId),
  };
}

export function addConnectedMindmapNode(
  elements: readonly OrderedExcalidrawElement[],
  selectedElementId: string,
  direction: NodeDirection,
): AddNodeResult | null {
  const parentElement = elements.find((element) => element.id === selectedElementId && getMindmapNode(element));
  if (!parentElement) return null;
  const parent = getMindmapNode(parentElement)!;
  const isSibling = direction === "sibling" && parent.parentNodeId !== null;
  const parentNodeId = (isSibling ? parent.parentNodeId : parent.nodeId) ?? parent.nodeId;
  const connectionParent = isSibling
    ? elements.find((element) => getMindmapNode(element)?.nodeId === parent.parentNodeId)
    : parentElement;
  if (!connectionParent) return null;

  const offsets = {
    left: [-300, 0],
    right: [300, 0],
    up: [0, -160],
    down: [0, 160],
    child: [300, 0],
    sibling: [0, 150],
  } as const;
  const [dx, dy] = offsets[direction];
  const nodeId = createId("node");
  const created = createMindmapElements(
    nodeId,
    "New idea",
    parentElement.x + dx,
    parentElement.y + dy,
    parentNodeId,
    nextSiblingOrder(elements, parentNodeId),
  );
  const shape = created.find((element) => getMindmapNode(element));
  if (!shape) return null;
  let next = appendBoundConnection(
    [...elements, ...created],
    connectionParent.id,
    shape.id,
    parentNodeId,
    nodeId,
    "hierarchy",
  );
  if (shouldReflowAfterInsertion(direction)) next = reflowMindmapElements(next);
  return { elements: next, nodeElementId: shape.id, nodeId };
}

export function removeMindmapSubtree(
  elements: readonly OrderedExcalidrawElement[],
  nodeId: string,
  rootNodeId = "root",
): OrderedExcalidrawElement[] | null {
  if (nodeId === rootNodeId) return null;
  const wanted = new Set([nodeId]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const element of elements) {
      const node = getMindmapNode(element);
      if (node?.parentNodeId && wanted.has(node.parentNodeId) && !wanted.has(node.nodeId)) {
        wanted.add(node.nodeId);
        changed = true;
      }
    }
  }
  const shapeIds = new Set(
    elements
      .filter((element) => wanted.has(getMindmapNode(element)?.nodeId ?? ""))
      .map((element) => element.id),
  );
  const remaining = elements.filter((element) => {
    if (shapeIds.has(element.id)) return false;
    if (element.type === "text" && element.containerId && shapeIds.has(element.containerId)) return false;
    const connection = getMindmapConnection(element);
    return !connection || (!wanted.has(connection.fromNodeId) && !wanted.has(connection.toNodeId));
  });
  return reflowMindmapElements(remaining, rootNodeId);
}
