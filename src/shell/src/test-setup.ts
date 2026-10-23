import "@testing-library/jest-dom/vitest";

// jsdom does not implement layout geometry, but ProseMirror uses Range geometry
// while Tiptap positions the BubbleMenu.
if (typeof Range !== "undefined" && !Range.prototype.getBoundingClientRect) {
  Range.prototype.getBoundingClientRect = () => new DOMRect();
}

if (typeof Range !== "undefined" && !Range.prototype.getClientRects) {
  Range.prototype.getClientRects = () => [] as unknown as DOMRectList;
}
