/**
 * Tests for createElnExtensions — the ELN editor extension factory.
 *
 * Covers: base extensions (StarterKit, Placeholder, Reference, etc.),
 * dynamic inclusion of registered tiptap-node blocks, and exclusion of
 * non-tiptap-node blocks.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { createElnExtensions } from "../createElnExtensions";
import { ModRegistry, BLOCK_TYPE_TIPTAP_NODE } from "../../../../../core/mod-system";
import LimsTable from "../../../../eln/blocks/LimsTable";

/** Safe cast through unknown for loose access to extension internals. */
function opts(e: unknown): Record<string, unknown> | undefined {
  return (e as Record<string, unknown>).options as
    | Record<string, unknown>
    | undefined;
}

describe("createElnExtensions", () => {
  beforeEach(() => {
    ModRegistry._reset();
  });

  // ── Base extensions (no blocks registered) ─────────────────────────────

  it("returns 6 base extensions when no blocks are registered", () => {
    const extensions = createElnExtensions();
    expect(extensions).toHaveLength(6);
  });

  it("configures StarterKit with heading levels [1, 2, 3]", () => {
    const extensions = createElnExtensions();
    const starterKit = extensions[0];
    const options = opts(starterKit);
    expect(options).toBeDefined();
    const heading = options?.heading as Record<string, unknown> | undefined;
    expect(heading?.levels).toEqual([1, 2, 3]);
  });

  it("configures Placeholder with the correct placeholder text", () => {
    const extensions = createElnExtensions();
    const placeholder = extensions[1];
    const options = opts(placeholder);
    expect(options?.placeholder).toBe("Start writing…");
  });

  it("includes Reference", () => {
    const extensions = createElnExtensions();
    const ref = extensions.find(
      (e: unknown) => (e as Record<string, unknown>).name === "reference",
    );
    expect(ref).toBeDefined();
  });

  it("includes MentionSuggestion", () => {
    const extensions = createElnExtensions();
    const refSuggestion = extensions.find(
      (e: unknown) =>
        (e as Record<string, unknown>).name === "mentionSuggestion",
    );
    expect(refSuggestion).toBeDefined();
  });

  it("includes SlashCommands", () => {
    const extensions = createElnExtensions();
    const slash = extensions.find(
      (e: unknown) =>
        (e as Record<string, unknown>).name === "slashCommands",
    );
    expect(slash).toBeDefined();
  });

  it("includes TableKit", () => {
    const extensions = createElnExtensions();
    const tableKit = extensions.find(
      (e: unknown) => (e as Record<string, unknown>).name === "tableKit",
    );
    expect(tableKit).toBeDefined();
  });

  // ── Dynamic block inclusion ────────────────────────────────────────────

  it("includes registered tiptap-node blocks as extensions", () => {
    ModRegistry.getInstance().registerBlock({
      id: "eln.table",
      label: "Table",
      description: "Insert a schema-backed LIMS table",
      icon: "📊",
      type: BLOCK_TYPE_TIPTAP_NODE,
      payload: { node: LimsTable },
    });

    const extensions = createElnExtensions();
    // 6 base + 1 registered block
    expect(extensions).toHaveLength(7);

    const limsTable = extensions.find(
      (e: unknown) => (e as Record<string, unknown>).name === "limsTable",
    );
    expect(limsTable).toBeDefined();
  });

  it("excludes blocks with non-tiptap-node type discriminator", () => {
    ModRegistry.getInstance().registerBlock({
      id: "test.other",
      label: "Other",
      description: "A non-tiptap block",
      icon: "🔧",
      type: "molbio-viewer",
      payload: {},
    });

    const extensions = createElnExtensions();
    // Still only 6 base extensions — non-tiptap block is excluded
    expect(extensions).toHaveLength(6);

    const other = extensions.find(
      (e: unknown) => (e as Record<string, unknown>).name === "other",
    );
    expect(other).toBeUndefined();
  });

  it("includes multiple registered tiptap-node blocks", () => {
    ModRegistry.getInstance().registerBlock({
      id: "eln.table",
      label: "Table",
      description: "Insert a schema-backed LIMS table",
      icon: "📊",
      type: BLOCK_TYPE_TIPTAP_NODE,
      payload: { node: LimsTable },
    });
    // Register a second block using the same node (just for testing)
    ModRegistry.getInstance().registerBlock({
      id: "test.image",
      label: "Image",
      description: "Insert an image",
      icon: "🖼️",
      type: BLOCK_TYPE_TIPTAP_NODE,
      payload: { node: LimsTable },
    });

    const extensions = createElnExtensions();
    // 6 base + 2 registered blocks
    expect(extensions).toHaveLength(8);
  });
});
