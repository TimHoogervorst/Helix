/**
 * React node view for the ``reference`` TipTap inline node.
 *
 * Thin TipTap wrapper — all resolution and rendering delegated to ReferenceBadge.
 */
import { NodeViewWrapper, type NodeViewProps } from "@tiptap/react";
import ReferenceBadge from "../shared/ReferenceBadge";

function ReferenceNode({ node }: NodeViewProps) {
  const displayId = node.attrs.displayId as string;

  return (
    <NodeViewWrapper as="span">
      <ReferenceBadge displayId={displayId} clickable />
    </NodeViewWrapper>
  );
}

export default ReferenceNode;
