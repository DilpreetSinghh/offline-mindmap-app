const DEFAULT_TAG_COLOR = "#8b6f47";
const HEX_COLOR = /^#[0-9a-f]{6}$/i;

export function tagName(tag) { return typeof tag === "string" ? tag : String(tag?.name ?? ""); }
export function tagColor(tag) {
  const value = typeof tag === "object" && tag?.color ? String(tag.color) : DEFAULT_TAG_COLOR;
  return HEX_COLOR.test(value) ? value : DEFAULT_TAG_COLOR;
}

export function normaliseTags(value, color = DEFAULT_TAG_COLOR, reusable = []) {
  const seen = new Set();
  const reusableColors = new Map(reusable.map((tag) => [tagName(tag).toLowerCase(), tagColor(tag)]));
  const fallbackColor = HEX_COLOR.test(color) ? color : DEFAULT_TAG_COLOR;
  return String(value ?? "").split(",").map((item) => item.trim().replace(/^#/, "")).filter((name) => {
    const key = name.toLowerCase();
    if (!name || seen.has(key)) return false;
    seen.add(key); return true;
  }).map((name) => ({ name, color: reusableColors.get(name.toLowerCase()) ?? fallbackColor }));
}

export function isTaskOverdue(task, today = new Date().toISOString().slice(0, 10)) {
  return Boolean(task?.state === "open" && task.dueDate && task.dueDate < today);
}

/** @param {readonly any[]} records */
export function propagateTaskRecords(records) {
  const next = records.map((record) => ({ ...record, task: record.task ? { ...record.task } : undefined }));
  const byId = new Map(next.map((record) => [record.nodeId, record]));
  const children = new Map();
  for (const record of next) {
    if (record.parentNodeId == null) continue;
    children.set(record.parentNodeId, [...(children.get(record.parentNodeId) ?? []), record]);
  }
  const depthCache = new Map();
  const depth = (record) => {
    if (depthCache.has(record.nodeId)) return depthCache.get(record.nodeId);
    let count = 0;
    let cursor = record;
    const seen = new Set();
    while (cursor?.parentNodeId && !seen.has(cursor.parentNodeId)) {
      seen.add(cursor.parentNodeId);
      count += 1;
      cursor = byId.get(cursor.parentNodeId);
    }
    depthCache.set(record.nodeId, count);
    return count;
  };
  const nearestTaskDescendants = (nodeId) => {
    const found = [];
    const queue = [...(children.get(nodeId) ?? [])];
    while (queue.length) {
      const child = queue.shift();
      if (child.task) found.push(child);
      else queue.push(...(children.get(child.nodeId) ?? []));
    }
    return found;
  };
  for (const record of [...next].sort((a, b) => depth(b) - depth(a))) {
    if (!record.task?.autoProgress) continue;
    const childTasks = nearestTaskDescendants(record.nodeId);
    if (!childTasks.length) continue;
    const progress = Math.round(childTasks.reduce((sum, child) => sum + (child.task.state === "done" ? 100 : Number(child.task.progress ?? 0)), 0) / childTasks.length);
    record.task.progress = progress;
    record.task.state = progress === 100 ? "done" : "open";
  }
  return next;
}

export function taskIndicator(node) {
  if (!node?.icon && !node?.task && !node?.tags?.length) return "";
  const task = node.task;
  const parts = [node.icon ?? ""];
  if (task) parts.push(task.state === "done" ? "☑" : "☐", task.priority ? `P${task.priority}` : "", task.progress != null ? `${task.progress}%` : "", task.marker ?? "", isTaskOverdue(task) ? "OVERDUE" : "");
  parts.push(...(node.tags ?? []).map((tag) => `#${tagName(tag)}`));
  return parts.filter(Boolean).join(" ");
}

export function taskMarkdown(title, node) {
  if (!node?.task) return "";
  const task = node.task;
  const suffix = [task.priority ? `@priority(${task.priority})` : "", task.dueDate ? `@due(${task.dueDate})` : "", task.progress != null ? `@progress(${task.progress})` : "", task.marker ? `@marker(${task.marker})` : "", ...(node.tags ?? []).map((tag) => `#${tagName(tag)}`)].filter(Boolean).join(" ");
  return `- [${task.state === "done" ? "x" : " "}] ${title}${suffix ? ` ${suffix}` : ""}`;
}
