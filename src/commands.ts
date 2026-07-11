import {
  CaptureUpdateAction,
} from "@excalidraw/excalidraw";
import type { AppState, ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import type { ExcalidrawElement, OrderedExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import { appendBoundConnection, createId, createMindmapElements, getMindmapConnection, getMindmapNode } from "./document";
import {
  addConnectedMindmapNode,
  getMindmapNodeText,
  reflowConnectedMindmapTree,
  reflowMindmapElements,
  removeMindmapSubtree,
} from "./mindmap-operations";
import type { MindmapNodeData } from "./types";

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
  | "reflow-map"
  | "add-relationship"
  | "command-palette"
  | "shortcut-help";

export type CommandContext = {
  api: ExcalidrawImperativeAPI;
  openPalette: () => void;
  openHelp: () => void;
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
};

type SubtreeClipboard = { rootNodeId: string; nodes: ClipboardNode[] };
let subtreeClipboard: SubtreeClipboard | null = null;

function selectedNodeElements(api: ExcalidrawImperativeAPI): OrderedExcalidrawElement[] {
  const selected = api.getAppState().selectedElementIds;
  return api.getSceneElements().filter((element) => selected[element.id] && getMindmapNode(element));
}

function primaryNode(api: ExcalidrawImperativeAPI): OrderedExcalidrawElement | null {
  return selectedNodeElements(api)[0] ?? null;
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
  const parentElement = primaryNode(api);
  if (!parentElement) {
    context.announce("Select a mind-map node first.", "error");
    return;
  }
  const elements = api.getSceneElements();
  const result = addConnectedMindmapNode(elements, parentElement.id, direction);
  if (!result) return;
  transact(api, result.elements, [result.nodeElementId]);
  const created = result.elements.find((element) => element.id === result.nodeElementId);
  if (created) api.scrollToContent(created, { animate: true, fitToContent: false });
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

function collectSubtree(api: ExcalidrawImperativeAPI): SubtreeClipboard | null {
  const root = primaryNode(api);
  if (!root) return null;
  const elements = api.getSceneElements();
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
    return [{ data: structuredClone(data), text: getNodeText(elements, element.id), x: element.x, y: element.y }];
  });
  return { rootNodeId: rootData.nodeId, nodes };
}

async function copySubtree(context: CommandContext): Promise<void> {
  subtreeClipboard = collectSubtree(context.api);
  if (!subtreeClipboard) return;
  try {
    await navigator.clipboard.writeText(`offline-mindmap-subtree:${JSON.stringify(subtreeClipboard)}`);
  } catch {
    // The internal clipboard remains available when browser clipboard permission is unavailable.
  }
  context.announce(`Copied ${subtreeClipboard.nodes.length} mind-map node(s).`);
}

function removeSubtree(context: CommandContext): void {
  const clipboard = collectSubtree(context.api);
  const selected = primaryNode(context.api);
  const selectedNode = selected ? getMindmapNode(selected) : null;
  if (!clipboard || !selectedNode || selectedNode.parentNodeId === null) {
    context.announce("The root node cannot be cut.", "error");
    return;
  }
  const elements = context.api.getSceneElements();
  const rootNodeId = elements.map(getMindmapNode).find((node) => node?.parentNodeId === null)?.nodeId ?? "root";
  const remaining = removeMindmapSubtree(elements, clipboard.rootNodeId, rootNodeId);
  if (!remaining) return;
  transact(context.api, remaining, []);
}

async function cutSubtree(context: CommandContext): Promise<void> {
  await copySubtree(context);
  removeSubtree(context);
}

function pasteSubtree(context: CommandContext): void {
  const target = primaryNode(context.api);
  if (!subtreeClipboard || !target) {
    context.announce("Copy a subtree and select a destination node first.", "error");
    return;
  }
  const targetData = getMindmapNode(target)!;
  const elements = context.api.getSceneElements();
  const sourceRoot = subtreeClipboard.nodes.find((node) => node.data.nodeId === subtreeClipboard!.rootNodeId)!;
  const idMap = new Map(subtreeClipboard.nodes.map((node) => [node.data.nodeId, createId("node")]));
  const shapeByNodeId = new Map<string, string>();
  const additions: OrderedExcalidrawElement[] = [];
  let combinedScene = [...elements, ...additions];
  for (const source of subtreeClipboard.nodes) {
    const nodeId = idMap.get(source.data.nodeId)!;
    const isRoot = source.data.nodeId === subtreeClipboard.rootNodeId;
    const parentNodeId = isRoot ? targetData.nodeId : idMap.get(source.data.parentNodeId!)!;
    const created = createMindmapElements(
      nodeId,
      source.text,
      target.x + 280 + source.x - sourceRoot.x,
      target.y + source.y - sourceRoot.y,
      parentNodeId,
      isRoot ? nextSiblingOrder(elements, targetData.nodeId) : source.data.siblingOrder,
    );
    const shape = created.find((element) => getMindmapNode(element))!;
    shapeByNodeId.set(nodeId, shape.id);
    additions.push(...created);
  }
  for (const source of subtreeClipboard.nodes) {
    const nodeId = idMap.get(source.data.nodeId)!;
    const isRoot = source.data.nodeId === subtreeClipboard.rootNodeId;
    const parentNodeId = isRoot ? targetData.nodeId : idMap.get(source.data.parentNodeId!)!;
    const parentElementId = isRoot ? target.id : shapeByNodeId.get(parentNodeId)!;
    combinedScene = appendBoundConnection(combinedScene, parentElementId, shapeByNodeId.get(nodeId)!, parentNodeId, nodeId, "hierarchy");
  }
  const selected = shapeByNodeId.get(idMap.get(subtreeClipboard.rootNodeId)!)!;
  transact(context.api, reflowMindmapElements(combinedScene), [selected]);
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
  const arrangedNodes = result.elements.filter((element) => getMindmapNode(element));
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
  { id: "duplicate-subtree", label: "Duplicate subtree", shortcut: "Cmd/Ctrl+D", keywords: "copy duplicate branch", execute: async (c) => { await copySubtree(c); pasteSubtree(c); } },
  { id: "delete-subtree", label: "Delete subtree", shortcut: "Delete", keywords: "remove branch", execute: removeSubtree },
  { id: "reflow-map", label: "Rearrange mind map", shortcut: "", keywords: "layout reflow space overlap branches", execute: reflowMap },
  { id: "add-relationship", label: "Connect selected nodes as a relationship", shortcut: "", keywords: "arrow cross connection", execute: addRelationship },
  { id: "command-palette", label: "Open command palette", shortcut: "Cmd/Ctrl+K", keywords: "search commands", execute: (c) => c.openPalette() },
  { id: "shortcut-help", label: "Open shortcut reference", shortcut: "?", keywords: "help keyboard", execute: (c) => c.openHelp() },
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
  const modifier = event.metaKey || event.ctrlKey;
  const key = event.key;
  if (modifier && key.toLowerCase() === "k") return "command-palette";
  if (!modifier && key === "?" && !isTextEditing(appState)) return "shortcut-help";
  if (isTextEditing(appState)) return null;
  if (modifier && key.startsWith("Arrow")) return `new-${key.slice(5).toLowerCase()}` as CommandId;
  if (!modifier && key.startsWith("Arrow")) return `select-${key.slice(5).toLowerCase()}` as CommandId;
  if (!modifier && key === "Tab") return "new-child";
  if (modifier && key === "Enter") return "new-sibling";
  if (modifier && key.toLowerCase() === "c") return "copy-subtree";
  if (modifier && key.toLowerCase() === "x") return "cut-subtree";
  if (modifier && key.toLowerCase() === "v") return "paste-subtree";
  if (modifier && key.toLowerCase() === "d") return "duplicate-subtree";
  if (!modifier && (key === "Delete" || key === "Backspace")) return "delete-subtree";
  return null;
}
