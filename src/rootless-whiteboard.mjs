/**
 * Convert an orphaned mind-map scene into an ordinary whiteboard without
 * removing any visible Excalidraw elements.
 *
 * @param {readonly any[]} elements
 * @param {string} rootNodeId
 * @returns {{elements: readonly any[], changed: boolean}}
 */
export function normaliseRootlessWhiteboard(elements, rootNodeId) {
  const activeMindmapNodes = elements.filter((element) => (
    !element.isDeleted
    && element.customData?.mindmapNode
    && typeof element.customData.mindmapNode === "object"
  ));
  const hasMindmapMetadata = elements.some((element) => (
    element.customData
    && (("mindmapNode" in element.customData) || ("mindmapConnection" in element.customData))
  ));
  if (!hasMindmapMetadata) return { elements, changed: false };
  if (activeMindmapNodes.some((element) => element.customData.mindmapNode.nodeId === rootNodeId)) {
    return { elements, changed: false };
  }

  let changed = false;
  const next = elements.map((element) => {
    const customData = element.customData;
    if (!customData || (!("mindmapNode" in customData) && !("mindmapConnection" in customData))) {
      return element;
    }
    changed = true;
    const { mindmapNode: _node, mindmapConnection: _connection, ...preserved } = customData;
    return {
      ...element,
      customData: Object.keys(preserved).length ? preserved : undefined,
    };
  });
  return { elements: next, changed };
}
