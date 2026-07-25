/**
 * Unit tests for dropdown colour derivation (frontend).
 */
import { describe, it, expect } from "vitest";
import {
  deriveDropdownColor,
  getPalette,
  getPaletteSize,
} from "../colourUtils";

describe("deriveDropdownColor", () => {
  it("returns an object with bg, fg, hex, and index", () => {
    const result = deriveDropdownColor("In Progress");
    expect(result).toHaveProperty("bg");
    expect(result).toHaveProperty("fg");
    expect(result).toHaveProperty("hex");
    expect(result).toHaveProperty("index");
  });

  it("returns an OKLCH background string", () => {
    const result = deriveDropdownColor("Test");
    expect(result.bg).toMatch(/^oklch\(/);
  });

  it("returns an OKLCH foreground string", () => {
    const result = deriveDropdownColor("Test");
    expect(result.fg).toMatch(/^oklch\(/);
  });

  it("returns an index within bounds", () => {
    for (const value of ["In Progress", "Finished", "Some Value", "A", "Z"]) {
      const result = deriveDropdownColor(value);
      expect(result.index).toBeGreaterThanOrEqual(0);
      expect(result.index).toBeLessThan(getPaletteSize());
    }
  });

  it("is deterministic — same value always gives the same colour", () => {
    for (const value of ["In Progress", "Finished", "alpha", "beta", "gamma"]) {
      const first = deriveDropdownColor(value);
      const second = deriveDropdownColor(value);
      expect(first.index).toBe(second.index);
      expect(first.bg).toBe(second.bg);
      expect(first.fg).toBe(second.fg);
    }
  });

  it("handles empty string", () => {
    const result = deriveDropdownColor("");
    expect(result.index).toBeGreaterThanOrEqual(0);
    expect(result.index).toBeLessThan(getPaletteSize());
  });

  it("handles unicode values", () => {
    const result = deriveDropdownColor("résumé");
    expect(result.index).toBeGreaterThanOrEqual(0);
    expect(result.index).toBeLessThan(getPaletteSize());
  });
});

describe("getPalette", () => {
  it("returns exactly palette_size entries", () => {
    const palette = getPalette();
    expect(palette).toHaveLength(getPaletteSize());
  });

  it("each entry has bg, fg, hex, and index", () => {
    for (const entry of getPalette()) {
      expect(entry).toHaveProperty("bg");
      expect(entry).toHaveProperty("fg");
      expect(entry).toHaveProperty("hex");
      expect(entry).toHaveProperty("index");
    }
  });

  it("indices are sequential 0..palette_size-1", () => {
    const indices = getPalette().map((e) => e.index);
    expect(indices).toEqual([...Array(getPaletteSize()).keys()]);
  });

  it("all background colours are unique", () => {
    const bgs = getPalette().map((e) => e.bg);
    expect(new Set(bgs).size).toBe(bgs.length);
  });
});

describe("getPaletteSize", () => {
  it("returns 12", () => {
    expect(getPaletteSize()).toBe(12);
  });
});
