import type { TipTapDoc } from "./types";

const CORE_NODES = new Set([
  "doc", "text", "paragraph", "blockquote", "bulletList", "orderedList", "listItem",
  "heading", "codeBlock", "horizontalRule", "hardBreak", "image", "table", "tableRow",
  "tableCell", "tableHeader", "reference",
]);
const CORE_MARKS = new Set([
  "bold", "italic", "strike", "code", "link", "underline", "highlight", "subscript",
  "superscript", "textStyle", "color", "backgroundColor",
]);
const CORE_NODE_NAMES = [
  "blockquote", "bulletList", "codeBlock", "doc", "hardBreak", "heading", "horizontalRule",
  "listItem", "orderedList", "paragraph", "reference", "table", "tableCell", "tableHeader",
  "tableRow", "text",
];
const BLOCK_NODE = "elnPortableBlock";
const INLINE_NODE = "elnPortableInline";
const MARK = "elnPortableMark";
const ORIGINAL_ATTRS = "__elnPortableOriginalAttrs";

function clone<T>(value: T): T {
  return structuredClone(value);
}

/** Convert unsupported TipTap nodes and marks to opaque editor-safe wrappers. */
export function preparePortableDocument<T extends TipTapDoc>(
  document: T,
  registeredNodes: ReadonlySet<string>,
): T {
  const visit = (value: unknown, inlineContext = false): unknown => {
    if (Array.isArray(value)) return value.map((child) => visit(child, inlineContext));
    if (!value || typeof value !== "object") return value;
    const node = value as Record<string, unknown>;
    if (typeof node.type === "string" && node.type !== "text" && !CORE_NODES.has(node.type) && !registeredNodes.has(node.type)) {
      return {
        type: node.inline === true || node.isInline === true || inlineContext ? INLINE_NODE : BLOCK_NODE,
        attrs: { source: clone(node) },
      };
    }

    const next = { ...node };
    if (node.type !== "doc" && node.type !== "text") {
      const originalAttrs = node.attrs && typeof node.attrs === "object" ? node.attrs : {};
      next.attrs = { ...(originalAttrs as Record<string, unknown>), [ORIGINAL_ATTRS]: clone(originalAttrs) };
    }
    if (Array.isArray(node.content)) {
      const childIsInline = node.type === "paragraph" || node.type === "heading";
      next.content = node.content.map((child) => visit(child, childIsInline));
    }
    if (Array.isArray(node.marks)) {
      const portableMarks = node.marks.filter((mark) => {
        const type = (mark as Record<string, unknown>)?.type;
        return typeof type === "string" && !CORE_MARKS.has(type);
      });
      const knownMarks = node.marks.filter((mark) => {
        const type = (mark as Record<string, unknown>)?.type;
        return typeof type === "string" && CORE_MARKS.has(type);
      });
      next.marks = [
        ...knownMarks.map(clone),
        ...(portableMarks.length ? [{ type: MARK, attrs: { source: clone(portableMarks) } }] : []),
      ];
    }
    return next;
  };

  return visit(document) as T;
}

/** Restore opaque wrappers before ELN sends editor JSON to persistence. */
export function restorePortableDocument<T extends TipTapDoc>(document: T): T {
  const visit = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map((child) => visit(child));
    if (!value || typeof value !== "object") return value;
    const node = value as Record<string, unknown>;
    if (node.type === BLOCK_NODE || node.type === INLINE_NODE) {
      const source = (node.attrs as Record<string, unknown> | undefined)?.source;
      return clone(source);
    }
    const next = { ...node };
    if (node.attrs && typeof node.attrs === "object") {
      const attrs = node.attrs as Record<string, unknown>;
      if (Object.prototype.hasOwnProperty.call(attrs, ORIGINAL_ATTRS)) {
        const original = attrs[ORIGINAL_ATTRS];
        if (original && typeof original === "object" && !Array.isArray(original)) {
          const restored = clone(original) as Record<string, unknown>;
          for (const key of Object.keys(restored)) {
            if (Object.prototype.hasOwnProperty.call(attrs, key)) restored[key] = attrs[key];
          }
          if (Object.keys(restored).length) next.attrs = restored;
          else delete next.attrs;
        } else {
          const current = { ...attrs };
          delete current[ORIGINAL_ATTRS];
          if (Object.keys(current).length) next.attrs = current;
          else delete next.attrs;
        }
      } else if (Object.keys(attrs).length === 0) {
        delete next.attrs;
      }
    }
    if (Array.isArray(node.content)) next.content = node.content.map(visit);
    if (Array.isArray(node.marks)) {
      const marks: unknown[] = [];
      for (const mark of node.marks) {
        const candidate = mark as Record<string, unknown>;
        if (candidate.type === MARK) {
          const source = (candidate.attrs as Record<string, unknown> | undefined)?.source;
          if (Array.isArray(source)) marks.push(...clone(source));
        } else {
          marks.push(clone(mark));
        }
      }
      next.marks = marks;
    }
    return next;
  };
  return visit(document) as T;
}

export function portableAttributeNodeTypes(registeredNodes: ReadonlySet<string>): string[] {
  return [...new Set([...CORE_NODE_NAMES, ...registeredNodes])].filter(
    (name) => name !== "doc" && name !== "text" && name !== BLOCK_NODE && name !== INLINE_NODE,
  );
}
