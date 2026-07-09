/**
 * React node view for the ``reference`` TipTap inline node.
 *
 * Thin TipTap wrapper — all resolution and rendering delegated to MentionBadge.
 */
import { NodeViewWrapper, type NodeViewProps } from "@tiptap/react";
import MentionBadge from "../../../../shared/components/MentionBadge";

function MentionNode({ node }: NodeViewProps) {
  const displayId = node.attrs.displayId as string;

  return (
    <NodeViewWrapper as="span">
      <MentionBadge displayId={displayId} clickable />
    </NodeViewWrapper>
  );
}

export default MentionNode;
