import { describe, it, expect, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import {
  topologicalSort,
  extractModDir,
  parseJsonManifest,
  ModLoader,
} from "../ModLoader";
import { ModRegistry } from "../ModRegistry";
import type { ModManifest } from "../types";

// ── Helpers ──────────────────────────────────────────────────────────────

interface ModModule {
  meta: ModManifest;
  register: () => void;
}

type DependsOnEntry = string | { id: string; version?: string };

function makeMod(
  id: string,
  dependsOn: DependsOnEntry[] = [],
  registerFn: () => void = () => {},
  overrides: Partial<ModManifest> = {},
): ModModule {
  return {
    meta: {
      id,
      displayName: id.toUpperCase(),
      version: "0.1.0",
      dependsOn,
      ...overrides,
    },
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

  it("handles object-form dependsOn entries with optional version", () => {
      const mods = [
        makeMod("a", [{ id: "b", version: ">=1.0" }]),
        makeMod("b", []),
      ];
      const result = topologicalSort(mods);
      // b must come before a
      expect(result[0].meta.id).toBe("b");
      expect(result[1].meta.id).toBe("a");
    });

    it("handles mixed string and object dependsOn entries", () => {
      const mods = [
        makeMod("a", ["b", { id: "c", version: ">=2.0" }]),
        makeMod("b", []),
        makeMod("c", []),
      ];
      const result = topologicalSort(mods);
      const ids = result.map((m) => m.meta.id);
      expect(ids.indexOf("b")).toBeLessThan(ids.indexOf("a"));
      expect(ids.indexOf("c")).toBeLessThan(ids.indexOf("a"));
    });

    it("throws on missing dependency in object-form dependsOn", () => {
      const mods = [makeMod("a", [{ id: "nonexistent" }])];
      expect(() => topologicalSort(mods)).toThrow(
        "Mod 'a' depends on 'nonexistent', which is not registered",
      );
    });

    it("accepts mod manifest without version", () => {
      const mod = makeMod("a", [], () => {}, { version: undefined });
      expect(mod.meta.version).toBeUndefined();
      expect(mod.meta.id).toBe("a");
    });

    it("accepts mod manifest with optional fields", () => {
      const mod = makeMod("a", [], () => {}, {
        version: undefined,
        coreVersion: ">=2.0",
        icon: "flask-conical",
        description: "A test mod for science",
      });
      expect(mod.meta.coreVersion).toBe(">=2.0");
      expect(mod.meta.icon).toBe("flask-conical");
      expect(mod.meta.description).toBe("A test mod for science");
    });
  });

  // ── extractModDir Tests ─────────────────────────────────────────────────

  describe("extractModDir", () => {
    it("extracts directory name from index.ts path", () => {
      expect(extractModDir("../../core-mods/eln/index.ts")).toBe("eln");
    });

    it("extracts directory name from modManifest.json path", () => {
      expect(
        extractModDir("../../core-mods/tags/modManifest.json"),
      ).toBe("tags");
    });

    it("extracts directory name with hyphens", () => {
      expect(
        extractModDir("../../core-mods/my-plugin/index.ts"),
      ).toBe("my-plugin");
    });

    it("handles deeply nested paths", () => {
      expect(
        extractModDir("/home/user/project/src/core-mods/lims/index.ts"),
      ).toBe("lims");
    });
  });

  // ── parseJsonManifest Tests ─────────────────────────────────────────────

  describe("parseJsonManifest", () => {
    const testPath = "../../core-mods/test-mod/modManifest.json";

    it("parses a minimal valid JSON manifest", () => {
      const manifest = parseJsonManifest(
        { id: "test-mod", displayName: "Test Mod" },
        testPath,
      );
      expect(manifest.id).toBe("test-mod");
      expect(manifest.displayName).toBe("Test Mod");
      expect(manifest.version).toBeUndefined();
      expect(manifest.dependsOn).toEqual([]);
      expect(manifest.coreVersion).toBeUndefined();
      expect(manifest.icon).toBeUndefined();
      expect(manifest.description).toBeUndefined();
    });

    it("parses a full JSON manifest with all optional fields", () => {
      const manifest = parseJsonManifest(
        {
          id: "full-mod",
          displayName: "Full Mod",
          version: "2.0.0",
          dependsOn: ["tags", "lims"],
          coreVersion: ">=1.0",
          icon: "flask-conical",
          description: "A complete test mod",
        },
        testPath,
      );
      expect(manifest.id).toBe("full-mod");
      expect(manifest.displayName).toBe("Full Mod");
      expect(manifest.version).toBe("2.0.0");
      expect(manifest.dependsOn).toEqual(["tags", "lims"]);
      expect(manifest.coreVersion).toBe(">=1.0");
      expect(manifest.icon).toBe("flask-conical");
      expect(manifest.description).toBe("A complete test mod");
    });

    it("parses object-form dependsOn entries", () => {
      const manifest = parseJsonManifest(
        {
          id: "test-mod",
          displayName: "Test Mod",
          dependsOn: [
            "tags",
            { id: "lims", version: ">=2.0" },
          ],
        },
        testPath,
      );
      expect(manifest.dependsOn).toEqual([
        "tags",
        { id: "lims", version: ">=2.0" },
      ]);
    });

    it("parses object-form dependsOn without version", () => {
      const manifest = parseJsonManifest(
        {
          id: "test-mod",
          displayName: "Test Mod",
          dependsOn: [{ id: "lims" }],
        },
        testPath,
      );
      expect(manifest.dependsOn).toEqual([{ id: "lims" }]);
    });

    it("defaults dependsOn to empty array when missing", () => {
      const manifest = parseJsonManifest(
        { id: "test-mod", displayName: "Test Mod" },
        testPath,
      );
      expect(manifest.dependsOn).toEqual([]);
    });

    it("skips undefined optional fields", () => {
      const manifest = parseJsonManifest(
        {
          id: "test-mod",
          displayName: "Test Mod",
          version: undefined,
          coreVersion: undefined,
          icon: undefined,
          description: undefined,
        },
        testPath,
      );
      expect(manifest.version).toBeUndefined();
      expect(manifest.coreVersion).toBeUndefined();
      expect(manifest.icon).toBeUndefined();
      expect(manifest.description).toBeUndefined();
    });

    // ── Error cases ────────────────────────────────────────────────────

    it("throws on missing id field", () => {
      expect(() =>
        parseJsonManifest(
          { displayName: "No Id" } as Record<string, unknown>,
          testPath,
        ),
      ).toThrow("missing required field 'id'");
    });

    it("throws on empty id string", () => {
      expect(() =>
        parseJsonManifest(
          { id: "", displayName: "Empty Id" },
          testPath,
        ),
      ).toThrow("missing required field 'id'");
    });

    it("throws on missing displayName field", () => {
      expect(() =>
        parseJsonManifest(
          { id: "test-mod" } as Record<string, unknown>,
          testPath,
        ),
      ).toThrow("missing required field 'displayName'");
    });

    it("throws on empty displayName string", () => {
      expect(() =>
        parseJsonManifest(
          { id: "test-mod", displayName: "" },
          testPath,
        ),
      ).toThrow("missing required field 'displayName'");
    });

    it("throws on non-array dependsOn", () => {
      expect(() =>
        parseJsonManifest(
          {
            id: "test-mod",
            displayName: "Test Mod",
            dependsOn: "not-an-array",
          },
          testPath,
        ),
      ).toThrow("'dependsOn' must be an array");
    });

    it("throws on invalid dependsOn entry type (number)", () => {
      expect(() =>
        parseJsonManifest(
          {
            id: "test-mod",
            displayName: "Test Mod",
            dependsOn: [42],
          },
          testPath,
        ),
      ).toThrow("must be a string or an {id, version?} object");
    });

    it("throws on object-form dependsOn entry without id", () => {
      expect(() =>
        parseJsonManifest(
          {
            id: "test-mod",
            displayName: "Test Mod",
            dependsOn: [{ version: ">=1.0" }],
          },
          testPath,
        ),
      ).toThrow("object must have a non-empty 'id' string");
    });

    it("throws on object-form dependsOn entry with empty id", () => {
      expect(() =>
        parseJsonManifest(
          {
            id: "test-mod",
            displayName: "Test Mod",
            dependsOn: [{ id: "" }],
          },
          testPath,
        ),
      ).toThrow("object must have a non-empty 'id' string");
    });

    it("throws on object-form dependsOn entry with non-string version", () => {
      expect(() =>
        parseJsonManifest(
          {
            id: "test-mod",
            displayName: "Test Mod",
            dependsOn: [{ id: "lims", version: 2 }],
          },
          testPath,
        ),
      ).toThrow("version must be a string");
    });

    it("throws on null dependsOn entry", () => {
      expect(() =>
        parseJsonManifest(
          {
            id: "test-mod",
            displayName: "Test Mod",
            dependsOn: [null],
          },
          testPath,
        ),
      ).toThrow("must be a string or an {id, version?} object");
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
