import { useEffect, useMemo, useState } from "react";
import type { OrderedExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import { getMindmapNode } from "./document";
import { internalLinkStatus, sanitiseNodeUrl } from "./node-content.mjs";
import { normaliseTags, tagName } from "./tasks.mjs";
import type { MindmapNodeData } from "./types";

type Content = Pick<MindmapNodeData, "notes" | "url" | "internalTargetNodeId" | "task" | "tags">;
type Props = { elements: readonly OrderedExcalidrawElement[]; nodeId: string; onApply: (content: Content) => void; onClose: () => void; announce: (message: string, state?: "saved" | "error") => void };

export default function NodeDetailsDialog({ elements, nodeId, onApply, onClose, announce }: Props) {
  const node = elements.map(getMindmapNode).find((item) => item?.nodeId === nodeId);
  const [notes, setNotes] = useState(node?.notes ?? "");
  const [url, setUrl] = useState(node?.url ?? "");
  const [target, setTarget] = useState(node?.internalTargetNodeId ?? "");
  const [isTask, setIsTask] = useState(Boolean(node?.task));
  const [taskState, setTaskState] = useState<"open" | "done">(node?.task?.state ?? "open");
  const [priority, setPriority] = useState(node?.task?.priority ? String(node.task.priority) : "");
  const [dueDate, setDueDate] = useState(node?.task?.dueDate ?? "");
  const [progress, setProgress] = useState(node?.task?.progress ?? 0);
  const [marker, setMarker] = useState(node?.task?.marker ?? "");
  const [autoProgress, setAutoProgress] = useState(Boolean(node?.task?.autoProgress));
  const [tags, setTags] = useState((node?.tags ?? []).map(tagName).join(", "));
  const firstTag = node?.tags?.[0];
  const [tagColor, setTagColor] = useState(typeof firstTag === "object" && firstTag.color ? firstTag.color : "#8b6f47");
  useEffect(() => {
    setNotes(node?.notes ?? ""); setUrl(node?.url ?? ""); setTarget(node?.internalTargetNodeId ?? "");
    setIsTask(Boolean(node?.task)); setTaskState(node?.task?.state ?? "open"); setPriority(node?.task?.priority ? String(node.task.priority) : "");
    setDueDate(node?.task?.dueDate ?? ""); setProgress(node?.task?.progress ?? 0); setMarker(node?.task?.marker ?? ""); setAutoProgress(Boolean(node?.task?.autoProgress));
    setTags((node?.tags ?? []).map(tagName).join(", "));
    const first = node?.tags?.[0];
    setTagColor(typeof first === "object" && first.color ? first.color : "#8b6f47");
  }, [nodeId, node]);
  const titles = useMemo(() => new Map(elements.flatMap((element) => element.type === "text" && element.containerId ? [[element.containerId, element.originalText || element.text] as const] : [])), [elements]);
  const targets = elements.flatMap((element) => { const data = getMindmapNode(element); return data && data.nodeId !== nodeId ? [{ id: data.nodeId, title: titles.get(element.id) ?? "Untitled node" }] : []; });
  const reusableTagValues = elements.flatMap((element) => getMindmapNode(element)?.tags ?? []);
  const reusableTags = [...new Set(reusableTagValues.map(tagName).filter(Boolean))].sort();
  const linkStatus = internalLinkStatus(elements, target);
  const save = () => {
    try {
      const numericPriority = priority ? Number(priority) as 1 | 2 | 3 | 4 : undefined;
      onApply({
        notes,
        url: sanitiseNodeUrl(url),
        internalTargetNodeId: target,
        tags: normaliseTags(tags, tagColor, reusableTagValues),
        task: isTask ? { state: taskState, priority: numericPriority, dueDate: dueDate || undefined, progress: taskState === "done" ? 100 : Math.max(0, Math.min(100, progress)), marker: marker || undefined, autoProgress } : undefined,
      });
    } catch (error) { announce(error instanceof Error ? error.message : String(error), "error"); }
  };
  const openUrl = () => { try { const safe = sanitiseNodeUrl(url); if (safe) window.open(safe, "_blank", "noopener,noreferrer"); } catch (error) { announce(error instanceof Error ? error.message : String(error), "error"); } };
  return <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
    <section className="details-dialog" role="dialog" aria-modal="true" aria-label="Node details, task and tags" onMouseDown={(event) => event.stopPropagation()}>
      <header><div><span className="eyebrow">NODE CONTENT</span><h2>Details, task and tags</h2></div><button type="button" onClick={onClose}>Close</button></header>
      <div className="details-columns">
        <div className="details-column">
          <label>Notes <textarea autoFocus value={notes} placeholder="Markdown notes kept separate from the title…" onChange={(event) => setNotes(event.target.value)} /></label>
          <label>Web or file URL <input value={url} placeholder="https://… or file:///…" onChange={(event) => setUrl(event.target.value)} /></label>
          <div className="details-link-actions"><button type="button" disabled={!url} onClick={openUrl}>Open link</button><button type="button" disabled={!url} onClick={() => void navigator.clipboard.writeText(url).then(() => announce("Link copied."))}>Copy</button><button type="button" disabled={!url} onClick={() => setUrl("")}>Remove</button></div>
          <label>Internal topic <select value={target} onChange={(event) => setTarget(event.target.value)}><option value="">No internal topic link</option>{targets.map((item) => <option value={item.id} key={item.id}>{item.title}</option>)}{linkStatus === "broken" ? <option value={target}>Missing topic: {target}</option> : null}</select></label>
          {linkStatus === "broken" ? <p className="broken-link" role="alert">The linked topic no longer exists. Choose a replacement or remove this link.</p> : null}
        </div>
        <div className="details-column task-editor">
          <label className="check-label"><input type="checkbox" checked={isTask} onChange={(event) => setIsTask(event.target.checked)} /> Make this node a task</label>
          <fieldset disabled={!isTask}><label>Status <select value={taskState} onChange={(event) => { const state = event.target.value as "open" | "done"; setTaskState(state); if (state === "done") setProgress(100); }}><option value="open">Open</option><option value="done">Completed</option></select></label><label>Priority <select value={priority} onChange={(event) => setPriority(event.target.value)}><option value="">No priority</option><option value="1">P1 · Urgent</option><option value="2">P2 · High</option><option value="3">P3 · Normal</option><option value="4">P4 · Low</option></select></label><label>Due date <input type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} /></label><label>Progress <span>{progress}%</span><input type="range" min="0" max="100" step="5" value={progress} onChange={(event) => setProgress(Number(event.target.value))} /></label><label>Marker <select value={marker} onChange={(event) => setMarker(event.target.value)}><option value="">No marker</option><option value="★">★ Star</option><option value="⚑">⚑ Flag</option><option value="⚡">⚡ Energy</option><option value="💡">💡 Idea</option></select></label><label className="check-label"><input type="checkbox" checked={autoProgress} onChange={(event) => setAutoProgress(event.target.checked)} /> Calculate from descendant tasks</label></fieldset>
          <label>Tags <input list="reusable-node-tags" value={tags} placeholder="Finance, RBI, Revision" onChange={(event) => setTags(event.target.value)} /><datalist id="reusable-node-tags">{reusableTags.map((tag) => <option key={tag} value={tag} />)}</datalist></label>
          <label>New tag colour <input type="color" value={tagColor} onChange={(event) => setTagColor(event.target.value)} /></label>
        </div>
      </div>
      <footer><span>External links open only when you press Open link. Task filters never change the map.</span><button type="button" className="primary-action" onClick={save}>Save details</button></footer>
    </section>
  </div>;
}
