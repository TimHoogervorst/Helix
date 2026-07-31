/**
 * entryContent — pure document-codec module for ELN entry descriptions.
 *
 * Implements the domain invariant that a Description is stored as the
 * first paragraph of the Rich-Text (TipTap) Document.  No React dependency.
 *
 * Owns: description ↔ document encoding, display-ID collection from the
 * TipTap JSON tree.
 *
 * Key behaviours:
 *   splitFirstParagraph — extracts the first paragraph's text as description,
 *                         returning the rest as body.  Non-paragraph first
 *                         children produce an empty description.
 *   prependDescription — inverse: wraps a description string in a paragraph
 *                         and prepends it to the document.
 *   collectDisplayIds — walks the full TipTap tree and collects all
 *                         ``displayId`` values from ``reference`` nodes.
 *   Null tolerance — all functions handle null / malformed input gracefully.
 */

import type { TipTapDoc } from "./types";

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Recursively extract all plain text from a TipTap JSON node.
 * Handles marks (bold, italic, etc.) by traversing into children.
 */
function extractText(node: unknown): string {
  if (!node || typeof node !== "object") return "";
  const n = node as Record<string, unknown>;
  if (n.type === "text" && typeof n.text === "string") {
    return n.text;
  }
  const children = n.content;
  if (Array.isArray(children)) {
    return children.map((c) => extractText(c)).join("");
  }
  return "";
}

/**
 * Split a TipTap document into its first paragraph (the description) and
 * the rest of the document (everything after the first paragraph).
 *
 * Returns the description text and a new document with remaining content.
 * If the first node is not a paragraph, description is empty and doc is unchanged.
 */
export function splitFirstParagraph(
  doc: TipTapDoc,
): { description: string; body: TipTapDoc } {
  if (!doc || typeof doc !== "object") {
    return { description: "", body: doc };
  }
  const d = doc as Record<string, unknown>;
  const content = d.content;
  if (!Array.isArray(content) || content.length === 0) {
    return { description: "", body: doc };
  }
  const first = content[0] as Record<string, unknown> | undefined;
  if (first && first.type === "paragraph") {
    const description = extractText(first);
    const body = { ...d, content: content.slice(1) };
    return { description, body };
  }
  return { description: "", body: doc };
}

/**
 * Prepend a description paragraph to a TipTap document.
 */
export function prependDescription(
  doc: TipTapDoc,
  description: string,
): TipTapDoc {
  const para = {
    type: "paragraph",
    content: description
      ? [{ type: "text", text: description }]
      : [],
  };
  if (!doc || typeof doc !== "object") {
    return { content: [para] };
  }
  const d = doc as Record<string, unknown>;
  const content = Array.isArray(d.content) ? d.content : [];
  return { ...d, content: [para, ...content] };
}

/**
 * Walk the TipTap JSON tree and collect all ``displayId`` values
 * from ``reference`` nodes.
 */
export function collectDisplayIds(doc: TipTapDoc): string[] {
  const ids: string[] = [];

  function walk(node: unknown) {
    if (!node || typeof node !== "object") return;
    const n = node as Record<string, unknown>;

    if (n.type === "reference") {
      const attrs = n.attrs as Record<string, unknown> | undefined;
      const displayId = attrs?.displayId;
      if (typeof displayId === "string") {
        ids.push(displayId);
      }
      return; // reference nodes are atomic
    }

    const content = n.content;
    if (Array.isArray(content)) {
      for (const child of content) {
        walk(child);
      }
    }
  }

  walk(doc);
  return ids;
}
