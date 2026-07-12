const LIST_MARKER = /^(?:[-*+]\s+|\d+[.)]\s+)/;
const TASK_MARKER = /^\[([ xX])\]\s+/;
const TASK_METADATA = /(?:^|\s)@(priority|due|progress|marker)\(([^)]*)\)/gi;
const DONE_METADATA = /(?:^|\s)@done\b/gi;
const TAG_METADATA = /(?:^|\s)#([^\s#]+)/g;

function indentationWidth(value) {
  let width = 0;
  for (const character of value) width += character === "\t" ? 2 : 1;
  return width;
}

/**
 * Parse an indented Markdown/plain-text list without trusting its indentation
 * to use one particular number of spaces.
 *
 * @param {string} text
 * @returns {Array<{text: string, parentIndex: number | null, depth: number, task?: {state: "open" | "done", priority?: 1 | 2 | 3 | 4, dueDate?: string, progress?: number, marker?: string}, tags?: Array<{name: string, color: string}>}>}
 */
export function parseIndentedOutline(text) {
  const source = String(text ?? "").replace(/\r\n?/g, "\n");
  const records = [];
  const stack = [];
  for (const line of source.split("\n")) {
    if (!line.trim()) continue;
    const indentText = line.match(/^\s*/)?.[0] ?? "";
    const indent = indentationWidth(indentText);
    let title = line.slice(indentText.length).replace(LIST_MARKER, "").trim();
    const taskMarker = title.match(TASK_MARKER);
    let task = taskMarker ? { state: taskMarker[1].toLowerCase() === "x" ? "done" : "open" } : undefined;
    if (taskMarker) title = title.replace(TASK_MARKER, "");
    if (/(?:^|\s)@done\b/i.test(title)) {
      task = { ...(task ?? { state: "open" }), state: "done" };
      title = title.replace(DONE_METADATA, " ");
    }
    title = title.replace(TASK_METADATA, (_match, key, rawValue) => {
      task ??= { state: "open" };
      const value = String(rawValue).trim();
      if (key.toLowerCase() === "priority" && /^[1-4]$/.test(value)) task.priority = Number(value);
      if (key.toLowerCase() === "due" && /^\d{4}-\d{2}-\d{2}$/.test(value)) task.dueDate = value;
      if (key.toLowerCase() === "progress" && /^\d{1,3}$/.test(value)) task.progress = Math.max(0, Math.min(100, Number(value)));
      if (key.toLowerCase() === "marker" && value) task.marker = value;
      return " ";
    });
    const tagNames = [];
    title = title.replace(TAG_METADATA, (_match, name) => {
      const clean = String(name).trim();
      if (clean && !tagNames.some((tag) => tag.toLowerCase() === clean.toLowerCase())) tagNames.push(clean);
      return " ";
    }).replace(/\s+/g, " ").trim();
    if (!title) continue;
    while (stack.length && stack.at(-1).indent >= indent) stack.pop();
    const parentIndex = stack.length ? stack.at(-1).index : null;
    const depth = stack.length;
    const index = records.length;
    records.push({
      text: title,
      parentIndex,
      depth,
      ...(task ? { task } : {}),
      ...(tagNames.length ? { tags: tagNames.map((name) => ({ name, color: "#8b6f47" })) } : {}),
    });
    stack.push({ indent, index });
  }
  return records;
}

/** @param {string} text */
export function isOutlinePaste(text) {
  const nonEmpty = String(text ?? "").replace(/\r\n?/g, "\n").split("\n").filter((line) => line.trim());
  return nonEmpty.length > 1 || nonEmpty.some((line) => LIST_MARKER.test(line.trimStart()));
}
