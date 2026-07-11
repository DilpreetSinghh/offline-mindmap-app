import { memo, useEffect, useMemo, useState, type CSSProperties } from "react";
import type { OrderedExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import { getMindmapConnection, getMindmapNode } from "./document";
import { foldingIndex } from "./folding.mjs";

type SimpleNode = {
  nodeId: string;
  parentNodeId: string | null;
  siblingOrder: number;
  depth: number;
  text: string;
  collapsed: boolean;
  childCount: number;
  hiddenDescendantCount: number;
};

type SimpleMindmapProps = {
  elements: readonly OrderedExcalidrawElement[];
  rootNodeId: string;
  selectedNodeId: string;
  onSelect: (nodeId: string) => void;
  onRename: (nodeId: string, text: string) => void;
  onAddChild: (nodeId: string) => void;
  onAddSibling: (nodeId: string) => void;
  onDelete: (nodeId: string) => void;
  onToggleFold: (nodeId: string) => void;
};

const HierarchyArrow = memo(function HierarchyArrow({ depth }: { depth: number }) {
  if (depth === 0) return <span className="simple-root-dot" aria-hidden="true">●</span>;
  return (
    <svg className="simple-arrow" viewBox="0 0 34 34" aria-hidden="true">
      <path d="M3 4v13c0 5 4 8 9 8h14" />
      <path d="m22 19 7 6-7 6" />
    </svg>
  );
});

type SimpleNodeRowProps = {
  node: SimpleNode;
  rootNodeId: string;
  selected: boolean;
  onSelect: (nodeId: string) => void;
  onRename: (nodeId: string, text: string) => void;
  onAddChild: (nodeId: string) => void;
  onAddSibling: (nodeId: string) => void;
  onDelete: (nodeId: string) => void;
  onToggleFold: (nodeId: string) => void;
};

const SimpleNodeRow = memo(function SimpleNodeRow({
  node,
  rootNodeId,
  selected,
  onSelect,
  onRename,
  onAddChild,
  onAddSibling,
  onDelete,
  onToggleFold,
}: SimpleNodeRowProps) {
  const [draft, setDraft] = useState(node.text);
  useEffect(() => setDraft(node.text), [node.text]);
  const commit = () => {
    const next = draft.trim() || "Untitled node";
    setDraft(next);
    if (next !== node.text) onRename(node.nodeId, next);
  };
  return (
    <article
      id={`simple-node-${node.nodeId}`}
      className={selected ? "simple-node-row selected" : "simple-node-row"}
      style={{ "--node-depth": Math.min(node.depth, 6) } as CSSProperties}
      data-node-id={node.nodeId}
    >
      <HierarchyArrow depth={node.depth} />
      <div className="simple-node-card" onClick={() => onSelect(node.nodeId)}>
        <label>
          <span>{node.depth === 0 ? "Central node" : `Level ${node.depth + 1} node`}</span>
          <input
            value={draft}
            aria-label={`Edit ${node.text} text`}
            onFocus={() => onSelect(node.nodeId)}
            onChange={(event) => setDraft(event.target.value)}
            onBlur={commit}
            onKeyDown={(event) => {
              if (event.key === "Enter") event.currentTarget.blur();
            }}
          />
        </label>
        <div className="simple-node-actions" aria-label={`Actions for ${node.text}`}>
          {node.childCount ? <button type="button" onClick={(event) => { event.stopPropagation(); onToggleFold(node.nodeId); }}>{node.collapsed ? `Expand +${node.hiddenDescendantCount}` : "Collapse"}</button> : null}
          <button type="button" onClick={(event) => { event.stopPropagation(); onAddChild(node.nodeId); }}>+ Child</button>
          {node.nodeId !== rootNodeId
            ? <button type="button" onClick={(event) => { event.stopPropagation(); onAddSibling(node.nodeId); }}>+ Sibling</button>
            : null}
          {node.nodeId !== rootNodeId
            ? <button className="danger" type="button" onClick={(event) => { event.stopPropagation(); onDelete(node.nodeId); }}>Delete</button>
            : null}
        </div>
      </div>
    </article>
  );
});

export default function SimpleMindmap({
  elements,
  rootNodeId,
  selectedNodeId,
  onSelect,
  onRename,
  onAddChild,
  onAddSibling,
  onDelete,
  onToggleFold,
}: SimpleMindmapProps) {
  const { rows, relationships, hiddenObjects } = useMemo(() => {
    const textByContainer = new Map(
      elements.flatMap((element) => element.type === "text" && element.containerId
        ? [[element.containerId, element.originalText || element.text] as const]
        : []),
    );
    const nodes = elements.flatMap((element) => {
      const data = getMindmapNode(element);
      if (!data) return [];
      return [{ ...data, text: textByContainer.get(element.id) ?? "Untitled node" }];
    });
    const byId = new Map(nodes.map((node) => [node.nodeId, node]));
    const byParent = new Map<string | null, typeof nodes>();
    for (const node of nodes) {
      const siblings = byParent.get(node.parentNodeId) ?? [];
      siblings.push(node);
      byParent.set(node.parentNodeId, siblings);
    }
    for (const siblings of byParent.values()) {
      siblings.sort((a, b) => a.siblingOrder - b.siblingOrder || a.nodeId.localeCompare(b.nodeId));
    }
    const foldState = foldingIndex(elements);
    const flattened: SimpleNode[] = [];
    const visited = new Set<string>();
    const visit = (nodeId: string, depth: number) => {
      if (visited.has(nodeId)) return;
      const node = byId.get(nodeId);
      if (!node) return;
      visited.add(nodeId);
      const children = byParent.get(nodeId) ?? [];
      flattened.push({
        ...node,
        depth,
        childCount: children.length,
        hiddenDescendantCount: foldState.hiddenDescendantCount.get(nodeId) ?? 0,
      });
      if (!node.collapsed) for (const child of children) visit(child.nodeId, depth + 1);
    };
    visit(rootNodeId, 0);
    for (const node of nodes) {
      if (!visited.has(node.nodeId) && !foldState.hiddenNodeIds.has(node.nodeId)) visit(node.nodeId, 0);
    }

    const visibleNodeIds = new Set(flattened.map((node) => node.nodeId));
    const names = new Map(nodes.map((node) => [node.nodeId, node.text]));
    const relationLabels = elements.flatMap((element) => {
      const connection = getMindmapConnection(element);
      if (connection?.role !== "relationship" || !visibleNodeIds.has(connection.fromNodeId) || !visibleNodeIds.has(connection.toNodeId)) return [];
      return [`${names.get(connection.fromNodeId) ?? "Node"} ↔ ${names.get(connection.toNodeId) ?? "Node"}`];
    });
    const nodeElementIds = new Set(elements.filter((element) => getMindmapNode(element)).map((element) => element.id));
    const hidden = elements.filter((element) => {
      if (getMindmapNode(element) || getMindmapConnection(element)) return false;
      return !(element.type === "text" && element.containerId && nodeElementIds.has(element.containerId));
    }).length;
    return { rows: flattened, relationships: relationLabels, hiddenObjects: hidden };
  }, [elements, rootNodeId]);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      document.getElementById(`simple-node-${selectedNodeId}`)?.scrollIntoView({ block: "nearest" });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [rows.length, selectedNodeId]);

  return (
    <section className="simple-map" aria-label="Simple mind map">
      <header className="simple-map-header">
        <div><span className="eyebrow">TOUCH-FRIENDLY</span><h1>Simple map</h1></div>
        <p>Tap any label to edit it. Arrows show the parent-to-child direction.</p>
      </header>
      <div className="simple-map-list">
        {!rows.length ? (
          <div className="simple-map-empty" role="status">
            <strong>This canvas is a whiteboard.</strong>
            <span>Switch to Whiteboard to edit its drawings, or create a mind map from a selected shape there.</span>
          </div>
        ) : null}
        {rows.map((node) => (
          <SimpleNodeRow
            key={node.nodeId}
            node={node}
            rootNodeId={rootNodeId}
            selected={node.nodeId === selectedNodeId}
            onSelect={onSelect}
            onRename={onRename}
            onAddChild={onAddChild}
            onAddSibling={onAddSibling}
            onDelete={onDelete}
            onToggleFold={onToggleFold}
          />
        ))}
      </div>
      {relationships.length ? <aside className="simple-relationships"><strong>Relationships</strong>{relationships.map((label) => <span key={label}>{label}</span>)}</aside> : null}
      {hiddenObjects ? <p className="simple-map-notice">{hiddenObjects} whiteboard-only object{hiddenObjects === 1 ? " is" : "s are"} hidden here. Switch to Whiteboard to edit {hiddenObjects === 1 ? "it" : "them"}.</p> : null}
    </section>
  );
}
