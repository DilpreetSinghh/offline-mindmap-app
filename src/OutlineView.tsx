import { memo, useEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent } from "react";
import type { OrderedExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import { getMindmapNode } from "./document";
import { foldingIndex } from "./folding.mjs";
import type { OutlineMove } from "./mindmap-operations";

type Row = { nodeId: string; parentNodeId: string | null; siblingOrder: number; depth: number; title: string; collapsed: boolean; childCount: number; hiddenCount: number; tags: string[]; taskState: string; notes: string; url: string; internalTargetNodeId: string };
type Props = { elements: readonly OrderedExcalidrawElement[]; rootNodeId: string; selectedNodeId: string; onSelect: (id: string) => void; onRename: (id: string, value: string) => void; onMove: (id: string, move: OutlineMove) => void; onDelete: (id: string) => void; onToggleFold: (id: string) => void; onExport: () => void };
const ROW_HEIGHT = 54;

export function rowsFromElements(elements: readonly OrderedExcalidrawElement[], rootNodeId: string): Row[] {
  const titles = new Map(elements.flatMap((element) => element.type === "text" && element.containerId ? [[element.containerId, element.originalText || element.text] as const] : []));
  const nodes = elements.flatMap((element) => {
    const data = getMindmapNode(element);
    if (!data) return [];
    const extra = data as typeof data & { tags?: string[]; taskState?: string };
    return [{ ...data, elementId: element.id, title: titles.get(element.id) ?? "Untitled node", tags: extra.tags ?? [], taskState: extra.taskState ?? "none", notes: data.notes ?? "", url: data.url ?? "", internalTargetNodeId: data.internalTargetNodeId ?? "" }];
  });
  const byId = new Map(nodes.map((node) => [node.nodeId, node]));
  const children = new Map<string | null, typeof nodes>();
  for (const node of nodes) children.set(node.parentNodeId, [...(children.get(node.parentNodeId) ?? []), node]);
  for (const values of children.values()) values.sort((a, b) => a.siblingOrder - b.siblingOrder || a.nodeId.localeCompare(b.nodeId));
  const folds = foldingIndex(elements);
  const rows: Row[] = [];
  const visited = new Set<string>();
  const visit = (id: string, depth: number) => {
    if (visited.has(id)) return;
    const node = byId.get(id); if (!node) return;
    visited.add(id);
    const descendants = children.get(id) ?? [];
    rows.push({ ...node, depth, childCount: descendants.length, hiddenCount: folds.hiddenDescendantCount.get(id) ?? 0 });
    if (!node.collapsed) descendants.forEach((child) => visit(child.nodeId, depth + 1));
  };
  visit(rootNodeId, 0);
  nodes.forEach((node) => { if (!visited.has(node.nodeId) && !folds.hiddenNodeIds.has(node.nodeId)) visit(node.nodeId, 0); });
  return rows;
}

export function outlineMarkdown(elements: readonly OrderedExcalidrawElement[], rootNodeId: string): string {
  return `${rowsFromElements(elements, rootNodeId).map((row) => `${"  ".repeat(row.depth)}- ${row.title}`).join("\n")}\n`;
}

const OutlineRow = memo(function OutlineRow({ row, selected, rootNodeId, onSelect, onRename, onMove, onDelete, onToggleFold, onKey }: { row: Row; selected: boolean; rootNodeId: string; onSelect: (id: string) => void; onRename: (id: string, value: string) => void; onMove: (id: string, move: OutlineMove) => void; onDelete: (id: string) => void; onToggleFold: (id: string) => void; onKey: (event: KeyboardEvent, id: string) => void }) {
  const [draft, setDraft] = useState(row.title);
  useEffect(() => setDraft(row.title), [row.title]);
  const commit = () => { const value = draft.trim() || "Untitled node"; setDraft(value); if (value !== row.title) onRename(row.nodeId, value); };
  return <div className={selected ? "outline-row selected" : "outline-row"} style={{ "--outline-depth": row.depth } as CSSProperties} data-node-id={row.nodeId} onClick={() => onSelect(row.nodeId)} onKeyDown={(event) => onKey(event, row.nodeId)}>
    <button className="outline-fold" type="button" disabled={!row.childCount} aria-label={row.collapsed ? `Expand ${row.title}` : `Collapse ${row.title}`} onClick={(event) => { event.stopPropagation(); onToggleFold(row.nodeId); }}>{row.childCount ? row.collapsed ? "▸" : "▾" : "·"}</button>
    <input value={draft} aria-label={`Outline title ${row.title}`} onFocus={() => onSelect(row.nodeId)} onChange={(event) => setDraft(event.target.value)} onBlur={commit} onKeyDown={(event) => { if (event.key === "Enter") event.currentTarget.blur(); onKey(event, row.nodeId); }} />
    <span className="outline-meta">{row.collapsed && row.hiddenCount ? `+${row.hiddenCount}` : ""}{row.taskState !== "none" ? ` ${row.taskState}` : ""}{row.tags.map((tag) => ` #${tag}`).join("")}{row.notes ? " • note" : ""}{row.url ? " • link" : ""}{row.internalTargetNodeId ? " • topic" : ""}</span>
    <div className="outline-actions"><button type="button" title="Move up" onClick={() => onMove(row.nodeId, "up")}>↑</button><button type="button" title="Move down" onClick={() => onMove(row.nodeId, "down")}>↓</button><button type="button" title="Indent" onClick={() => onMove(row.nodeId, "indent")}>→</button><button type="button" title="Outdent" onClick={() => onMove(row.nodeId, "outdent")}>←</button>{row.nodeId !== rootNodeId ? <button type="button" title="Delete" onClick={() => onDelete(row.nodeId)}>×</button> : null}</div>
  </div>;
});

export default function OutlineView(props: Props) {
  const rows = useMemo(() => rowsFromElements(props.elements, props.rootNodeId), [props.elements, props.rootNodeId]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [viewport, setViewport] = useState({ top: 0, height: 600 });
  useEffect(() => { const element = scrollRef.current; if (!element) return; const observer = new ResizeObserver(() => setViewport((value) => ({ ...value, height: element.clientHeight }))); observer.observe(element); return () => observer.disconnect(); }, []);
  useEffect(() => { const index = rows.findIndex((row) => row.nodeId === props.selectedNodeId); const element = scrollRef.current; if (index < 0 || !element) return; const top = index * ROW_HEIGHT; if (top < element.scrollTop || top + ROW_HEIGHT > element.scrollTop + element.clientHeight) element.scrollTo({ top: Math.max(0, top - element.clientHeight / 2) }); }, [props.selectedNodeId, rows]);
  const start = Math.max(0, Math.floor(viewport.top / ROW_HEIGHT) - 8);
  const end = Math.min(rows.length, Math.ceil((viewport.top + viewport.height) / ROW_HEIGHT) + 8);
  const onKey = (event: KeyboardEvent, nodeId: string) => {
    const index = rows.findIndex((row) => row.nodeId === nodeId);
    if (event.altKey && (event.key === "ArrowUp" || event.key === "ArrowDown")) { event.preventDefault(); props.onMove(nodeId, event.key === "ArrowUp" ? "up" : "down"); return; }
    if (event.key === "Tab") { event.preventDefault(); props.onMove(nodeId, event.shiftKey ? "outdent" : "indent"); return; }
    if (event.key === "ArrowUp" || event.key === "ArrowDown") { event.preventDefault(); const row = rows[index + (event.key === "ArrowUp" ? -1 : 1)]; if (row) props.onSelect(row.nodeId); }
    if (event.key === "Delete" && !(event.target instanceof HTMLInputElement)) { event.preventDefault(); props.onDelete(nodeId); }
  };
  return <section className="outline-view" aria-label="Map outline"><header><div><span className="eyebrow">SYNCHRONISED</span><h1>Outline</h1><p>{rows.length} visible node{rows.length === 1 ? "" : "s"}</p></div><button type="button" onClick={props.onExport}>Export outline</button></header><div ref={scrollRef} className="outline-scroll" tabIndex={0} onScroll={(event) => setViewport((value) => ({ ...value, top: event.currentTarget.scrollTop }))}><div className="outline-window" style={{ height: rows.length * ROW_HEIGHT }}>{rows.slice(start, end).map((row, offset) => <div className="outline-position" key={row.nodeId} style={{ top: (start + offset) * ROW_HEIGHT }}><OutlineRow row={row} selected={row.nodeId === props.selectedNodeId} rootNodeId={props.rootNodeId} onSelect={props.onSelect} onRename={props.onRename} onMove={props.onMove} onDelete={props.onDelete} onToggleFold={props.onToggleFold} onKey={onKey} /></div>)}</div></div><footer>Arrow keys select · Alt+↑/↓ reorder · Tab indents · Shift+Tab outdents · Enter commits</footer></section>;
}
