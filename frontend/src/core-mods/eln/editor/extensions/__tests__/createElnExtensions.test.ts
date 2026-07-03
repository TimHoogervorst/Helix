/**
 * Tests for createElnExtensions — the ELN editor extension factory.
 *
 * Covers: extension count, StarterKit heading config, Placeholder text.
 */
import { describe, it, expect } from "vitest";
import { createElnExtensions } from "../createElnExtensions";

/** Safe cast through unknown for loose access to extension internals. */
function opts(e: unknown): Record<string, unknown> | undefined {
  return (e as Record<string, unknown>).options as
    | Record<string, unknown>
    | undefined;
}

describe("createElnExtensions", () => {
  it("returns an array of 7 extensions", () => {
    const extensions = createElnExtensions();
    expect(extensions).toHaveLength(7);
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

  it("includes ReferenceSuggestion", () => {
    const extensions = createElnExtensions();
    const refSuggestion = extensions.find(
      (e: unknown) =>
        (e as Record<string, unknown>).name === "referenceSuggestion",
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

  it("includes LimsTable", () => {
    const extensions = createElnExtensions();
    const limsTable = extensions.find(
      (e: unknown) => (e as Record<string, unknown>).name === "limsTable",
    );
    expect(limsTable).toBeDefined();
  });
});
