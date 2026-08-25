import type { Editor } from "@tiptap/core";
import type { Node } from "@tiptap/pm/model";
import type { BlockBinding } from "../../mod-system/types";

function topLevelPosition(doc: Editor["state"]["doc"], index: number): number {
  let position = 0;
  for (let current = 0; current < index; current += 1) {
    position += doc.child(current).nodeSize;
  }
  return position;
}

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

  const sourcePosition = topLevelPosition(doc, sourceIndex);
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

/** Deletes one root document child in a single transaction. */
export function deleteTopLevelBlock(editor: Editor, index: number): boolean {
  const { doc, tr } = editor.state;
  if (index < 0 || index >= doc.childCount) return false;

  const position = topLevelPosition(doc, index);
  tr.delete(position, position + doc.child(index).nodeSize);
  editor.view.dispatch(tr);
  return true;
}

/** Duplicates one root document child immediately after itself. */
export function duplicateTopLevelBlock(
  editor: Editor,
  index: number,
  binding?: BlockBinding,
): boolean {
  const { doc, tr } = editor.state;
  if (index < 0 || index >= doc.childCount) return false;

  const node = doc.child(index);
  const position = topLevelPosition(doc, index) + node.nodeSize;
  const duplicate = createDuplicateNode(node, binding);
  tr.insert(position, duplicate);
  editor.view.dispatch(tr);
  return true;
}

function createDuplicateNode(
  node: Node,
  binding?: BlockBinding,
) {
  if (!binding?.preserve?.length) return node;

  const currentState = binding.deserialize(String(node.attrs.content ?? "{}"));
  const preservedState = Object.fromEntries(
    binding.preserve
      .filter((field) => Object.prototype.hasOwnProperty.call(currentState, field))
      .map((field) => [field, currentState[field]]),
  );
  const state = { ...binding.defaultState, ...preservedState };

  return node.type.create(
    { ...node.attrs, content: binding.serialize(state) },
    node.content,
    node.marks,
  );
}
