import { describe, it, expect, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { topologicalSort, ModLoader } from "../ModLoader";
import { ModRegistry } from "../ModRegistry";
import type { ModManifest } from "../types";

// ── Helpers ──────────────────────────────────────────────────────────────

interface ModModule {
  meta: ModManifest;
  register: () => void;
}

function makeMod(
  id: string,
  dependsOn: string[] = [],
  registerFn: () => void = () => {},
): ModModule {
  return {
    meta: { id, displayName: id.toUpperCase(), version: "0.1.0", dependsOn },
    register: registerFn,
  };
}

function resetRegistry(): void {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (ModRegistry as any).instance = null;
}

// ── Topological Sort Tests ───────────────────────────────────────────────

describe("topologicalSort", () => {
  it("returns empty array for empty input", () => {
    expect(topologicalSort([])).toEqual([]);
  });

  it("returns single mod unchanged", () => {
    const mods = [makeMod("a")];
    expect(topologicalSort(mods)).toEqual(mods);
  });

  it("returns independent mods in any order (all have no dependencies)", () => {
    const mods = [makeMod("a"), makeMod("b"), makeMod("c")];
    const result = topologicalSort(mods);
    // All should be present (order among independents is stable)
    expect(result).toHaveLength(3);
    expect(result.map((m) => m.meta.id).sort()).toEqual(["a", "b", "c"]);
  });

  it("sorts linear dependency chain: c → b → a", () => {
    // a depends on b, b depends on c → order: c, b, a
    const mods = [
      makeMod("a", ["b"]),
      makeMod("b", ["c"]),
      makeMod("c", []),
    ];
    const result = topologicalSort(mods);
    expect(result[0].meta.id).toBe("c");
    expect(result[1].meta.id).toBe("b");
    expect(result[2].meta.id).toBe("a");
  });

  it("sorts diamond dependency: D first, then B/C, then A", () => {
    // A depends on B and C; B and C depend on D
    const mods = [
      makeMod("a", ["b", "c"]),
      makeMod("b", ["d"]),
      makeMod("c", ["d"]),
      makeMod("d", []),
    ];
    const result = topologicalSort(mods);
    // D must be first
    expect(result[0].meta.id).toBe("d");
    // A must be last
    expect(result[3].meta.id).toBe("a");
    // B and C are between D and A (order between them is stable but not
    // guaranteed by Kahn's — both are valid as long as they're after D
    // and before A)
    const middleIds = [result[1].meta.id, result[2].meta.id].sort();
    expect(middleIds).toEqual(["b", "c"]);
  });

  it("throws on missing dependency", () => {
    const mods = [makeMod("a", ["nonexistent"])];
    expect(() => topologicalSort(mods)).toThrow(
      "Mod 'a' depends on 'nonexistent', which is not registered",
    );
  });

  it("throws on circular dependency (A → B → A)", () => {
    const mods = [makeMod("a", ["b"]), makeMod("b", ["a"])];
    expect(() => topologicalSort(mods)).toThrow(
      "Circular dependency detected involving",
    );
  });

  it("throws on three-way circular dependency (A → B → C → A)", () => {
    const mods = [
      makeMod("a", ["b"]),
      makeMod("b", ["c"]),
      makeMod("c", ["a"]),
    ];
    expect(() => topologicalSort(mods)).toThrow(
      "Circular dependency detected involving",
    );
  });

  it("preserves insertion order for independent mods (stable sort)", () => {
    // Kahn's algorithm with a queue preserves FIFO order for same-level nodes
    const mods = [
      makeMod("a"),
      makeMod("b"),
      makeMod("c"),
    ];
    const result = topologicalSort(mods);
    expect(result[0].meta.id).toBe("a");
    expect(result[1].meta.id).toBe("b");
    expect(result[2].meta.id).toBe("c");
  });

  it("handles complex graph with multiple roots and leaves", () => {
    const mods = [
      makeMod("app", ["lims", "eln", "library"]),
      makeMod("lims", ["shared"]),
      makeMod("eln", ["shared", "lims"]),
      makeMod("library", ["shared"]),
      makeMod("shared", []),
    ];
    const result = topologicalSort(mods);
    const ids = result.map((m) => m.meta.id);

    // shared must come first
    expect(ids[0]).toBe("shared");
    // app must come last
    expect(ids[ids.length - 1]).toBe("app");

    // lims must come before eln (since eln depends on lims)
    expect(ids.indexOf("lims")).toBeLessThan(ids.indexOf("eln"));
    // lims must come before app
    expect(ids.indexOf("lims")).toBeLessThan(ids.indexOf("app"));
    // shared must come before everything else
    for (const id of ["lims", "eln", "library", "app"]) {
      expect(ids.indexOf("shared")).toBeLessThan(ids.indexOf(id));
    }
  });
});

// ── ModLoader Component Tests ────────────────────────────────────────────

describe("ModLoader", () => {
  beforeEach(() => {
    resetRegistry();
  });

  it("renders children when no mods are discovered (empty glob)", () => {
    render(
      <ModLoader>
        <div data-testid="child">Hello World</div>
      </ModLoader>,
    );
    expect(screen.getByTestId("child")).toBeInTheDocument();
    expect(screen.getByText("Hello World")).toBeInTheDocument();
  });

  it("renders children tree correctly", () => {
    render(
      <ModLoader>
        <div>
          <span data-testid="nested">nested content</span>
        </div>
      </ModLoader>,
    );
    expect(screen.getByTestId("nested")).toBeInTheDocument();
  });
});
