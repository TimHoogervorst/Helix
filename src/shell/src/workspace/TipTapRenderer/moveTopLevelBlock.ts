import type { Editor } from "@tiptap/core";
import type { Node } from "@tiptap/pm/model";
import { Fragment } from "@tiptap/pm/model";
import type { BlockBinding } from "../../mod-system/types";

/** Moves one root document child in a single transaction. */
export function moveTopLevelBlock(
  editor: Editor,
  sourceIndex: number,
  targetIndex: number,
): boolean {
  return moveTopLevelBlocks(editor, [sourceIndex], targetIndex);
}

/** Moves selected root children in one transaction, preserving their order. */
export function moveTopLevelBlocks(
  editor: Editor,
  sourceIndices: number[],
  targetIndex: number,
): boolean {
  const { doc, tr } = editor.state;
  const indices = normalizedIndices(sourceIndices, doc.childCount);
  if (!indices.length || targetIndex < 0 || targetIndex > doc.childCount) return false;

  const selected = new Set(indices);
  const remaining = Array.from({ length: doc.childCount }, (_, index) => index)
    .filter((index) => !selected.has(index));
  const insertionIndex = targetIndex - indices.filter((index) => index < targetIndex).length;
  const order = [
    ...remaining.slice(0, insertionIndex),
    ...indices,
    ...remaining.slice(insertionIndex),
  ];
  if (order.every((index, position) => index === position)) return false;

  tr.replaceWith(0, doc.content.size, Fragment.fromArray(order.map((index) => doc.child(index))));
  editor.view.dispatch(tr);
  return true;
}

/** Deletes one root document child in a single transaction. */
export function deleteTopLevelBlock(editor: Editor, index: number): boolean {
  return deleteTopLevelBlocks(editor, [index]);
}

/** Deletes selected root children in one transaction. */
export function deleteTopLevelBlocks(editor: Editor, sourceIndices: number[]): boolean {
  const { doc, tr } = editor.state;
  const indices = normalizedIndices(sourceIndices, doc.childCount);
  if (!indices.length) return false;
  const selected = new Set(indices);
  tr.replaceWith(
    0,
    doc.content.size,
    Fragment.fromArray(Array.from({ length: doc.childCount }, (_, index) => doc.child(index)).filter((_, index) => !selected.has(index))),
  );
  editor.view.dispatch(tr);
  return true;
}

/** Duplicates one root document child immediately after itself. */
export function duplicateTopLevelBlock(
  editor: Editor,
  index: number,
  binding?: BlockBinding,
): boolean {
  return duplicateTopLevelBlocks(editor, [index], () => binding);
}

/** Duplicates selected root children in one transaction, in document order. */
export function duplicateTopLevelBlocks(
  editor: Editor,
  sourceIndices: number[],
  bindingForNode: (node: Node) => BlockBinding | undefined,
): boolean {
  const { doc, tr } = editor.state;
  const indices = normalizedIndices(sourceIndices, doc.childCount);
  if (!indices.length) return false;
  const selected = new Set(indices);
  const content: Node[] = [];
  for (let index = 0; index < doc.childCount; index += 1) {
    const node = doc.child(index);
    content.push(node);
    if (selected.has(index)) content.push(createDuplicateNode(node, bindingForNode(node)));
  }
  tr.replaceWith(0, doc.content.size, Fragment.fromArray(content));
  editor.view.dispatch(tr);
  return true;
}

function normalizedIndices(indices: number[], childCount: number): number[] {
  return [...new Set(indices)]
    .filter((index) => index >= 0 && index < childCount)
    .sort((left, right) => left - right);
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
