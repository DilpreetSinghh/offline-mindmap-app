import { foldingIndex, nodeDepths } from "./folding.mjs";
import { isTaskOverdue, tagName } from "./tasks.mjs";

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
    const tags = Array.isArray(node.tags) ? node.tags.map(tagName).filter(Boolean) : [];
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
      priority: node.task?.priority ?? null,
      dueDate: node.task?.dueDate ?? "",
      overdue: isTaskOverdue(node.task),
    });
  }
  return records;
}

/**
 * @param {ReturnType<typeof buildSearchRecords>} records
 * @param {string} query
 * @param {{caseSensitive?: boolean, wholeWord?: boolean, depth?: number | null, visibility?: string, tag?: string, taskState?: string, priority?: number | null, overdue?: boolean}} [options]
 */
export function searchMindmap(records, query, options = {}) {
  const value = String(query ?? "");
  const tag = String(options.tag ?? "").trim().toLowerCase();
  const hasFilter = options.depth !== null && options.depth !== undefined
    || (options.visibility && options.visibility !== "all")
    || Boolean(tag)
    || Boolean(options.taskState && options.taskState !== "all")
    || options.priority !== null && options.priority !== undefined
    || options.overdue === true;
  if (!value && !hasFilter) return [];
  const expression = value
    ? new RegExp(options.wholeWord ? `\\b${escapeRegExp(value)}\\b` : escapeRegExp(value), options.caseSensitive ? "" : "i")
    : null;
  return records.filter((record) => {
    if (options.depth !== null && options.depth !== undefined && record.depth !== options.depth) return false;
    if (options.visibility === "visible" && record.hidden) return false;
    if (options.visibility === "hidden" && !record.hidden) return false;
    if (tag && !record.tags.some((item) => item.toLowerCase().includes(tag))) return false;
    if (options.taskState && options.taskState !== "all" && record.taskState !== options.taskState) return false;
    if (options.priority !== null && options.priority !== undefined && record.priority !== options.priority) return false;
    if (options.overdue === true && !record.overdue) return false;
    return expression ? expression.test(record.searchText) : true;
  });
}

/** @param {string} text @param {string} query @param {string} replacement @param {{caseSensitive?: boolean, wholeWord?: boolean, all?: boolean}} [options] */
export function replaceTextMatches(text, query, replacement, options = {}) {
  if (!query) return text;
  const flags = `${options.caseSensitive ? "" : "i"}${options.all ? "g" : ""}`;
  const expression = new RegExp(options.wholeWord ? `\\b${escapeRegExp(query)}\\b` : escapeRegExp(query), flags);
  return text.replace(expression, replacement);
}
