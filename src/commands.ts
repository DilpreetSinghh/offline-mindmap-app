import {
  CaptureUpdateAction,
} from "@excalidraw/excalidraw";
import type { AppState, ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import type { ExcalidrawElement, OrderedExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import {
  appendBoundConnection,
  createId,
  createMindmapElements,
  getMindmapConnection,
  getMindmapNode,
  projectFoldedElements,
} from "./document";
import {
  addConnectedMindmapNode,
  getMindmapNodeText,
  reflowConnectedMindmapTree,
  reflowMindmapElements,
  removeMindmapSubtrees,
} from "./mindmap-operations";
import type { MindmapConnectionData, MindmapNodeData } from "./types";
import { routeMindmapShortcut } from "./shortcut-routing.mjs";
import { isOutlinePaste, parseIndentedOutline } from "./outline-format.mjs";
import { foldingIndex, nodeDepths, setNodesCollapsed } from "./folding.mjs";
import { expandSelectedBranches } from "./subtree-selection.mjs";

export { formatShortcutLabel } from "./shortcut-routing.mjs";

export type CommandId =
  | "new-child"
  | "new-sibling"
  | "new-left"
  | "new-right"
  | "new-up"
  | "new-down"
  | "select-left"
  | "select-right"
  | "select-up"
  | "select-down"
  | "copy-subtree"
  | "cut-subtree"
  | "paste-subtree"
  | "duplicate-subtree"
  | "delete-subtree"
  | "toggle-fold"
  | "toggle-sibling-folds"
  | "fold-one-level"
  | "unfold-one-level"
  | "fold-all"
  | "unfold-all"
  | "reflow-map"
  | "add-relationship"
  | "command-palette"
  | "shortcut-help"
  | "search-map";

export type CommandContext = {
  api: ExcalidrawImperativeAPI;
  rootNodeId: string;
  getCanonicalElements: () => readonly OrderedExcalidrawElement[];
  stageCanonicalElements: (elements: readonly OrderedExcalidrawElement[]) => void;
  openPalette: () => void;
  openHelp: () => void;
  openSearch: () => void;
  announce: (message: string, state?: "saved" | "error") => void;
};

export type Command = {
  id: CommandId;
  label: string;
  shortcut: string;
  keywords: string;
  execute: (context: CommandContext) => void | Promise<void>;
};

type ClipboardNode = {
  data: MindmapNodeData;
  text: string;
  x: number;
  y: number;
  shape: OrderedExcalidrawElement;
  label: OrderedExcalidrawElement | null;
};

type ClipboardConnection = { data: MindmapConnectionData; element: OrderedExcalidrawElement };
type SubtreeClipboard = {
  format: "offline-mindmap-subtree";
  version: 2;
  rootNodeId: string;
  nodes: ClipboardNode[];
  connections: ClipboardConnection[];
};
let subtreeClipboard: SubtreeClipboard | null = null;

function selectedNodeElements(api: ExcalidrawImperativeAPI): OrderedExcalidrawElement[] {
  const selected = api.getAppState().selectedElementIds;
  return api.getSceneElements().filter((element) => selected[element.id] && getMindmapNode(element));
}

function primaryNode(api: ExcalidrawImperativeAPI): OrderedExcalidrawElement | null {
  return selectedNodeElements(api)[0] ?? null;
}

function selectedRootCandidate(api: ExcalidrawImperativeAPI): OrderedExcalidrawElement | null {
  if (api.getSceneElements().some((element) => getMindmapNode(element))) return null;
  const selected = api.getAppState().selectedElementIds;
  return api.getSceneElements().find((element) => (
    selected[element.id]
    && (element.type === "rectangle" || element.type === "ellipse" || element.type === "diamond")
  )) ?? null;
}

function getNodeText(elements: readonly ExcalidrawElement[], containerId: string): string {
  const nodeId = getMindmapNode(elements.find((element) => element.id === containerId)!)?.nodeId;
  return nodeId ? getMindmapNodeText(elements, nodeId) : "Untitled node";
}

function nextSiblingOrder(elements: readonly ExcalidrawElement[], parentNodeId: string | null): number {
  return elements.reduce((count, element) => {
    const node = getMindmapNode(element);
    return node?.parentNodeId === parentNodeId ? Math.max(count, node.siblingOrder + 1) : count;
  }, 0);
}

function transact(api: ExcalidrawImperativeAPI, elements: readonly OrderedExcalidrawElement[], selectedIds: string[]): void {
  api.updateScene({
    elements,
    appState: {
      ...api.getAppState(),
      selectedElementIds: Object.fromEntries(selectedIds.map((id) => [id, true])),
    },
    captureUpdate: CaptureUpdateAction.IMMEDIATELY,
  });
}

function addConnectedNode(context: CommandContext, direction: "left" | "right" | "up" | "down" | "child" | "sibling"): void {
  const { api } = context;
  let elements = api.getSceneElements();
  let parentElement = primaryNode(api);
  let promotedRoot = false;
  if (!parentElement) {
    const candidate = selectedRootCandidate(api);
    if (candidate) {
      elements = elements.map((element) => element.id === candidate.id ? {
        ...element,
        customData: {
          ...element.customData,
          mindmapNode: {
            nodeId: context.rootNodeId,
            parentNodeId: null,
            siblingOrder: 0,
            collapsed: false,
          },
        },
      } as OrderedExcalidrawElement : element);
      parentElement = elements.find((element) => element.id === candidate.id) ?? null;
      promotedRoot = Boolean(parentElement);
    }
  }
  if (!parentElement) {
    context.announce("Select a mind-map node or a shape to use as the new root.", "error");
    return;
  }
  const result = addConnectedMindmapNode(elements, parentElement.id, direction);
  if (!result) return;
  transact(api, result.elements, [result.nodeElementId]);
  const created = result.elements.find((element) => element.id === result.nodeElementId);
  if (created) api.scrollToContent(created, { animate: true, fitToContent: false });
  if (promotedRoot) context.announce("Selected shape is now the root mind-map node.");
}

function selectNearest(context: CommandContext, direction: "left" | "right" | "up" | "down"): void {
  const { api } = context;
  const current = primaryNode(api);
  if (!current) return;
  const candidates = api.getSceneElements().filter((element) => {
    if (element.id === current.id || element.isDeleted || !getMindmapNode(element)) return false;
    if (direction === "left") return element.x < current.x;
    if (direction === "right") return element.x > current.x;
    if (direction === "up") return element.y < current.y;
    return element.y > current.y;
  });
  let nearest: OrderedExcalidrawElement | null = null;
  let distance = Number.POSITIVE_INFINITY;
  for (const candidate of candidates) {
    const dx = candidate.x - current.x;
    const dy = candidate.y - current.y;
    const score = Math.hypot(dx, dy);
    if (score < distance) {
      distance = score;
      nearest = candidate;
    }
  }
  if (!nearest) return;
  api.updateScene({ appState: { ...api.getAppState(), selectedElementIds: { [nearest.id]: true } } });
  api.scrollToContent(nearest, { animate: true, fitToContent: false });
}

function collectSubtree(context: CommandContext): SubtreeClipboard | null {
  const root = primaryNode(context.api);
  if (!root) return null;
  const elements = context.getCanonicalElements();
  const rootData = getMindmapNode(root)!;
  const wanted = new Set([rootData.nodeId]);
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
  const nodes = elements.flatMap((element) => {
    const data = getMindmapNode(element);
    if (!data || !wanted.has(data.nodeId)) return [];
    const label = elements.find((candidate) => candidate.type === "text" && candidate.containerId === element.id) ?? null;
    return [{
      data: structuredClone(data),
      text: getNodeText(elements, element.id),
      x: element.x,
      y: element.y,
      shape: structuredClone(element),
      label: label ? structuredClone(label) : null,
    }];
  });
  const connections = elements.flatMap((element) => {
    const data = getMindmapConnection(element);
    if (!data || !wanted.has(data.fromNodeId) || !wanted.has(data.toNodeId)) return [];
    return [{ data: structuredClone(data), element: structuredClone(element) }];
  });
  return { format: "offline-mindmap-subtree", version: 2, rootNodeId: rootData.nodeId, nodes, connections };
}

async function copySubtree(context: CommandContext): Promise<void> {
  subtreeClipboard = collectSubtree(context);
  if (!subtreeClipboard) return;
  try {
    await navigator.clipboard.writeText(`offline-mindmap-subtree:${JSON.stringify(subtreeClipboard)}`);
  } catch {
    // The internal clipboard remains available when browser clipboard permission is unavailable.
  }
  context.announce(`Copied ${subtreeClipboard.nodes.length} mind-map node(s).`);
}

function removeNodeIds(context: CommandContext, nodeIds: readonly string[]): void {
  if (!nodeIds.length) return;
  if (nodeIds.includes(context.rootNodeId)) {
    context.announce("The root node cannot be deleted.", "error");
    return;
  }
  const elements = context.getCanonicalElements();
  const records = elements.flatMap((element) => {
    const node = getMindmapNode(element);
    return node ? [{ nodeId: node.nodeId, parentNodeId: node.parentNodeId }] : [];
  });
  const expanded = expandSelectedBranches(records, nodeIds, context.rootNodeId);
  const hidden = foldingIndex(elements).hiddenNodeIds as Set<string>;
  if (expanded.nodeIds.some((nodeId) => hidden.has(nodeId))) {
    context.announce("Expand folded branches before deleting them so Undo can restore every node.", "error");
    return;
  }
  const remaining = removeMindmapSubtrees(elements, nodeIds, context.rootNodeId);
  if (!remaining) return;
  transact(context.api, projectFoldedElements(remaining), []);
}

function removeSelectedSubtrees(context: CommandContext): void {
  const selected = selectedNodeElements(context.api).map((element) => getMindmapNode(element)!.nodeId);
  if (!selected.length) return;
  removeNodeIds(context, selected);
  if (!selected.includes(context.rootNodeId)) context.announce(`Deleted ${selected.length} selected branch${selected.length === 1 ? "" : "es"}.`);
}

async function cutSubtree(context: CommandContext): Promise<void> {
  await copySubtree(context);
  if (subtreeClipboard) removeNodeIds(context, [subtreeClipboard.rootNodeId]);
}

function isSubtreeClipboard(value: unknown): value is SubtreeClipboard {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<SubtreeClipboard>;
  return candidate.format === "offline-mindmap-subtree"
    && candidate.version === 2
    && typeof candidate.rootNodeId === "string"
    && Array.isArray(candidate.nodes)
    && candidate.nodes.length > 0
    && Array.isArray(candidate.connections);
}

function appendStyledConnection(
  scene: readonly OrderedExcalidrawElement[],
  fromElementId: string,
  toElementId: string,
  fromNodeId: string,
  toNodeId: string,
  role: MindmapConnectionData["role"],
  source?: OrderedExcalidrawElement,
): OrderedExcalidrawElement[] {
  const existingIds = new Set(scene.map((element) => element.id));
  const next = appendBoundConnection(scene, fromElementId, toElementId, fromNodeId, toNodeId, role);
  if (!source) return next;
  const created = next.find((element) => !existingIds.has(element.id) && element.type === "arrow");
  if (!created) return next;
  return next.map((element) => element.id === created.id ? {
    ...element,
    strokeColor: source.strokeColor,
    backgroundColor: source.backgroundColor,
    fillStyle: source.fillStyle,
    strokeWidth: source.strokeWidth,
    strokeStyle: source.strokeStyle,
    roughness: source.roughness,
    opacity: source.opacity,
    startArrowhead: source.type === "arrow" ? source.startArrowhead : null,
    endArrowhead: source.type === "arrow" ? source.endArrowhead : "arrow",
  } as OrderedExcalidrawElement : element);
}

function pasteSubtree(
  context: CommandContext,
  clipboard = subtreeClipboard,
  targetOverride?: OrderedExcalidrawElement | null,
): void {
  const target = targetOverride ?? primaryNode(context.api);
  if (!clipboard || !target) {
    context.announce("Copy a subtree and select a destination node first.", "error");
    return;
  }
  const targetData = getMindmapNode(target)!;
  const elements = context.api.getSceneElements();
  const sourceRoot = clipboard.nodes.find((node) => node.data.nodeId === clipboard.rootNodeId);
  if (!sourceRoot) {
    context.announce("The copied subtree is invalid.", "error");
    return;
  }
  const idMap = new Map(clipboard.nodes.map((node) => [node.data.nodeId, createId("node")]));
  const shapeByNodeId = new Map<string, string>();
  const additions: OrderedExcalidrawElement[] = [];
  for (const source of clipboard.nodes) {
    const nodeId = idMap.get(source.data.nodeId)!;
    const isRoot = source.data.nodeId === clipboard.rootNodeId;
    const parentNodeId = isRoot ? targetData.nodeId : idMap.get(source.data.parentNodeId!)!;
    const x = target.x + 280 + source.x - sourceRoot.x;
    const y = target.y + source.y - sourceRoot.y;
    const shapeId = createId("shape");
    const labelId = source.label ? createId("label") : null;
    const data: MindmapNodeData = {
      ...structuredClone(source.data),
      nodeId,
      parentNodeId,
      siblingOrder: isRoot ? nextSiblingOrder(elements, targetData.nodeId) : source.data.siblingOrder,
      collapsed: false,
    };
    const shape = {
      ...structuredClone(source.shape),
      id: shapeId,
      x,
      y,
      isDeleted: false,
      groupIds: [],
      boundElements: labelId ? [{ id: labelId, type: "text" as const }] : [],
      customData: { ...source.shape.customData, mindmapNode: data },
      updated: Date.now(),
    } as OrderedExcalidrawElement;
    additions.push(shape);
    if (source.label && labelId) additions.push({
      ...structuredClone(source.label),
      id: labelId,
      x: x + source.label.x - source.x,
      y: y + source.label.y - source.y,
      containerId: shapeId,
      isDeleted: false,
      groupIds: [],
      updated: Date.now(),
    } as OrderedExcalidrawElement);
    shapeByNodeId.set(nodeId, shapeId);
  }
  let combinedScene = [...elements, ...additions];
  for (const source of clipboard.nodes) {
    const nodeId = idMap.get(source.data.nodeId)!;
    const isRoot = source.data.nodeId === clipboard.rootNodeId;
    const parentNodeId = isRoot ? targetData.nodeId : idMap.get(source.data.parentNodeId!)!;
    const parentElementId = isRoot ? target.id : shapeByNodeId.get(parentNodeId)!;
    const sourceConnection = clipboard.connections.find((connection) => (
      connection.data.role === "hierarchy" && connection.data.toNodeId === source.data.nodeId
    ));
    combinedScene = appendStyledConnection(
      combinedScene,
      parentElementId,
      shapeByNodeId.get(nodeId)!,
      parentNodeId,
      nodeId,
      "hierarchy",
      sourceConnection?.element,
    );
  }
  for (const connection of clipboard.connections.filter((item) => item.data.role === "relationship")) {
    const fromNodeId = idMap.get(connection.data.fromNodeId);
    const toNodeId = idMap.get(connection.data.toNodeId);
    if (!fromNodeId || !toNodeId) continue;
    combinedScene = appendStyledConnection(
      combinedScene,
      shapeByNodeId.get(fromNodeId)!,
      shapeByNodeId.get(toNodeId)!,
      fromNodeId,
      toNodeId,
      "relationship",
      connection.element,
    );
  }
  const selected = shapeByNodeId.get(idMap.get(clipboard.rootNodeId)!)!;
  transact(context.api, combinedScene, [selected]);
  context.announce(`Pasted ${clipboard.nodes.length} node${clipboard.nodes.length === 1 ? "" : "s"} with styles and connections.`);
}

async function duplicateSubtree(context: CommandContext): Promise<void> {
  const selected = primaryNode(context.api);
  const selectedData = selected && getMindmapNode(selected);
  if (!selected || !selectedData) return;
  const parent = selectedData.parentNodeId
    ? context.api.getSceneElements().find((element) => getMindmapNode(element)?.nodeId === selectedData.parentNodeId)
    : selected;
  await copySubtree(context);
  pasteSubtree(context, subtreeClipboard, parent);
}

function pasteOutline(context: CommandContext, text: string): void {
  const target = primaryNode(context.api);
  const records = parseIndentedOutline(text);
  if (!target || !records.length) return;
  const targetData = getMindmapNode(target)!;
  const idByIndex = new Map<number, string>();
  const shapeByIndex = new Map<number, string>();
  let scene = [...context.api.getSceneElements()];
  const siblingState = new Map<string, { base: number; count: number }>([
    [targetData.nodeId, { base: nextSiblingOrder(scene, targetData.nodeId), count: 0 }],
  ]);
  records.forEach((record, index) => {
    const nodeId = createId("node");
    const parentNodeId = record.parentIndex === null ? targetData.nodeId : idByIndex.get(record.parentIndex)!;
    const siblings = siblingState.get(parentNodeId) ?? { base: 0, count: 0 };
    const siblingOrder = siblings.base + siblings.count;
    siblingState.set(parentNodeId, { ...siblings, count: siblings.count + 1 });
    const created = createMindmapElements(
      nodeId,
      record.text,
      target.x + 280 + record.depth * 230,
      target.y + (index - (records.length - 1) / 2) * 120,
      parentNodeId,
      siblingOrder,
    );
    const shape = created.find((element) => getMindmapNode(element))!;
    scene.push(...created);
    const parentElementId = record.parentIndex === null ? target.id : shapeByIndex.get(record.parentIndex)!;
    scene = appendBoundConnection(scene, parentElementId, shape.id, parentNodeId, nodeId, "hierarchy");
    idByIndex.set(index, nodeId);
    shapeByIndex.set(index, shape.id);
  });
  transact(context.api, reflowMindmapElements(scene, context.rootNodeId), [...shapeByIndex.values()]);
  context.announce(`Pasted ${records.length} outline node${records.length === 1 ? "" : "s"}.`);
}

function applyFoldState(
  context: CommandContext,
  nodeIds: readonly string[],
  collapsed: boolean,
  message: string,
): void {
  const canonical = context.getCanonicalElements();
  const next = setNodesCollapsed(canonical, nodeIds, collapsed) as OrderedExcalidrawElement[];
  context.stageCanonicalElements(next);
  transact(context.api, projectFoldedElements(next), selectedNodeElements(context.api).map((element) => element.id));
  context.announce(message);
}

function toggleSelectedFold(context: CommandContext): void {
  const selected = primaryNode(context.api);
  const selectedData = selected && getMindmapNode(selected);
  if (!selectedData) return;
  const canonical = context.getCanonicalElements();
  const index = foldingIndex(canonical);
  if (!(index.children.get(selectedData.nodeId)?.length)) {
    context.announce("This node has no descendants to fold.", "error");
    return;
  }
  const current = index.nodes.get(selectedData.nodeId);
  const collapse = !current?.collapsed;
  applyFoldState(context, [selectedData.nodeId], collapse, collapse ? "Branch collapsed." : "Branch expanded.");
}

function toggleSiblingFolds(context: CommandContext): void {
  const selected = primaryNode(context.api);
  const selectedData = selected && getMindmapNode(selected);
  if (!selectedData) return;
  const canonical = context.getCanonicalElements();
  const index = foldingIndex(canonical);
  const siblingIds = ((index.children.get(selectedData.parentNodeId) ?? []) as string[])
    .filter((nodeId) => (index.children.get(nodeId)?.length ?? 0) > 0);
  if (!siblingIds.length) {
    context.announce("No sibling branches have descendants to fold.", "error");
    return;
  }
  const collapse = siblingIds.some((nodeId) => !index.nodes.get(nodeId)?.collapsed);
  applyFoldState(context, siblingIds, collapse, collapse ? "Sibling branches collapsed." : "Sibling branches expanded.");
}

function foldOneVisibleLevel(context: CommandContext): void {
  const canonical = context.getCanonicalElements();
  const index = foldingIndex(canonical);
  const depths = nodeDepths(canonical);
  const candidates = [...index.nodes.keys()].filter((nodeId) => (
    !index.hiddenNodeIds.has(nodeId)
    && !index.nodes.get(nodeId)?.collapsed
    && (index.children.get(nodeId)?.length ?? 0) > 0
  ));
  if (!candidates.length) return;
  const deepest = Math.max(...candidates.map((nodeId) => depths.get(nodeId) ?? 0));
  applyFoldState(context, candidates.filter((nodeId) => depths.get(nodeId) === deepest), true, "Collapsed one visible level.");
}

function unfoldOneLevel(context: CommandContext): void {
  const canonical = context.getCanonicalElements();
  const index = foldingIndex(canonical);
  const depths = nodeDepths(canonical);
  const candidates = [...index.nodes.keys()].filter((nodeId) => (
    !index.hiddenNodeIds.has(nodeId) && index.nodes.get(nodeId)?.collapsed
  ));
  if (!candidates.length) return;
  const shallowest = Math.min(...candidates.map((nodeId) => depths.get(nodeId) ?? 0));
  applyFoldState(context, candidates.filter((nodeId) => depths.get(nodeId) === shallowest), false, "Expanded one level.");
}

function foldAll(context: CommandContext): void {
  const canonical = context.getCanonicalElements();
  const index = foldingIndex(canonical);
  const branchIds = [...index.nodes.keys()].filter((nodeId) => (index.children.get(nodeId)?.length ?? 0) > 0);
  applyFoldState(context, branchIds, true, "All branches collapsed.");
}

function unfoldAll(context: CommandContext): void {
  const canonical = context.getCanonicalElements();
  applyFoldState(context, [...foldingIndex(canonical).nodes.keys()], false, "All branches expanded.");
}

export function canPasteMindmapText(text: string): boolean {
  return text.startsWith("offline-mindmap-subtree:") || isOutlinePaste(text);
}

export function pasteMindmapText(context: CommandContext, text: string): void {
  if (text.startsWith("offline-mindmap-subtree:")) {
    try {
      const parsed: unknown = JSON.parse(text.slice("offline-mindmap-subtree:".length));
      if (!isSubtreeClipboard(parsed)) throw new Error("Unsupported subtree clipboard format.");
      subtreeClipboard = parsed;
      pasteSubtree(context, parsed);
    } catch (error) {
      context.announce(`Paste failed: ${error instanceof Error ? error.message : String(error)}`, "error");
    }
    return;
  }
  if (isOutlinePaste(text)) pasteOutline(context, text);
}

function addRelationship(context: CommandContext): void {
  const selected = selectedNodeElements(context.api);
  if (selected.length !== 2) {
    context.announce("Select exactly two mind-map nodes to add a relationship.", "error");
    return;
  }
  const from = getMindmapNode(selected[0])!;
  const to = getMindmapNode(selected[1])!;
  const elements = context.api.getSceneElements();
  const next = appendBoundConnection(elements, selected[0].id, selected[1].id, from.nodeId, to.nodeId, "relationship");
  const arrow = next.find((element) => !elements.some((existing) => existing.id === element.id) && element.type === "arrow");
  transact(context.api, next, arrow ? [arrow.id] : []);
}

function reflowMap(context: CommandContext): void {
  const elements = context.api.getSceneElements();
  const rootNodeId = elements.map(getMindmapNode).find((node) => node?.parentNodeId === null)?.nodeId;
  const result = reflowConnectedMindmapTree(elements, rootNodeId);
  if (result.nodeCount < 2) {
    context.announce("Connect at least two shapes, or point an arrow endpoint at each shape, then rearrange again.", "error");
    return;
  }
  const selectedIds = Object.keys(context.api.getAppState().selectedElementIds);
  transact(context.api, result.elements, selectedIds);
  const arrangedElementIds = new Set(result.arrangedElementIds);
  const arrangedNodes = result.elements.filter((element) => arrangedElementIds.has(element.id));
  context.api.scrollToContent(arrangedNodes, { animate: true, fitToContent: true, maxZoom: 1 });
  context.announce(result.includedWhiteboardNodeCount
    ? `Mind map rearranged with ${result.includedWhiteboardNodeCount} connected whiteboard shape(s) included.`
    : "Mind map rearranged with space for every subtree.");
}

export const commandRegistry: readonly Command[] = [
  { id: "new-child", label: "Create child node", shortcut: "Tab", keywords: "child branch", execute: (c) => addConnectedNode(c, "child") },
  { id: "new-sibling", label: "Create sibling node", shortcut: "Cmd/Ctrl+Enter", keywords: "sibling peer", execute: (c) => addConnectedNode(c, "sibling") },
  { id: "new-left", label: "Create node to the left", shortcut: "Cmd/Ctrl+←", keywords: "left node", execute: (c) => addConnectedNode(c, "left") },
  { id: "new-right", label: "Create node to the right", shortcut: "Cmd/Ctrl+→", keywords: "right node", execute: (c) => addConnectedNode(c, "right") },
  { id: "new-up", label: "Create node above", shortcut: "Cmd/Ctrl+↑", keywords: "up node", execute: (c) => addConnectedNode(c, "up") },
  { id: "new-down", label: "Create node below", shortcut: "Cmd/Ctrl+↓", keywords: "down node", execute: (c) => addConnectedNode(c, "down") },
  { id: "select-left", label: "Select nearest node left", shortcut: "←", keywords: "navigate left", execute: (c) => selectNearest(c, "left") },
  { id: "select-right", label: "Select nearest node right", shortcut: "→", keywords: "navigate right", execute: (c) => selectNearest(c, "right") },
  { id: "select-up", label: "Select nearest node above", shortcut: "↑", keywords: "navigate up", execute: (c) => selectNearest(c, "up") },
  { id: "select-down", label: "Select nearest node below", shortcut: "↓", keywords: "navigate down", execute: (c) => selectNearest(c, "down") },
  { id: "copy-subtree", label: "Copy subtree", shortcut: "Cmd/Ctrl+C", keywords: "clipboard copy branch", execute: copySubtree },
  { id: "cut-subtree", label: "Cut subtree", shortcut: "Cmd/Ctrl+X", keywords: "clipboard cut branch", execute: cutSubtree },
  { id: "paste-subtree", label: "Paste subtree", shortcut: "Cmd/Ctrl+V", keywords: "clipboard paste branch", execute: pasteSubtree },
  { id: "duplicate-subtree", label: "Duplicate subtree", shortcut: "Cmd/Ctrl+D", keywords: "copy duplicate branch", execute: duplicateSubtree },
  { id: "delete-subtree", label: "Delete subtree", shortcut: "Delete", keywords: "remove branch", execute: removeSelectedSubtrees },
  { id: "toggle-fold", label: "Collapse or expand selected branch", shortcut: "", keywords: "fold unfold hide descendants", execute: toggleSelectedFold },
  { id: "toggle-sibling-folds", label: "Collapse or expand sibling branches", shortcut: "", keywords: "fold unfold siblings", execute: toggleSiblingFolds },
  { id: "fold-one-level", label: "Collapse one visible level", shortcut: "", keywords: "fold depth level", execute: foldOneVisibleLevel },
  { id: "unfold-one-level", label: "Expand one level", shortcut: "", keywords: "unfold reveal depth level", execute: unfoldOneLevel },
  { id: "fold-all", label: "Collapse all branches", shortcut: "", keywords: "fold hide all levels", execute: foldAll },
  { id: "unfold-all", label: "Expand all branches", shortcut: "", keywords: "unfold reveal all levels", execute: unfoldAll },
  { id: "reflow-map", label: "Rearrange mind map", shortcut: "", keywords: "layout reflow space overlap branches", execute: reflowMap },
  { id: "add-relationship", label: "Connect selected nodes as a relationship", shortcut: "", keywords: "arrow cross connection", execute: addRelationship },
  { id: "command-palette", label: "Open command palette", shortcut: "Cmd/Ctrl+K", keywords: "search commands", execute: (c) => c.openPalette() },
  { id: "shortcut-help", label: "Open shortcut reference", shortcut: "?", keywords: "help keyboard", execute: (c) => c.openHelp() },
  { id: "search-map", label: "Search and replace map", shortcut: "Cmd/Ctrl+F", keywords: "find replace filter jump node", execute: (c) => c.openSearch() },
];

export function findCommand(id: CommandId): Command {
  const command = commandRegistry.find((item) => item.id === id);
  if (!command) throw new Error(`Unknown command: ${id}`);
  return command;
}

export function isTextEditing(appState: AppState): boolean {
  return Boolean(appState.editingTextElement || appState.newElement?.type === "text");
}

export function commandForKeyboardEvent(event: KeyboardEvent, appState: AppState): CommandId | null {
  const target = event.target;
  const formControl = target instanceof HTMLElement && Boolean(
    target.isContentEditable
    || target.closest("input, textarea, select, button, [role='textbox'], [contenteditable='true']"),
  );
  return routeMindmapShortcut(event, { editing: isTextEditing(appState), formControl }) as CommandId | null;
}
