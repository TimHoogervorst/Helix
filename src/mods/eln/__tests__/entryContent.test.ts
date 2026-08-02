/**
 * Tests for entryContent — the pure document-codec module.
 *
 * Covers: splitFirstParagraph, prependDescription, collectDisplayIds,
 * and their null-tolerance edge cases.
 */
import { describe, it, expect } from "vitest";
import {
  splitFirstParagraph,
  prependDescription,
  collectDisplayIds,
} from "../entryContent";
import type { TipTapDoc } from "../types";

// ── splitFirstParagraph ───────────────────────────────────────────────────────

describe("splitFirstParagraph", () => {
  it("extracts description from the first paragraph", () => {
    const doc: TipTapDoc = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [{ type: "text", text: "A description here." }],
        },
        {
          type: "paragraph",
          content: [{ type: "text", text: "Body paragraph." }],
        },
      ],
    };
    const { description, body } = splitFirstParagraph(doc);
    expect(description).toBe("A description here.");
    expect(body).toEqual({
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [{ type: "text", text: "Body paragraph." }],
        },
      ],
    });
  });

  it("handles text with marks (bold, italic) in the first paragraph", () => {
    const doc: TipTapDoc = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            { type: "text", text: "Plain " },
            {
              type: "text",
              text: "bold",
              marks: [{ type: "bold" }],
            },
          ],
        },
        {
          type: "paragraph",
          content: [{ type: "text", text: "Body." }],
        },
      ],
    };
    const { description, body } = splitFirstParagraph(doc);
    expect(description).toBe("Plain bold");
    expect(body).toEqual({
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [{ type: "text", text: "Body." }],
        },
      ],
    });
  });

  it("returns empty description for heading-first document (no description)", () => {
    const doc: TipTapDoc = {
      type: "doc",
      content: [
        {
          type: "heading",
          attrs: { level: 1 },
          content: [{ type: "text", text: "Title" }],
        },
        {
          type: "paragraph",
          content: [{ type: "text", text: "Body." }],
        },
      ],
    };
    const { description, body } = splitFirstParagraph(doc);
    expect(description).toBe("");
    expect(body).toEqual(doc);
    expect(body).toBe(doc); // Same reference when unchanged
  });

  it("handles empty document", () => {
    const doc: TipTapDoc = { type: "doc", content: [] };
    const { description, body } = splitFirstParagraph(doc);
    expect(description).toBe("");
    expect(body).toEqual(doc);
  });

  it("handles document without content array", () => {
    const doc: TipTapDoc = { type: "doc" };
    const { description, body } = splitFirstParagraph(doc);
    expect(description).toBe("");
    expect(body).toEqual(doc);
  });

  it("handles paragraph without text content (no text children)", () => {
    const doc: TipTapDoc = {
      type: "doc",
      content: [
        { type: "paragraph" },
        { type: "paragraph", content: [{ type: "text", text: "Body." }] },
      ],
    };
    const { description, body } = splitFirstParagraph(doc);
    expect(description).toBe("");
    expect(body).toEqual({
      type: "doc",
      content: [
        { type: "paragraph", content: [{ type: "text", text: "Body." }] },
      ],
    });
  });

  it("handles null / undefined gracefully", () => {
    const { description, body } = splitFirstParagraph(null as unknown as TipTapDoc);
    expect(description).toBe("");
    expect(body).toBeNull();
  });
});

// ── prependDescription ────────────────────────────────────────────────────────

describe("prependDescription", () => {
  it("prepends a description paragraph to the document", () => {
    const doc: TipTapDoc = {
      type: "doc",
      content: [
        { type: "paragraph", content: [{ type: "text", text: "Body." }] },
      ],
    };
    const result = prependDescription(doc, "Description text");
    expect(result).toEqual({
      type: "doc",
      content: [
        { type: "paragraph", content: [{ type: "text", text: "Description text" }] },
        { type: "paragraph", content: [{ type: "text", text: "Body." }] },
      ],
    });
  });

  it("prepend-to-empty: prepends to a document with no content", () => {
    const doc: TipTapDoc = { type: "doc", content: [] };
    const result = prependDescription(doc, "Solo description");
    expect(result).toEqual({
      type: "doc",
      content: [
        { type: "paragraph", content: [{ type: "text", text: "Solo description" }] },
      ],
    });
  });

  it("prepends empty paragraph when description is empty string", () => {
    const doc: TipTapDoc = {
      type: "doc",
      content: [
        { type: "paragraph", content: [{ type: "text", text: "Body." }] },
      ],
    };
    const result = prependDescription(doc, "");
    expect(result).toEqual({
      type: "doc",
      content: [
        { type: "paragraph", content: [] },
        { type: "paragraph", content: [{ type: "text", text: "Body." }] },
      ],
    });
  });

  it("handles null document by treating as empty object", () => {
    const result = prependDescription(null as unknown as TipTapDoc, "Desc");
    expect(result).toEqual({
      content: [
        { type: "paragraph", content: [{ type: "text", text: "Desc" }] },
      ],
    });
  });
});

