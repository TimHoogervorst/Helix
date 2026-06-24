/**
 * React node view for the ``reference`` TipTap inline node.
 *
 * Three visual states:
 *   loading  — plain ``#E1`` text
 *   resolved — light-blue pill: page icon + monospace id + title (clickable)
 *   broken   — red pill: warning icon + monospace id (hover tooltip)
 */
import { NodeViewWrapper, type NodeViewProps } from "@tiptap/react";
import { useReferenceContext } from "./ReferenceProvider";

function ReferenceNode({ node }: NodeViewProps) {
  const { resolutionMap } = useReferenceContext();
  const displayId = node.attrs.displayId as string;
  const resolved = resolutionMap.get(displayId);

  // ── Loading ──
  if (resolved === undefined) {
    return (
      <NodeViewWrapper as="span" className="reference-node">
        #{displayId}
      </NodeViewWrapper>
    );
  }

  // ── Broken ──
  if (resolved === null) {
    return (
      <NodeViewWrapper as="span" className="reference-node is-broken" title="Reference not found">
        <span className="ref-icon">⚠</span>
        <span className="ref-id">{displayId}</span>
      </NodeViewWrapper>
    );
  }

  // ── Resolved ──
  return (
    <NodeViewWrapper as="span" className="reference-node is-resolved">
      <a href={`/eln/${resolved.id}`} className="ref-link">
        <span className="ref-icon">📄</span>
        <span className="ref-id">{displayId}</span>
        <span className="ref-title">{resolved.title}</span>
      </a>
    </NodeViewWrapper>
  );
}

export default ReferenceNode;
