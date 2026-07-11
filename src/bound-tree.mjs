const NODE_SHAPES = new Set(["rectangle", "ellipse", "diamond"]);
const ARROW_ENDPOINT_TOLERANCE = 40;

function mindmapNode(element) {
  const value = element?.customData?.mindmapNode;
  return value && typeof value === "object" ? value : null;
}

function mindmapConnection(element) {
  const value = element?.customData?.mindmapConnection;
  return value && typeof value === "object" ? value : null;
}

function shapeAtArrowEndpoint(shapes, point, excludedId) {
  let closest = null;
  let closestScore = Number.POSITIVE_INFINITY;
  for (const shape of shapes) {
    if (shape.id === excludedId) continue;
    const left = Math.min(shape.x, shape.x + shape.width);
    const right = Math.max(shape.x, shape.x + shape.width);
    const top = Math.min(shape.y, shape.y + shape.height);
    const bottom = Math.max(shape.y, shape.y + shape.height);
    const dx = Math.max(left - point.x, 0, point.x - right);
    const dy = Math.max(top - point.y, 0, point.y - bottom);
    const edgeDistance = Math.hypot(dx, dy);
    if (edgeDistance > ARROW_ENDPOINT_TOLERANCE) continue;
    const centreDistance = Math.hypot(point.x - (left + right) / 2, point.y - (top + bottom) / 2);
    const score = edgeDistance * 10_000 + centreDistance;
    if (score < closestScore) {
      closest = shape;
      closestScore = score;
    }
  }
  return closest?.id ?? null;
}

function arrowEndpoint(element, index) {
  const point = element.points?.[index];
  return Array.isArray(point) ? { x: element.x + point[0], y: element.y + point[1] } : null;
}

/**
 * Infers a directed tree from ordinary Excalidraw shapes joined by bound
 * arrows. Existing mind-map metadata wins, while newly discovered shapes use
 * their stable element IDs as node IDs.
 */
export function inferBoundTree(elements, requestedRootNodeId) {
  const shapes = elements.filter((element) => !element.isDeleted && NODE_SHAPES.has(element.type));
  const shapeById = new Map(shapes.map((shape) => [shape.id, shape]));
  const outgoing = new Map();
  const incomingCount = new Map(shapes.map((shape) => [shape.id, 0]));
  for (const element of elements) {
    if (element.isDeleted || element.type !== "arrow") continue;
    if (mindmapConnection(element)?.role === "relationship") continue;
    const startPoint = arrowEndpoint(element, 0);
    const endPoint = arrowEndpoint(element, -1) ?? arrowEndpoint(element, (element.points?.length ?? 1) - 1);
    const boundFromId = element.startBinding?.elementId;
    const boundToId = element.endBinding?.elementId;
    const fromId = boundFromId && shapeById.has(boundFromId)
      ? boundFromId
      : startPoint ? shapeAtArrowEndpoint(shapes, startPoint) : null;
    const toId = boundToId && shapeById.has(boundToId)
      ? boundToId
      : endPoint ? shapeAtArrowEndpoint(shapes, endPoint, fromId) : null;
    if (!fromId || !toId || fromId === toId || !shapeById.has(fromId) || !shapeById.has(toId)) continue;
    const edges = outgoing.get(fromId) ?? [];
    edges.push({ arrowId: element.id, toId });
    outgoing.set(fromId, edges);
    incomingCount.set(toId, (incomingCount.get(toId) ?? 0) + 1);
  }
  for (const edges of outgoing.values()) {
    edges.sort((a, b) => {
      const first = shapeById.get(a.toId);
      const second = shapeById.get(b.toId);
      return first.y - second.y || first.x - second.x || a.toId.localeCompare(b.toId);
    });
  }

  const requestedRoot = requestedRootNodeId
    ? shapes.find((shape) => mindmapNode(shape)?.nodeId === requestedRootNodeId)
    : null;
  const semanticRoot = shapes.find((shape) => mindmapNode(shape)?.parentNodeId === null);
  const nativeRootCandidates = shapes.filter((shape) => outgoing.has(shape.id) && (incomingCount.get(shape.id) ?? 0) === 0);
  const fallbackCandidates = nativeRootCandidates.length
    ? nativeRootCandidates
    : shapes.filter((shape) => outgoing.has(shape.id));
  const reachableCount = (startId) => {
    const visited = new Set([startId]);
    const queue = [startId];
    for (let cursor = 0; cursor < queue.length; cursor += 1) {
      for (const edge of outgoing.get(queue[cursor]) ?? []) {
        if (visited.has(edge.toId)) continue;
        visited.add(edge.toId);
        queue.push(edge.toId);
      }
    }
    return visited.size;
  };
  fallbackCandidates.sort((a, b) => (
    reachableCount(b.id) - reachableCount(a.id)
    || a.x - b.x
    || a.y - b.y
    || a.id.localeCompare(b.id)
  ));
  const rootShape = requestedRoot && reachableCount(requestedRoot.id) > 1
    ? requestedRoot
    : semanticRoot && reachableCount(semanticRoot.id) > 1
      ? semanticRoot
      : fallbackCandidates[0] ?? requestedRoot ?? semanticRoot;
  if (!rootShape) return null;

  const parentElementId = new Map([[rootShape.id, null]]);
  const treeArrowIdByTarget = new Map();
  const queue = [rootShape.id];
  for (let cursor = 0; cursor < queue.length; cursor += 1) {
    const parentId = queue[cursor];
    for (const edge of outgoing.get(parentId) ?? []) {
      if (parentElementId.has(edge.toId)) continue;
      parentElementId.set(edge.toId, parentId);
      treeArrowIdByTarget.set(edge.toId, edge.arrowId);
      queue.push(edge.toId);
    }
  }

  const nodeIdByElementId = new Map();
  for (const elementId of parentElementId.keys()) {
    const shape = shapeById.get(elementId);
    nodeIdByElementId.set(elementId, mindmapNode(shape)?.nodeId ?? elementId);
  }

  const siblingOrderByElementId = new Map([[rootShape.id, 0]]);
  const childrenByParent = new Map();
  for (const [elementId, parentId] of parentElementId) {
    if (!parentId) continue;
    const children = childrenByParent.get(parentId) ?? [];
    children.push(elementId);
    childrenByParent.set(parentId, children);
  }
  for (const children of childrenByParent.values()) {
    children.sort((a, b) => {
      const first = shapeById.get(a);
      const second = shapeById.get(b);
      return first.y - second.y || first.x - second.x || a.localeCompare(b);
    });
    children.forEach((elementId, index) => siblingOrderByElementId.set(elementId, index));
  }

  const records = [...parentElementId.keys()].map((elementId) => {
    const shape = shapeById.get(elementId);
    const parentId = parentElementId.get(elementId);
    return {
      elementId,
      nodeId: nodeIdByElementId.get(elementId),
      parentNodeId: parentId ? nodeIdByElementId.get(parentId) : null,
      siblingOrder: siblingOrderByElementId.get(elementId) ?? 0,
      x: shape.x,
      y: shape.y,
      width: shape.width,
      height: shape.height,
    };
  });

  return {
    records,
    rootNodeId: nodeIdByElementId.get(rootShape.id),
    treeArrowIdByTarget,
    nodeIdByElementId,
    parentElementId,
  };
}
