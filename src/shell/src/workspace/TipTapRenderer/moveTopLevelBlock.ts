import type { Editor } from "@tiptap/core";

/** Moves one root document child in a single transaction. */
export function moveTopLevelBlock(
  editor: Editor,
  sourceIndex: number,
  targetIndex: number,
): boolean {
  const { doc, tr } = editor.state;
  if (
    sourceIndex < 0 ||
    sourceIndex >= doc.childCount ||
    targetIndex < 0 ||
    targetIndex > doc.childCount
  ) {
    return false;
  }

  const node = doc.child(sourceIndex);
  if (targetIndex === sourceIndex || targetIndex === sourceIndex + 1) return false;

  let sourcePosition = 0;
  for (let index = 0; index < sourceIndex; index += 1) {
    sourcePosition += doc.child(index).nodeSize;
  }
  tr.delete(sourcePosition, sourcePosition + node.nodeSize);

  const insertionIndex = targetIndex > sourceIndex ? targetIndex - 1 : targetIndex;
  let insertionPosition = 0;
  let remainingIndex = 0;
  for (let index = 0; index < doc.childCount; index += 1) {
    if (index === sourceIndex) continue;
    if (remainingIndex === insertionIndex) break;
    insertionPosition += doc.child(index).nodeSize;
    remainingIndex += 1;
  }

  tr.insert(insertionPosition, node);
  editor.view.dispatch(tr);
  return true;
}
