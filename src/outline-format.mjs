const LIST_MARKER = /^(?:[-*+]\s+|\d+[.)]\s+)/;

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
 * @returns {Array<{text: string, parentIndex: number | null, depth: number}>}
 */
export function parseIndentedOutline(text) {
  const source = String(text ?? "").replace(/\r\n?/g, "\n");
  const records = [];
  const stack = [];
  for (const line of source.split("\n")) {
    if (!line.trim()) continue;
    const indentText = line.match(/^\s*/)?.[0] ?? "";
    const indent = indentationWidth(indentText);
    const title = line.slice(indentText.length).replace(LIST_MARKER, "").replace(/^\[[ xX]\]\s+/, "").trim();
    if (!title) continue;
    while (stack.length && stack.at(-1).indent >= indent) stack.pop();
    const parentIndex = stack.length ? stack.at(-1).index : null;
    const depth = stack.length;
    const index = records.length;
    records.push({ text: title, parentIndex, depth });
    stack.push({ indent, index });
  }
  return records;
}

/** @param {string} text */
export function isOutlinePaste(text) {
  const nonEmpty = String(text ?? "").replace(/\r\n?/g, "\n").split("\n").filter((line) => line.trim());
  return nonEmpty.length > 1 || nonEmpty.some((line) => LIST_MARKER.test(line.trimStart()));
}
