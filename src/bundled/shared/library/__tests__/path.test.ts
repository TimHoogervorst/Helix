import { describe, expect, it } from "vitest";
import { appendPath, parentPath, pathSegments, segmentPath } from "../path";

describe("Project-root library paths", () => {
  it("normalizes root and nested paths into segments", () => {
    expect(pathSegments("")).toEqual([]);
    expect(pathSegments("/Research/CRISPR")).toEqual(["Research", "CRISPR"]);
  });

  it("builds folder and breadcrumb paths", () => {
    expect(appendPath("", "Research")).toBe("/Research");
    expect(appendPath("/Research", "CRISPR")).toBe("/Research/CRISPR");
    expect(segmentPath(["Research", "CRISPR"], 0)).toBe("/Research");
  });

  it("returns the Project root when moving up from its first folder", () => {
    expect(parentPath("/Research/CRISPR")).toBe("/Research");
    expect(parentPath("/Research")).toBe("");
    expect(parentPath("")).toBe("");
  });
});
