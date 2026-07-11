import { foldingIndex, nodeDepths } from "./folding.mjs";

function nodeData(element) {
  const value = element.customData?.mindmapNode;
  return value && typeof value === "object" ? value : null;
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** @param {readonly any[]} elements */
export function buildSearchRecords(elements) {
  const textByContainer = new Map();
  for (const element of elements) {
    if (element.type === "text" && element.containerId) {
      textByContainer.set(element.containerId, element.originalText || element.text || "");
    }
  }
  const depths = nodeDepths(elements);
  const hidden = foldingIndex(elements).hiddenNodeIds;
  const records = [];
  for (const element of elements) {
    const node = nodeData(element);
    if (!node || element.isDeleted) continue;
    const title = textByContainer.get(element.id) ?? "Untitled node";
    const notes = String(node.notes ?? element.customData?.notes ?? "");
    const link = String(node.url ?? element.link ?? "");
    const tags = Array.isArray(node.tags) ? node.tags.map(String) : [];
    const taskState = String(node.task?.state ?? node.taskState ?? "none");
    records.push({
      nodeId: node.nodeId,
      elementId: element.id,
      title,
      searchText: [title, notes, link, ...tags].join("\n"),
      depth: depths.get(node.nodeId) ?? 0,
      hidden: hidden.has(node.nodeId),
      tags,
      taskState,
    });
  }
  return records;
}

/**
 * @param {ReturnType<typeof buildSearchRecords>} records
 * @param {string} query
 * @param {{caseSensitive?: boolean, wholeWord?: boolean, depth?: number | null, visibility?: string, tag?: string, taskState?: string}} [options]
 */
export function searchMindmap(records, query, options = {}) {
  const value = String(query ?? "");
  if (!value) return [];
  const expression = new RegExp(options.wholeWord ? `\\b${escapeRegExp(value)}\\b` : escapeRegExp(value), options.caseSensitive ? "" : "i");
  const tag = String(options.tag ?? "").trim().toLowerCase();
  return records.filter((record) => {
    if (options.depth !== null && options.depth !== undefined && record.depth !== options.depth) return false;
    if (options.visibility === "visible" && record.hidden) return false;
    if (options.visibility === "hidden" && !record.hidden) return false;
    if (tag && !record.tags.some((item) => item.toLowerCase().includes(tag))) return false;
    if (options.taskState && options.taskState !== "all" && record.taskState !== options.taskState) return false;
    return expression.test(record.searchText);
  });
}

/** @param {string} text @param {string} query @param {string} replacement @param {{caseSensitive?: boolean, wholeWord?: boolean, all?: boolean}} [options] */
export function replaceTextMatches(text, query, replacement, options = {}) {
  if (!query) return text;
  const flags = `${options.caseSensitive ? "" : "i"}${options.all ? "g" : ""}`;
  const expression = new RegExp(options.wholeWord ? `\\b${escapeRegExp(query)}\\b` : escapeRegExp(query), flags);
  return text.replace(expression, replacement);
}
