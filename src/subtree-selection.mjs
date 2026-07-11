/**
 * Expand selected branch roots to all descendants while preserving root safety.
 * @param {Array<{nodeId: string, parentNodeId: string | null}>} nodes
 * @param {readonly string[]} selectedNodeIds
 * @param {string} rootNodeId
 */
export function expandSelectedBranches(nodes, selectedNodeIds, rootNodeId) {
  if (selectedNodeIds.includes(rootNodeId)) return { blockedByRoot: true, nodeIds: [] };
  const wanted = new Set(selectedNodeIds);
  let changed = true;
  while (changed) {
    changed = false;
    for (const node of nodes) {
      if (node.parentNodeId && wanted.has(node.parentNodeId) && !wanted.has(node.nodeId)) {
        wanted.add(node.nodeId);
        changed = true;
      }
    }
  }
  return { blockedByRoot: false, nodeIds: [...wanted] };
}