// ── split → prepend round-trip ───────────────────────────────────────────────

describe("split-first-paragraph ↔ prepend-description round-trip", () => {
  it("split then prepend returns identity-equivalent document", () => {
    const original: TipTapDoc = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [{ type: "text", text: "The description text" }],
        },
        {
          type: "paragraph",
          content: [{ type: "text", text: "First body paragraph." }],
        },
        {
          type: "paragraph",
          content: [{ type: "text", text: "Second body paragraph." }],
        },
      ],
    };
    const { description, body } = splitFirstParagraph(original);
    const reconstructed = prependDescription(body, description);
    expect(reconstructed).toEqual(original);
  });

  it("round-trip preserves document with only a description paragraph", () => {
    const original: TipTapDoc = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [{ type: "text", text: "Only description." }],
        },
      ],
    };
    const { description, body } = splitFirstParagraph(original);
    const reconstructed = prependDescription(body, description);
    expect(reconstructed).toEqual(original);
    expect(body.content).toEqual([]);
  });

  it("round-trip preserves document with description containing marks", () => {
    const original: TipTapDoc = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            { type: "text", text: "Part one " },
            {
              type: "text",
              text: "bold part",
              marks: [{ type: "bold" }],
            },
          ],
        },
        { type: "paragraph", content: [{ type: "text", text: "Body." }] },
      ],
    };
    const { description, body } = splitFirstParagraph(original);
    const reconstructed = prependDescription(body, description);
    // When we extract description text from a paragraph with marks, we lose
    // mark information because the description is a plain string.  The
    // round-trip is not lossless for styles — but the plain-text content
    // is preserved.
    expect(description).toBe("Part one bold part");
    // The reconstructed description paragraph will be a plain text node
    // instead of the original styled text.  That is the expected behavior:
    // the description textarea holds plain strings, not rich text.
    const reconstructedDesc = (reconstructed as Record<string, unknown>).content as Array<Record<string, unknown>>;
    expect(reconstructedDesc[0].type).toBe("paragraph");
    const reconstructedText = (reconstructedDesc[0] as Record<string, unknown>).content as Array<Record<string, unknown>>;
    expect(reconstructedText[0].text).toBe("Part one bold part");
    // Body paragraphs are preserved exactly
    const reconstructedBody = reconstructedDesc.slice(1);
    expect(reconstructedBody).toEqual(original.content.slice(1));
  });
});

// ── collectDisplayIds ─────────────────────────────────────────────────────────

describe("collectDisplayIds", () => {
  it("returns empty array for empty doc", () => {
    const ids = collectDisplayIds({ type: "doc", content: [] });
    expect(ids).toEqual([]);
  });

  it("collects displayId from reference nodes", () => {
    const doc: TipTapDoc = {
      type: "doc",
      content: [
        { type: "paragraph", content: [{ type: "text", text: "Hello" }] },
        { type: "reference", attrs: { displayId: "BLOOD1" } },
        { type: "reference", attrs: { displayId: "CELL2" } },
      ],
    };
    expect(collectDisplayIds(doc)).toEqual(["BLOOD1", "CELL2"]);
  });

  it("walks nested content recursively", () => {
    const doc: TipTapDoc = {
      type: "doc",
      content: [
        {
          type: "blockquote",
          content: [
            { type: "reference", attrs: { displayId: "NESTED_REF" } },
          ],
        },
      ],
    };
    expect(collectDisplayIds(doc)).toEqual(["NESTED_REF"]);
  });

  it("handles null / undefined gracefully", () => {
    const ids = collectDisplayIds(null as unknown as TipTapDoc);
    expect(ids).toEqual([]);
  });

  it("does not recurse into children of reference nodes", () => {
    const doc: TipTapDoc = {
      type: "doc",
      content: [
        {
          type: "reference",
          attrs: { displayId: "TOP_REF" },
          content: [
            {
              type: "reference",
              attrs: { displayId: "NESTED_REF" },
            },
          ],
        },
      ],
    };
    expect(collectDisplayIds(doc)).toEqual(["TOP_REF"]);
  });

  it("ignores reference nodes without displayId", () => {
    const doc: TipTapDoc = {
      type: "doc",
      content: [
        { type: "reference", attrs: {} },
        { type: "reference", attrs: { displayId: "VALID" } },
      ],
    };
    expect(collectDisplayIds(doc)).toEqual(["VALID"]);
  });
});
