export function sanitiseNodeUrl(value) {
  const input = String(value ?? "").trim();
  if (!input) return "";
  let parsed;
  try { parsed = new URL(input); } catch { throw new Error("Enter a complete http, https, or file URL."); }
  if (!new Set(["http:", "https:", "file:"]).has(parsed.protocol)) throw new Error(`Unsafe URL scheme rejected: ${parsed.protocol}`);
  return parsed.href;
}

export function internalLinkStatus(elements, targetNodeId) {
  if (!targetNodeId) return "none";
  return elements.some((element) => !element.isDeleted && element.customData?.mindmapNode?.nodeId === targetNodeId) ? "valid" : "broken";
}

export function nodeContentIndicators(node) {
  return [node?.notes ? "note" : "", node?.url ? "link" : "", node?.internalTargetNodeId ? "topic" : ""].filter(Boolean);
}
