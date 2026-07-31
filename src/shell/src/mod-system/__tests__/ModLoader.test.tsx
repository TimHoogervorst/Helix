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
  name: string,
  dependsOn: DependsOnEntry[] = [],
  registerFn: () => void = () => {},
  overrides: Partial<ModManifest> = {},
): ModModule {
  return {
    meta: {
      vendor: "helix",
      name,
      displayName: name.toUpperCase(),
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
    expect(result.map((m) => m.meta.name).sort()).toEqual(["a", "b", "c"]);
  });

  it("sorts linear dependency chain: c → b → a", () => {
    // a depends on b, b depends on c → order: c, b, a
    const mods = [
      makeMod("a", ["helix.b"]),
      makeMod("b", ["helix.c"]),
      makeMod("c", []),
    ];
    const result = topologicalSort(mods);
    expect(result[0].meta.name).toBe("c");
    expect(result[1].meta.name).toBe("b");
    expect(result[2].meta.name).toBe("a");
  });

  it("sorts diamond dependency: D first, then B/C, then A", () => {
    // A depends on B and C; B and C depend on D
    const mods = [
      makeMod("a", ["helix.b", "helix.c"]),
      makeMod("b", ["helix.d"]),
      makeMod("c", ["helix.d"]),
      makeMod("d", []),
    ];
    const result = topologicalSort(mods);
    // D must be first
    expect(result[0].meta.name).toBe("d");
    // A must be last
    expect(result[3].meta.name).toBe("a");
    // B and C are between D and A (order between them is stable but not
    // guaranteed by Kahn's — both are valid as long as they're after D
    // and before A)
    const middleIds = [result[1].meta.name, result[2].meta.name].sort();
    expect(middleIds).toEqual(["b", "c"]);
  });

  it("throws on missing dependency", () => {
    const mods = [makeMod("a", ["helix.nonexistent"])];
    expect(() => topologicalSort(mods)).toThrow(
      "Mod 'helix.a' depends on 'helix.nonexistent', which is not registered",
    );
  });

  it("throws on circular dependency (A → B → A)", () => {
    const mods = [makeMod("a", ["helix.b"]), makeMod("b", ["helix.a"])];
    expect(() => topologicalSort(mods)).toThrow(
      "Circular dependency detected involving",
    );
  });

  it("throws on three-way circular dependency (A → B → C → A)", () => {
    const mods = [
      makeMod("a", ["helix.b"]),
      makeMod("b", ["helix.c"]),
      makeMod("c", ["helix.a"]),
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
    expect(result[0].meta.name).toBe("a");
    expect(result[1].meta.name).toBe("b");
    expect(result[2].meta.name).toBe("c");
  });

  it("handles complex graph with multiple roots and leaves", () => {
    const mods = [
      makeMod("app", ["helix.lims", "helix.eln", "helix.library"]),
      makeMod("lims", ["helix.shared"]),
      makeMod("eln", ["helix.shared", "helix.lims"]),
      makeMod("library", ["helix.shared"]),
      makeMod("shared", []),
    ];
    const result = topologicalSort(mods);
    const ids = result.map((m) => m.meta.name);

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
        makeMod("a", [{ id: "helix.b", version: ">=1.0" }]),
        makeMod("b", []),
      ];
      const result = topologicalSort(mods);
      // b must come before a
      expect(result[0].meta.name).toBe("b");
      expect(result[1].meta.name).toBe("a");
    });

    it("handles mixed string and object dependsOn entries", () => {
      const mods = [
        makeMod("a", ["helix.b", { id: "helix.c", version: ">=2.0" }]),
        makeMod("b", []),
        makeMod("c", []),
      ];
      const result = topologicalSort(mods);
      const ids = result.map((m) => m.meta.name);
      expect(ids.indexOf("b")).toBeLessThan(ids.indexOf("a"));
      expect(ids.indexOf("c")).toBeLessThan(ids.indexOf("a"));
    });

    it("throws on missing dependency in object-form dependsOn", () => {
      const mods = [makeMod("a", [{ id: "helix.nonexistent" }])];
      expect(() => topologicalSort(mods)).toThrow(
        "Mod 'helix.a' depends on 'helix.nonexistent', which is not registered",
      );
    });

    it("accepts mod manifest without version", () => {
      const mod = makeMod("a", [], () => {}, { version: undefined });
      expect(mod.meta.version).toBeUndefined();
      expect(mod.meta.name).toBe("a");
      expect(mod.meta.vendor).toBe("helix");
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
      expect(extractModDir("../../../mods/eln/index.ts")).toBe("eln");
    });

    it("extracts directory name from modManifest.json path", () => {
      expect(
        extractModDir("../../../mods/tags/modManifest.json"),
      ).toBe("tags");
    });

    it("extracts directory name with hyphens", () => {
      expect(
        extractModDir("../../../mods/my-plugin/index.ts"),
      ).toBe("my-plugin");
    });

    it("handles deeply nested paths", () => {
      expect(
        extractModDir("/home/user/project/src/mods/lims/index.ts"),
      ).toBe("lims");
    });
  });

  // ── parseJsonManifest Tests ─────────────────────────────────────────────

  describe("parseJsonManifest", () => {
    const testPath = "../../../mods/test-mod/modManifest.json";

    it("parses a minimal valid JSON manifest", () => {
      const manifest = parseJsonManifest(
        { vendor: "helix", name: "test-mod", displayName: "Test Mod" },
        testPath,
      );
      expect(manifest.vendor).toBe("helix");
      expect(manifest.name).toBe("test-mod");
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
          vendor: "helix",
          name: "full-mod",
          displayName: "Full Mod",
          version: "2.0.0",
          dependsOn: ["helix.tags", "helix.lims"],
          coreVersion: ">=1.0",
          icon: "flask-conical",
          description: "A complete test mod",
        },
        testPath,
      );
      expect(manifest.vendor).toBe("helix");
      expect(manifest.name).toBe("full-mod");
      expect(manifest.displayName).toBe("Full Mod");
      expect(manifest.version).toBe("2.0.0");
      expect(manifest.dependsOn).toEqual(["helix.tags", "helix.lims"]);
      expect(manifest.coreVersion).toBe(">=1.0");
      expect(manifest.icon).toBe("flask-conical");
      expect(manifest.description).toBe("A complete test mod");
    });

    it("parses object-form dependsOn entries", () => {
      const manifest = parseJsonManifest(
        {
          vendor: "helix",
          name: "test-mod",
          displayName: "Test Mod",
          dependsOn: [
            "helix.tags",
            { id: "helix.lims", version: ">=2.0" },
          ],
        },
        testPath,
      );
      expect(manifest.dependsOn).toEqual([
        "helix.tags",
        { id: "helix.lims", version: ">=2.0" },
      ]);
    });

    it("parses object-form dependsOn without version", () => {
      const manifest = parseJsonManifest(
        {
          vendor: "helix",
          name: "test-mod",
          displayName: "Test Mod",
          dependsOn: [{ id: "helix.lims" }],
        },
        testPath,
      );
      expect(manifest.dependsOn).toEqual([{ id: "helix.lims" }]);
    });

    it("defaults dependsOn to empty array when missing", () => {
      const manifest = parseJsonManifest(
        { vendor: "helix", name: "test-mod", displayName: "Test Mod" },
        testPath,
      );
      expect(manifest.dependsOn).toEqual([]);
    });

    it("skips undefined optional fields", () => {
      const manifest = parseJsonManifest(
        {
          vendor: "helix",
          name: "test-mod",
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

    it("throws on missing name field", () => {
      expect(() =>
        parseJsonManifest(
          { vendor: "helix", displayName: "No Name" } as Record<string, unknown>,
          testPath,
        ),
      ).toThrow("missing required field 'name'");
    });

    it("throws on empty name string", () => {
      expect(() =>
        parseJsonManifest(
          { vendor: "helix", name: "", displayName: "Empty Name" },
          testPath,
        ),
      ).toThrow("missing required field 'name'");
    });

    it("throws on missing vendor field", () => {
      expect(() =>
        parseJsonManifest(
          { name: "test-mod", displayName: "No Vendor" } as Record<string, unknown>,
          testPath,
        ),
      ).toThrow("missing required field 'vendor'");
    });

    it("throws on empty vendor string", () => {
      expect(() =>
        parseJsonManifest(
          { vendor: "", name: "test-mod", displayName: "Empty Vendor" },
          testPath,
        ),
      ).toThrow("missing required field 'vendor'");
    });

    it("throws on missing displayName field", () => {
      expect(() =>
        parseJsonManifest(
          { vendor: "helix", name: "test-mod" } as Record<string, unknown>,
          testPath,
        ),
      ).toThrow("missing required field 'displayName'");
    });

    it("throws on empty displayName string", () => {
      expect(() =>
        parseJsonManifest(
          { vendor: "helix", name: "test-mod", displayName: "" },
          testPath,
        ),
      ).toThrow("missing required field 'displayName'");
    });

    it("throws on non-array dependsOn", () => {
      expect(() =>
        parseJsonManifest(
          {
            vendor: "helix",
            name: "test-mod",
            displayName: "Test Mod",
            dependsOn: "not-an-array",
          },
          testPath,
        ),
      ).toThrow("'dependsOn' must be an array");
    });

    it("throws on bare dependsOn entry without dot (not fully qualified)", () => {
      expect(() =>
        parseJsonManifest(
          {
            vendor: "helix",
            name: "test-mod",
            displayName: "Test Mod",
            dependsOn: ["lims"],
          },
          testPath,
        ),
      ).toThrow("must be a fully-qualified");
    });

    it("throws on object-form dependsOn entry without dot in id", () => {
      expect(() =>
        parseJsonManifest(
          {
            vendor: "helix",
            name: "test-mod",
            displayName: "Test Mod",
            dependsOn: [{ id: "lims" }],
          },
          testPath,
        ),
      ).toThrow("must be a fully-qualified");
    });

    it("throws on invalid dependsOn entry type (number)", () => {
      expect(() =>
        parseJsonManifest(
          {
            vendor: "helix",
            name: "test-mod",
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
            vendor: "helix",
            name: "test-mod",
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
            vendor: "helix",
            name: "test-mod",
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
            vendor: "helix",
            name: "test-mod",
            displayName: "Test Mod",
            dependsOn: [{ id: "helix.lims", version: 2 }],
          },
          testPath,
        ),
      ).toThrow("version must be a string");
    });

    it("throws on null dependsOn entry", () => {
      expect(() =>
        parseJsonManifest(
          {
            vendor: "helix",
            name: "test-mod",
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
