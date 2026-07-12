import { useEffect, useMemo, useState } from "react";
import type { OrderedExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import { getMindmapNode } from "./document";
import { internalLinkStatus, sanitiseNodeUrl } from "./node-content.mjs";
import type { MindmapNodeData } from "./types";

type Content = Pick<MindmapNodeData, "notes" | "url" | "internalTargetNodeId">;
type Props = { elements: readonly OrderedExcalidrawElement[]; nodeId: string; onApply: (content: Content) => void; onClose: () => void; announce: (message: string, state?: "saved" | "error") => void };

export default function NodeDetailsDialog({ elements, nodeId, onApply, onClose, announce }: Props) {
  const node = elements.map(getMindmapNode).find((item) => item?.nodeId === nodeId);
  const [notes, setNotes] = useState(node?.notes ?? "");
  const [url, setUrl] = useState(node?.url ?? "");
  const [target, setTarget] = useState(node?.internalTargetNodeId ?? "");
  useEffect(() => { setNotes(node?.notes ?? ""); setUrl(node?.url ?? ""); setTarget(node?.internalTargetNodeId ?? ""); }, [nodeId, node?.notes, node?.url, node?.internalTargetNodeId]);
  const titles = useMemo(() => new Map(elements.flatMap((element) => element.type === "text" && element.containerId ? [[element.containerId, element.originalText || element.text] as const] : [])), [elements]);
  const targets = elements.flatMap((element) => { const data = getMindmapNode(element); return data && data.nodeId !== nodeId ? [{ id: data.nodeId, title: titles.get(element.id) ?? "Untitled node" }] : []; });
  const linkStatus = internalLinkStatus(elements, target);
  const save = () => { try { onApply({ notes, url: sanitiseNodeUrl(url), internalTargetNodeId: target }); } catch (error) { announce(error instanceof Error ? error.message : String(error), "error"); } };
  const openUrl = () => { try { const safe = sanitiseNodeUrl(url); if (!safe) return; window.open(safe, "_blank", "noopener,noreferrer"); } catch (error) { announce(error instanceof Error ? error.message : String(error), "error"); } };
  return <div className="modal-backdrop" role="presentation" onMouseDown={onClose}><section className="details-dialog" role="dialog" aria-modal="true" aria-label="Node notes and links" onMouseDown={(event) => event.stopPropagation()}><header><div><span className="eyebrow">NODE CONTENT</span><h2>Notes and links</h2></div><button type="button" onClick={onClose}>Close</button></header><label>Notes <textarea autoFocus value={notes} placeholder="Markdown notes kept separate from the title…" onChange={(event) => setNotes(event.target.value)} /></label><label>Web or file URL <input value={url} placeholder="https://… or file:///…" onChange={(event) => setUrl(event.target.value)} /></label><div className="details-link-actions"><button type="button" disabled={!url} onClick={openUrl}>Open link</button><button type="button" disabled={!url} onClick={() => void navigator.clipboard.writeText(url).then(() => announce("Link copied."))}>Copy</button><button type="button" disabled={!url} onClick={() => setUrl("")}>Remove</button></div><label>Internal topic <select value={target} onChange={(event) => setTarget(event.target.value)}><option value="">No internal topic link</option>{targets.map((item) => <option value={item.id} key={item.id}>{item.title}</option>)}{linkStatus === "broken" ? <option value={target}>Missing topic: {target}</option> : null}</select></label>{linkStatus === "broken" ? <p className="broken-link" role="alert">The linked topic no longer exists. Choose a replacement or remove this link.</p> : null}<footer><span>External links open only when you press Open link.</span><button type="button" className="primary-action" onClick={save}>Save details</button></footer></section></div>;
}
