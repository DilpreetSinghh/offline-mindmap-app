function nodeData(element) {
  const value = element.customData?.mindmapNode;
  return value && typeof value === "object" ? value : null;
}

function connectionData(element) {
  const value = element.customData?.mindmapConnection;
  return value && typeof value === "object" ? value : null;
}

function foldBadge(element) {
  return Boolean(element.customData?.foldBadge);
}

/** @param {readonly any[]} elements */
export function foldingIndex(elements) {
  const nodes = new Map();
  const shapeByNodeId = new Map();
  for (const element of elements) {
    const node = nodeData(element);
    if (!element.isDeleted && node) {
      nodes.set(node.nodeId, node);
      shapeByNodeId.set(node.nodeId, element);
    }
  }
  const children = new Map();
  for (const node of nodes.values()) {
    if (node.parentNodeId === null) continue;
    const siblings = children.get(node.parentNodeId) ?? [];
    siblings.push(node.nodeId);
    children.set(node.parentNodeId, siblings);
  }
  const hiddenNodeIds = new Set();
  const hiddenDescendantCount = new Map();
  const collapsedAncestor = new Map();
  const resolveCollapsedAncestor = (startNodeId) => {
    if (!startNodeId || !nodes.has(startNodeId)) return null;
    if (collapsedAncestor.has(startNodeId)) return collapsedAncestor.get(startNodeId);
    const path = [];
    const visited = new Set();
    let cursor = startNodeId;
    let found = null;
    while (cursor && nodes.has(cursor) && !visited.has(cursor)) {
      if (collapsedAncestor.has(cursor)) {
        found = collapsedAncestor.get(cursor);
        break;
      }
      visited.add(cursor);
      const current = nodes.get(cursor);
      if (current.collapsed) {
        found = cursor;
        collapsedAncestor.set(cursor, cursor);
        break;
      }
      path.push(cursor);
      cursor = current.parentNodeId;
    }
    for (let index = path.length - 1; index >= 0; index -= 1) collapsedAncestor.set(path[index], found);
    return found;
  };
  for (const node of nodes.values()) {
    const ancestorId = resolveCollapsedAncestor(node.parentNodeId);
    if (ancestorId) {
      hiddenNodeIds.add(node.nodeId);
      hiddenDescendantCount.set(ancestorId, (hiddenDescendantCount.get(ancestorId) ?? 0) + 1);
    }
  }
  return { nodes, shapeByNodeId, children, hiddenNodeIds, hiddenDescendantCount };
}

/** @param {readonly any[]} elements */
export function visibleFoldedElements(elements) {
  const index = foldingIndex(elements);
  const hiddenShapeIds = new Set();
  for (const nodeId of index.hiddenNodeIds) {
    const shape = index.shapeByNodeId.get(nodeId);
    if (shape) hiddenShapeIds.add(shape.id);
  }
  return elements.filter((element) => {
    if (foldBadge(element)) return false;
    const node = nodeData(element);
    if (node && index.hiddenNodeIds.has(node.nodeId)) return false;
    if (element.type === "text" && element.containerId && hiddenShapeIds.has(element.containerId)) return false;
    const connection = connectionData(element);
    if (connection && (index.hiddenNodeIds.has(connection.fromNodeId) || index.hiddenNodeIds.has(connection.toNodeId))) return false;
    return true;
  });
}

/**
 * Merge edits from the projected Excalidraw scene back into the canonical scene.
 * @param {readonly any[]} canonical
 * @param {readonly any[]} projected
 */
export function mergeFoldedElements(canonical, projected) {
  const projectedWithoutBadges = projected.filter((element) => !foldBadge(element));
  const projectedById = new Map(projectedWithoutBadges.map((element) => [element.id, element]));
  const canonicalIds = new Set(canonical.map((element) => element.id));
  const basis = canonical
    .filter((element) => !foldBadge(element))
    .map((element) => projectedById.get(element.id) ?? element)
    .concat(projectedWithoutBadges.filter((element) => !canonicalIds.has(element.id)));
  const visibleIds = new Set(visibleFoldedElements(basis).map((element) => element.id));
  const result = [];
  const included = new Set();
  for (const element of basis) {
    if (!visibleIds.has(element.id)) {
      result.push(element);
      included.add(element.id);
      continue;
    }
    const replacement = projectedById.get(element.id);
    if (replacement) {
      result.push(replacement);
      included.add(element.id);
    }
  }
  for (const element of projectedWithoutBadges) {
    if (!included.has(element.id)) result.push(element);
  }
  return result;
}

/** @param {readonly any[]} elements @param {readonly string[]} nodeIds @param {boolean} collapsed */
export function setNodesCollapsed(elements, nodeIds, collapsed) {
  const wanted = new Set(nodeIds);
  return elements.map((element) => {
    const node = nodeData(element);
    if (!node || !wanted.has(node.nodeId) || node.collapsed === collapsed) return element;
    return { ...element, customData: { ...element.customData, mindmapNode: { ...node, collapsed } } };
  });
}

/** Expand every collapsed ancestor needed to make one node visible. @param {readonly any[]} elements @param {string} nodeId */
export function revealFoldedNode(elements, nodeId) {
  const { nodes } = foldingIndex(elements);
  const ancestors = [];
  const visited = new Set([nodeId]);
  let cursor = nodes.get(nodeId)?.parentNodeId;
  while (cursor && nodes.has(cursor) && !visited.has(cursor)) {
    visited.add(cursor);
    ancestors.push(cursor);
    cursor = nodes.get(cursor)?.parentNodeId;
  }
  return setNodesCollapsed(elements, ancestors, false);
}

/** @param {readonly any[]} elements */
export function nodeDepths(elements) {
  const { nodes } = foldingIndex(elements);
  const depths = new Map();
  for (const nodeId of nodes.keys()) {
    if (depths.has(nodeId)) continue;
    const path = [];
    let cursor = nodes.get(nodeId)?.parentNodeId;
    const visited = new Set([nodeId]);
    while (cursor && nodes.has(cursor) && !visited.has(cursor)) {
      if (depths.has(cursor)) break;
      visited.add(cursor);
      path.push(cursor);
      cursor = nodes.get(cursor)?.parentNodeId;
    }
    let depth = cursor && depths.has(cursor) ? depths.get(cursor) + 1 : 0;
    for (let index = path.length - 1; index >= 0; index -= 1) {
      depths.set(path[index], depth);
      depth += 1;
    }
    depths.set(nodeId, depth);
  }
  return depths;
}
