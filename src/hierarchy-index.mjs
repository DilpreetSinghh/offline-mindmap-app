/**
 * Validate canonical mind-map parent metadata in linear time.
 * @param {Array<{nodeId: string, parentNodeId: string | null}>} records
 * @param {string} rootNodeId
 * @returns {{valid: boolean, errors: string[]}}
 */
export function validateHierarchyIndex(records, rootNodeId) {
  const errors = [];
  const parents = new Map();
  for (const record of records) {
    if (!record?.nodeId || parents.has(record.nodeId)) {
      errors.push(`Duplicate or missing node ID: ${record?.nodeId || "(unknown)"}.`);
      continue;
    }
    parents.set(record.nodeId, record.parentNodeId ?? null);
  }
  if (!parents.has(rootNodeId)) errors.push("Root mind-map node is missing.");
  for (const [nodeId, parentNodeId] of parents) {
    if (nodeId === rootNodeId && parentNodeId !== null) errors.push("The root node cannot have a parent.");
    if (nodeId !== rootNodeId && parentNodeId === null) errors.push(`Only the root node may have no parent: ${nodeId}.`);
    if (parentNodeId !== null && !parents.has(parentNodeId)) errors.push(`Node ${nodeId} refers to missing parent ${parentNodeId}.`);
  }

  const complete = new Set();
  for (const nodeId of parents.keys()) {
    if (complete.has(nodeId)) continue;
    const path = [];
    const positions = new Map();
    let cursor = nodeId;
    while (cursor !== null && parents.has(cursor) && !complete.has(cursor)) {
      const position = positions.get(cursor);
      if (position !== undefined) {
        errors.push(`Hierarchy cycle detected at ${cursor}.`);
        break;
      }
      positions.set(cursor, path.length);
      path.push(cursor);
      cursor = parents.get(cursor) ?? null;
    }
    for (const visited of path) complete.add(visited);
  }
  return { valid: errors.length === 0, errors };
}
