/**
 * Tests for shared formatting utilities.
 */
import { describe, it, expect } from "vitest";
import { formatDate } from "../format";

describe("formatDate", () => {
  it("formats a known ISO timestamp as a locale string", () => {
    const result = formatDate("2025-01-15T10:30:00Z");
    // toLocaleString() output varies by platform; just verify it's a non-empty
    // string that contains year-like digits.
    expect(result).toBeTruthy();
    expect(typeof result).toBe("string");
    expect(result).toMatch(/2025/);
  });

  it("formats a different date", () => {
    const result = formatDate("2024-06-01T00:00:00Z");
    expect(result).toMatch(/2024/);
  });

  it("returns a string for any valid ISO input", () => {
    const result = formatDate("2023-12-25T12:00:00Z");
    expect(typeof result).toBe("string");
    expect(result.length).toBeGreaterThan(0);
  });
});
