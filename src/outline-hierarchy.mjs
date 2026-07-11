/** Apply one outline structural move without creating a second document model. @param {readonly any[]} records */
export function moveOutlineRecords(records, nodeId, move) {
  const next = records.map((record) => ({ ...record }));
  const target = next.find((record) => record.nodeId === nodeId);
  if (!target || target.parentNodeId === null) return null;
  const siblings = next.filter((record) => record.parentNodeId === target.parentNodeId)
    .sort((a, b) => a.siblingOrder - b.siblingOrder || a.nodeId.localeCompare(b.nodeId));
  const index = siblings.findIndex((record) => record.nodeId === nodeId);
  if (move === "up" || move === "down") {
    const other = siblings[index + (move === "up" ? -1 : 1)];
    if (!other) return null;
    [target.siblingOrder, other.siblingOrder] = [other.siblingOrder, target.siblingOrder];
  } else if (move === "indent") {
    if (index <= 0) return null;
    target.parentNodeId = siblings[index - 1].nodeId;
    target.siblingOrder = next.filter((record) => record.parentNodeId === target.parentNodeId).length;
  } else if (move === "outdent") {
    const parent = next.find((record) => record.nodeId === target.parentNodeId);
    if (!parent || parent.parentNodeId === null) return null;
    target.parentNodeId = parent.parentNodeId;
    target.siblingOrder = parent.siblingOrder + 0.5;
  } else return null;
  for (const parentId of new Set(next.map((record) => record.parentNodeId))) {
    next.filter((record) => record.parentNodeId === parentId)
      .sort((a, b) => a.siblingOrder - b.siblingOrder || a.nodeId.localeCompare(b.nodeId))
      .forEach((record, order) => { record.siblingOrder = order; });
  }
  return next;
}
