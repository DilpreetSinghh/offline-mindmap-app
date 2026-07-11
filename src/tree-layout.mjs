export const TREE_HORIZONTAL_GAP = 110;
export const TREE_VERTICAL_GAP = 48;

/**
 * Produces a stable left-to-right tree layout while keeping the root centred.
 * Every sibling receives enough vertical space for its complete subtree, so
 * adding grandchildren pushes neighbouring branches out of the way.
 *
 * @param {Array<{nodeId:string,parentNodeId:string|null,siblingOrder:number,x:number,y:number,width:number,height:number}>} records
 * @param {string} rootNodeId
 * @param {{horizontalGap?:number,verticalGap?:number}} [options]
 */
export function calculateTreeLayout(records, rootNodeId, options = {}) {
  const horizontalGap = options.horizontalGap ?? TREE_HORIZONTAL_GAP;
  const verticalGap = options.verticalGap ?? TREE_VERTICAL_GAP;
  const byId = new Map(records.map((record) => [record.nodeId, record]));
  const root = byId.get(rootNodeId);
  if (!root) return new Map();

  const childrenByParent = new Map();
  for (const record of records) {
    if (!record.parentNodeId || !byId.has(record.parentNodeId)) continue;
    const siblings = childrenByParent.get(record.parentNodeId) ?? [];
    siblings.push(record);
    childrenByParent.set(record.parentNodeId, siblings);
  }
  for (const siblings of childrenByParent.values()) {
    siblings.sort((a, b) => a.siblingOrder - b.siblingOrder || a.nodeId.localeCompare(b.nodeId));
  }

  const spanById = new Map();
  const depthById = new Map();
  const visiting = new Set();
  const measure = (record, depth) => {
    if (visiting.has(record.nodeId)) return record.height;
    visiting.add(record.nodeId);
    depthById.set(record.nodeId, depth);
    const children = childrenByParent.get(record.nodeId) ?? [];
    let childrenSpan = 0;
    for (const child of children) childrenSpan += measure(child, depth + 1);
    if (children.length > 1) childrenSpan += verticalGap * (children.length - 1);
    const span = Math.max(record.height, childrenSpan);
    spanById.set(record.nodeId, span);
    visiting.delete(record.nodeId);
    return span;
  };
  const totalSpan = measure(root, 0);

  const maxWidthByDepth = new Map();
  for (const record of records) {
    const depth = depthById.get(record.nodeId);
    if (depth === undefined) continue;
    maxWidthByDepth.set(depth, Math.max(maxWidthByDepth.get(depth) ?? 0, record.width));
  }
  const xByDepth = new Map([[0, root.x]]);
  const deepest = Math.max(0, ...depthById.values());
  for (let depth = 1; depth <= deepest; depth += 1) {
    xByDepth.set(
      depth,
      (xByDepth.get(depth - 1) ?? root.x) + (maxWidthByDepth.get(depth - 1) ?? root.width) + horizontalGap,
    );
  }

  const positions = new Map();
  const place = (record, top) => {
    const span = spanById.get(record.nodeId) ?? record.height;
    const depth = depthById.get(record.nodeId) ?? 0;
    positions.set(record.nodeId, {
      x: xByDepth.get(depth) ?? record.x,
      y: top + (span - record.height) / 2,
      depth,
      span,
    });
    const children = childrenByParent.get(record.nodeId) ?? [];
    let childTop = top;
    for (const child of children) {
      place(child, childTop);
      childTop += (spanById.get(child.nodeId) ?? child.height) + verticalGap;
    }
  };
  place(root, root.y + root.height / 2 - totalSpan / 2);
  return positions;
}
