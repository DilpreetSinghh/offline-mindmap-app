import { useEffect, useMemo, useRef, useState } from "react";
import type { OrderedExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import { getMindmapNode } from "./document";
import { formatBytes } from "./attachments.mjs";
import { searchBuiltInIcons } from "./icons.mjs";
import { internalLinkStatus, sanitiseNodeUrl } from "./node-content.mjs";
import { normaliseTags, tagName } from "./tasks.mjs";
import type { MindmapNodeData, NodeAttachmentMetadata } from "./types";

type Content = Pick<MindmapNodeData, "notes" | "url" | "internalTargetNodeId" | "task" | "tags" | "icon">;
type Props = {
  elements: readonly OrderedExcalidrawElement[];
  nodeId: string;
  attachmentLimitMb: number;
  onApply: (content: Content) => void;
  onAddImage: (file: File) => Promise<void>;
  onReplaceImage: (attachment: NodeAttachmentMetadata, file: File) => Promise<void>;
  onAddAttachment: (file: File) => Promise<void>;
  onRemoveAttachment: (attachment: NodeAttachmentMetadata) => void;
  onDownloadAttachment: (attachment: NodeAttachmentMetadata) => void;
  onClose: () => void;
  announce: (message: string, state?: "saved" | "error") => void;
};

export default function NodeDetailsDialog({
  elements,
  nodeId,
  attachmentLimitMb,
  onApply,
  onAddImage,
  onReplaceImage,
  onAddAttachment,
  onRemoveAttachment,
  onDownloadAttachment,
  onClose,
  announce,
}: Props) {
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
  const [icon, setIcon] = useState(node?.icon ?? "");
  const [iconQuery, setIconQuery] = useState("");
  const [pendingReplaceId, setPendingReplaceId] = useState("");
  const firstTag = node?.tags?.[0];
  const [tagColor, setTagColor] = useState(typeof firstTag === "object" && firstTag.color ? firstTag.color : "#8b6f47");
  const imageInputRef = useRef<HTMLInputElement | null>(null);
  const replaceImageInputRef = useRef<HTMLInputElement | null>(null);
  const attachmentInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    setNotes(node?.notes ?? "");
    setUrl(node?.url ?? "");
    setTarget(node?.internalTargetNodeId ?? "");
    setIsTask(Boolean(node?.task));
    setTaskState(node?.task?.state ?? "open");
    setPriority(node?.task?.priority ? String(node.task.priority) : "");
    setDueDate(node?.task?.dueDate ?? "");
    setProgress(node?.task?.progress ?? 0);
    setMarker(node?.task?.marker ?? "");
    setAutoProgress(Boolean(node?.task?.autoProgress));
    setTags((node?.tags ?? []).map(tagName).join(", "));
    setIcon(node?.icon ?? "");
    const first = node?.tags?.[0];
    setTagColor(typeof first === "object" && first.color ? first.color : "#8b6f47");
  // The editor deliberately keeps unsaved fields intact when attachment callbacks update this node.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodeId]);

  const titles = useMemo(() => new Map(elements.flatMap((element) => (
    element.type === "text" && element.containerId
      ? [[element.containerId, element.originalText || element.text] as const]
      : []
  ))), [elements]);
  const targets = elements.flatMap((element) => {
    const data = getMindmapNode(element);
    return data && data.nodeId !== nodeId ? [{ id: data.nodeId, title: titles.get(element.id) ?? "Untitled node" }] : [];
  });
  const reusableTagValues = elements.flatMap((element) => getMindmapNode(element)?.tags ?? []);
  const reusableTags = [...new Set(reusableTagValues.map(tagName).filter(Boolean))].sort();
  const icons = useMemo(() => searchBuiltInIcons(iconQuery).slice(0, 24), [iconQuery]);
  const attachments = node?.attachments ?? [];
  const linkStatus = internalLinkStatus(elements, target);

  const save = () => {
    try {
      const numericPriority = priority ? Number(priority) as 1 | 2 | 3 | 4 : undefined;
      onApply({
        notes,
        url: sanitiseNodeUrl(url),
        internalTargetNodeId: target,
        tags: normaliseTags(tags, tagColor, reusableTagValues),
        icon,
        task: isTask ? {
          state: taskState,
          priority: numericPriority,
          dueDate: dueDate || undefined,
          progress: taskState === "done" ? 100 : Math.max(0, Math.min(100, progress)),
          marker: marker || undefined,
          autoProgress,
        } : undefined,
      });
    } catch (error) {
      announce(error instanceof Error ? error.message : String(error), "error");
    }
  };

  const openUrl = () => {
    try {
      const safe = sanitiseNodeUrl(url);
      if (safe) window.open(safe, "_blank", "noopener,noreferrer");
    } catch (error) {
      announce(error instanceof Error ? error.message : String(error), "error");
    }
  };

  const addImage = async (file: File | undefined) => {
    if (!file) return;
    try { await onAddImage(file); } finally { if (imageInputRef.current) imageInputRef.current.value = ""; }
  };
  const replaceImage = async (file: File | undefined) => {
    const attachment = attachments.find((item) => item.id === pendingReplaceId);
    if (!file || !attachment) return;
    try { await onReplaceImage(attachment, file); } finally {
      setPendingReplaceId("");
      if (replaceImageInputRef.current) replaceImageInputRef.current.value = "";
    }
  };
  const addAttachment = async (file: File | undefined) => {
    if (!file) return;
    try { await onAddAttachment(file); } finally { if (attachmentInputRef.current) attachmentInputRef.current.value = ""; }
  };

  return <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
    <section className="details-dialog" role="dialog" aria-modal="true" aria-label="Node details, tasks and media" onMouseDown={(event) => event.stopPropagation()}>
      <header><div><span className="eyebrow">NODE CONTENT</span><h2>Details, tasks and media</h2></div><button type="button" onClick={onClose}>Close</button></header>
      <div className="details-columns">
        <div className="details-column">
          <label>Notes <textarea autoFocus value={notes} placeholder="Markdown notes kept separate from the title…" onChange={(event) => setNotes(event.target.value)} /></label>
          <label>Web or file URL <input value={url} placeholder="https://… or file:///…" onChange={(event) => setUrl(event.target.value)} /></label>
          <div className="details-link-actions"><button type="button" disabled={!url} onClick={openUrl}>Open link</button><button type="button" disabled={!url} onClick={() => void navigator.clipboard.writeText(url).then(() => announce("Link copied."))}>Copy</button><button type="button" disabled={!url} onClick={() => setUrl("")}>Remove</button></div>
          <label>Internal topic <select value={target} onChange={(event) => setTarget(event.target.value)}><option value="">No internal topic link</option>{targets.map((item) => <option value={item.id} key={item.id}>{item.title}</option>)}{linkStatus === "broken" ? <option value={target}>Missing topic: {target}</option> : null}</select></label>
          {linkStatus === "broken" ? <p className="broken-link" role="alert">The linked topic no longer exists. Choose a replacement or remove this link.</p> : null}

          <section className="icon-picker" aria-label="Offline icon picker">
            <div><strong>Offline icon</strong>{icon ? <button type="button" onClick={() => setIcon("")}>Remove {icon}</button> : null}</div>
            <input aria-label="Search offline icons" placeholder="Search icons…" value={iconQuery} onChange={(event) => setIconQuery(event.target.value)} />
            <div className="icon-grid">{icons.map((item) => <button type="button" aria-label={`${item.name} icon`} aria-pressed={icon === item.emoji} title={`${item.name} · ${item.keywords}`} key={item.emoji} onClick={() => setIcon(item.emoji)}>{item.emoji}</button>)}</div>
          </section>
        </div>

        <div className="details-column task-editor">
          <label className="check-label"><input type="checkbox" checked={isTask} onChange={(event) => setIsTask(event.target.checked)} /> Make this node a task</label>
          <fieldset disabled={!isTask}>
            <label>Status <select value={taskState} onChange={(event) => { const state = event.target.value as "open" | "done"; setTaskState(state); if (state === "done") setProgress(100); }}><option value="open">Open</option><option value="done">Completed</option></select></label>
            <label>Priority <select value={priority} onChange={(event) => setPriority(event.target.value)}><option value="">No priority</option><option value="1">P1 · Urgent</option><option value="2">P2 · High</option><option value="3">P3 · Normal</option><option value="4">P4 · Low</option></select></label>
            <label>Due date <input type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} /></label>
            <label>Progress <span>{progress}%</span><input type="range" min="0" max="100" step="5" value={progress} onChange={(event) => setProgress(Number(event.target.value))} /></label>
            <label>Marker <select value={marker} onChange={(event) => setMarker(event.target.value)}><option value="">No marker</option><option value="★">★ Star</option><option value="⚑">⚑ Flag</option><option value="⚡">⚡ Energy</option><option value="💡">💡 Idea</option></select></label>
            <label className="check-label"><input type="checkbox" checked={autoProgress} onChange={(event) => setAutoProgress(event.target.checked)} /> Calculate from descendant tasks</label>
          </fieldset>
          <label>Tags <input list="reusable-node-tags" value={tags} placeholder="Finance, RBI, Revision" onChange={(event) => setTags(event.target.value)} /><datalist id="reusable-node-tags">{reusableTags.map((tag) => <option key={tag} value={tag} />)}</datalist></label>
          <label>New tag colour <input type="color" value={tagColor} onChange={(event) => setTagColor(event.target.value)} /></label>

          <section className="attachment-editor" aria-label="Node attachments">
            <div><strong>Local media</strong><small>Maximum {attachmentLimitMb} MB per file</small></div>
            <div className="attachment-add-actions">
              <button type="button" onClick={() => imageInputRef.current?.click()}>Add node image</button>
              <button type="button" onClick={() => attachmentInputRef.current?.click()}>Attach file</button>
            </div>
            <input ref={imageInputRef} hidden type="file" accept="image/png,image/jpeg,image/gif,image/webp,image/avif,image/svg+xml" onChange={(event) => void addImage(event.target.files?.[0])} />
            <input ref={replaceImageInputRef} hidden type="file" accept="image/png,image/jpeg,image/gif,image/webp,image/avif,image/svg+xml" onChange={(event) => void replaceImage(event.target.files?.[0])} />
            <input ref={attachmentInputRef} hidden type="file" accept=".pdf,.txt,.md,.csv,.json,.zip,.epub,.doc,.docx,.xls,.xlsx,.ppt,.pptx,image/*" onChange={(event) => void addAttachment(event.target.files?.[0])} />
            <div className="attachment-list">
              {attachments.map((attachment) => <article key={attachment.id}>
                <span aria-hidden="true">{attachment.kind === "image" ? "🖼️" : "📎"}</span>
                <div><strong>{attachment.name}</strong><small>{attachment.mimeType || "Local file"} · {formatBytes(attachment.size)}</small></div>
                {attachment.kind === "image" ? <button type="button" onClick={() => { setPendingReplaceId(attachment.id); replaceImageInputRef.current?.click(); }}>Replace</button> : <button type="button" onClick={() => onDownloadAttachment(attachment)}>Download</button>}
                <button type="button" className="danger" onClick={() => onRemoveAttachment(attachment)}>Remove</button>
              </article>)}
              {!attachments.length ? <p>No local images or files attached to this node.</p> : null}
            </div>
          </section>
        </div>
      </div>
      <footer><span>Nothing is uploaded or fetched. External links open only when you press Open link; attached files download only after your action.</span><button type="button" className="primary-action" onClick={save}>Save details</button></footer>
    </section>
  </div>;
}
