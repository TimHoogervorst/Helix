/**
 * Tests for the Reference TipTap extension.
 *
 * Covers: input rule regex pattern, HTML parse/render round-trip,
 * and node creation via JSON.
 */
import { describe, it, expect } from "vitest";
import Reference from "../Reference";
import { createTestEditor } from "../../../../../shell/src/test/factories";

describe("Reference", () => {
  // ── Input rule regex ──────────────────────────────────────────────────

  describe("input rule pattern", () => {
    // The Reference extension uses: /#([A-Z]\d+) $/
    const INPUT_RULE_REGEX = /#([A-Z]\d+) $/;

    it("matches #E1 followed by space", () => {
      expect(INPUT_RULE_REGEX.test("#E1 ")).toBe(true);
    });

    it("matches #S42 followed by space", () => {
      expect(INPUT_RULE_REGEX.test("#S42 ")).toBe(true);
    });

    it("matches #E99999 followed by space", () => {
      expect(INPUT_RULE_REGEX.test("#E99999 ")).toBe(true);
    });

    it("captures the display ID from the match", () => {
      const match = "#E1 ".match(INPUT_RULE_REGEX);
      expect(match?.[1]).toBe("E1");
    });

    it("does NOT match #123 (digits only, no letters)", () => {
      expect(INPUT_RULE_REGEX.test("#123 ")).toBe(false);
    });

    it("does NOT match # followed by space only", () => {
      expect(INPUT_RULE_REGEX.test("# ")).toBe(false);
    });

    it("does NOT match without trailing space", () => {
      expect(INPUT_RULE_REGEX.test("#E1")).toBe(false);
    });

    it("does NOT match lowercase-only display ID", () => {
      expect(INPUT_RULE_REGEX.test("#e1 ")).toBe(false);
    });
  });

  // ── Node creation via JSON ────────────────────────────────────────────

  it("creates a reference node via setContent with JSON", () => {
    const editor = createTestEditor([Reference]);
    editor.commands.setContent({
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            { type: "text", text: "See " },
            { type: "reference", attrs: { displayId: "E1" } },
            { type: "text", text: " for details." },
          ],
        },
      ],
    });
    const doc = editor.getJSON();
    const para: any = doc.content?.[0];
    const refNode = para?.content?.find((n: any) => n.type === "reference");
    expect(refNode).toBeTruthy();
    expect(refNode?.attrs?.displayId).toBe("E1");
    editor.destroy();
  });

  it("creates a reference node with long numeric suffix", () => {
    const editor = createTestEditor([Reference]);
    editor.commands.setContent({
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            { type: "reference", attrs: { displayId: "E99999" } },
          ],
        },
      ],
    });
    const doc = editor.getJSON();
    const para: any = doc.content?.[0];
    const refNode = para?.content?.find((n: any) => n.type === "reference");
    expect(refNode).toBeTruthy();
    expect(refNode?.attrs?.displayId).toBe("E99999");
    editor.destroy();
  });

  // ── HTML parse/render round-trip ────────────────────────────────────

  it("parses reference from HTML data-display-id span", () => {
    const editor = createTestEditor([Reference],
      '<p>See <span data-display-id="E1"></span> for details.</p>',
    );
    const doc = editor.getJSON();
    const para: any = doc.content?.[0];
    const refNode = para?.content?.find((n: any) => n.type === "reference");
    expect(refNode?.attrs?.displayId).toBe("E1");
    editor.destroy();
  });

  it("HTML round-trip: render → parse preserves displayId", () => {
    const editor = createTestEditor([Reference]);
    // Set content with a reference node and render to HTML.
    editor.commands.setContent({
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            { type: "text", text: "See " },
            { type: "reference", attrs: { displayId: "E42" } },
            { type: "text", text: " for details." },
          ],
        },
      ],
    });
    const html = editor.getHTML();
    // Now parse the HTML back.
    editor.commands.setContent(html);
    const doc = editor.getJSON();
    const para: any = doc.content?.[0];
    const refNode = para?.content?.find((n: any) => n.type === "reference");
    expect(refNode?.attrs?.displayId).toBe("E42");
    editor.destroy();
  });
});
