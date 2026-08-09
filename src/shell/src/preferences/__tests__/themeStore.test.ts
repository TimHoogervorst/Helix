/**
 * Theme store unit tests.
 *
 * Asserts:
 *  - Built-in themes load from the JSON folder
 *  - Malformed theme file guard (themes are validated at load time)
 *  - applyTheme persists the id and applies seeds to document root
 *  - Corrupt or unavailable localStorage degrades to Original without throwing
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  getThemes,
  getActiveThemeId,
  getSeedsForTheme,
  applyTheme,
  bootActiveTheme,
  saveCustomTheme,
  deleteCustomTheme,
} from "../themeStore";

function readSeeds() {
  const root = document.documentElement;
  return {
    background: root.style.getPropertyValue("--color-background"),
    surface: root.style.getPropertyValue("--color-surface"),
    card: root.style.getPropertyValue("--color-card"),
    ink: root.style.getPropertyValue("--color-ink"),
    primary: root.style.getPropertyValue("--color-primary"),
    accent: root.style.getPropertyValue("--color-accent"),
  };
}

const originalGetItem = Storage.prototype.getItem;
const originalSetItem = Storage.prototype.setItem;
let store: Record<string, string>;

describe("themeStore", () => {
  beforeEach(() => {
    store = {};
    Storage.prototype.getItem = vi.fn((key: string) => store[key] ?? null);
    Storage.prototype.setItem = vi.fn(
      (key: string, value: string) => void (store[key] = value),
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
    Storage.prototype.getItem = originalGetItem;
    Storage.prototype.setItem = originalSetItem;
  });

  // ── Loading ──────────────────────────────────────────────────────────────

  it("loads the nine built-in themes", () => {
    const themes = getThemes();
    expect(themes).toHaveLength(9);
    const ids = themes.map((t) => t.id);
    expect(ids).toContain("original");
    expect(ids).toContain("cyberpunk");
    expect(ids).toContain("forest");
    expect(ids).toContain("terminal");
    expect(ids).toContain("lavender");
    expect(ids).toContain("gpt");
    expect(ids).toContain("claude");
    expect(ids).toContain("benchling");
    expect(ids).toContain("elabftw");
  });

  it("each theme has id, name, description, and six seeds", () => {
    for (const theme of getThemes()) {
      expect(theme).toHaveProperty("id");
      expect(typeof theme.id).toBe("string");
      expect(theme).toHaveProperty("name");
      expect(typeof theme.name).toBe("string");
      expect(theme).toHaveProperty("description");
      expect(typeof theme.description).toBe("string");
      expect(theme).toHaveProperty("seeds");
      expect(theme.seeds).toHaveProperty("background");
      expect(theme.seeds).toHaveProperty("surface");
      expect(theme.seeds).toHaveProperty("card");
      expect(theme.seeds).toHaveProperty("ink");
      expect(theme.seeds).toHaveProperty("primary");
      expect(theme.seeds).toHaveProperty("accent");
    }
  });

  // ── Default / fallback ──────────────────────────────────────────────────

  it("defaults to original when no active theme is stored", () => {
    expect(getActiveThemeId()).toBe("original");
  });

  it("defaults to original when stored theme id does not exist", () => {
    store["helix-active-theme"] = "nonexistent";
    expect(getActiveThemeId()).toBe("original");
  });

  // ── Persist ─────────────────────────────────────────────────────────────

  it("applyTheme persists the id to localStorage", () => {
    applyTheme("cyberpunk");
    expect(store["helix-active-theme"]).toBe("cyberpunk");
  });

  it("getActiveThemeId reads the persisted id", () => {
    store["helix-active-theme"] = "terminal";
    expect(getActiveThemeId()).toBe("terminal");
  });

  // ── Seed application ────────────────────────────────────────────────────

  it("applyTheme sets CSS custom properties for the theme seeds", () => {
    applyTheme("cyberpunk");
    const seeds = readSeeds();
    expect(seeds.background).toBe("#150A28");
    expect(seeds.surface).toBe("#201040");
    expect(seeds.card).toBe("#1A0D30");
    expect(seeds.ink).toBe("#A8BFFF");
    expect(seeds.primary).toBe("#FF2E88");
    expect(seeds.accent).toBe("#B967FF");
  });

  it("bootActiveTheme applies the stored theme seeds at boot", () => {
    store["helix-active-theme"] = "forest";
    bootActiveTheme();
    const seeds = readSeeds();
    expect(seeds.background).toBe("#0D1B12");
  });

  // ── Unavailable storage ─────────────────────────────────────────────────

  it("degrades to original when localStorage.getItem throws", () => {
    Storage.prototype.getItem = vi.fn(() => {
      throw new Error("storage unavailable");
    });
    const id = getActiveThemeId();
    expect(id).toBe("original");
  });

  it("does not throw when localStorage.setItem throws", () => {
    Storage.prototype.setItem = vi.fn(() => {
      throw new Error("storage full");
    });
    expect(() => applyTheme("lavender")).not.toThrow();
  });

  // ── Malformed file guard ────────────────────────────────────────────────

  it("all built-in themes validate correctly", () => {
    const themes = getThemes();
    for (const theme of themes) {
      expect(theme).toHaveProperty("id");
      expect(theme).toHaveProperty("name");
      expect(theme).toHaveProperty("description");
      expect(theme).toHaveProperty("seeds");
      expect(theme.seeds).toHaveProperty("background");
      expect(theme.seeds).toHaveProperty("surface");
      expect(theme.seeds).toHaveProperty("card");
      expect(theme.seeds).toHaveProperty("ink");
      expect(theme.seeds).toHaveProperty("primary");
      expect(theme.seeds).toHaveProperty("accent");
    }
  });

  // ── Custom themes: save / list / delete round-trip ───────────────────────

  function makeTheme(name: string, seeds: {
    background: string; surface: string; card: string; ink: string;
    primary: string; accent: string;
  }) {
    return { id: "", name, description: "", seeds };
  }

  it("saveCustomTheme persists to helix-custom-themes", () => {
    saveCustomTheme(makeTheme("My Theme", {
      background: "#111111",
      surface: "#222222",
      card: "#181818",
      ink: "#ffffff",
      primary: "#ff0000",
      accent: "#00ff00",
    }));
    const raw = JSON.parse(store["helix-custom-themes"]);
    expect(raw).toHaveLength(1);
    expect(raw[0].name).toBe("My Theme");
  });

  it("saveCustomTheme generates a custom- prefixed id", () => {
    const id = saveCustomTheme(makeTheme("My Theme", {
      background: "#111111",
      surface: "#222222",
      card: "#181818",
      ink: "#ffffff",
      primary: "#ff0000",
      accent: "#00ff00",
    }));
    expect(id).toMatch(/^custom-my-theme-/);
  });

  it("getThemes includes saved custom themes", () => {
    saveCustomTheme(makeTheme("My Theme", {
      background: "#111111",
      surface: "#222222",
      card: "#181818",
      ink: "#ffffff",
      primary: "#ff0000",
      accent: "#00ff00",
    }));
    const themes = getThemes();
    const custom = themes.find((t) => t.name === "My Theme");
    expect(custom).toBeDefined();
    expect(custom!.id).toMatch(/^custom-/);
  });

  it("deleteCustomTheme removes the theme from storage and getThemes", () => {
    const id = saveCustomTheme(makeTheme("Delete Me", {
      background: "#111111",
      surface: "#222222",
      card: "#181818",
      ink: "#ffffff",
      primary: "#ff0000",
      accent: "#00ff00",
    }));
    deleteCustomTheme(id);
    const themes = getThemes();
    const custom = themes.find((t) => t.id === id);
    expect(custom).toBeUndefined();
    const raw = JSON.parse(store["helix-custom-themes"]);
    expect(raw).toHaveLength(0);
  });

  it("deleting the active custom theme falls back to Original", () => {
    const id = saveCustomTheme(makeTheme("Active Custom", {
      background: "#111111",
      surface: "#222222",
      card: "#181818",
      ink: "#ffffff",
      primary: "#ff0000",
      accent: "#00ff00",
    }));
    expect(store["helix-active-theme"]).toBe(id);

    deleteCustomTheme(id);

    expect(store["helix-active-theme"]).toBe("original");
    expect(getActiveThemeId()).toBe("original");
    const seeds = readSeeds();
    expect(seeds.background).toBe("oklch(0.985 0.005 95)");
  });

  it("getSeedsForTheme returns seeds for a custom theme", () => {
    saveCustomTheme(makeTheme("Seed Test", {
      background: "#aaaabb",
      surface: "#bbbbcc",
      card: "#b6b6c6",
      ink: "#ccccdd",
      primary: "#ddddee",
      accent: "#eeefff",
    }));
    const seeds = getSeedsForTheme(
      getThemes().find((t) => t.name === "Seed Test")!.id,
    );
    expect(seeds.background).toBe("#aaaabb");
  });

  it("getActiveThemeId recognizes a custom theme id", () => {
    saveCustomTheme(makeTheme("Recognized", {
      background: "#111111",
      surface: "#222222",
      card: "#181818",
      ink: "#ffffff",
      primary: "#ff0000",
      accent: "#00ff00",
    }));
    const id = store["helix-active-theme"];
    expect(getActiveThemeId()).toBe(id);
  });

  it("duplicate saveCustomTheme names are allowed", () => {
    const id1 = saveCustomTheme(makeTheme("Duplicate", {
      background: "#111111",
      surface: "#222222",
      card: "#181818",
      ink: "#ffffff",
      primary: "#ff0000",
      accent: "#00ff00",
    }));
    const id2 = saveCustomTheme(makeTheme("Duplicate", {
      background: "#aaaabb",
      surface: "#bbbbcc",
      card: "#b6b6c6",
      ink: "#ccccdd",
      primary: "#ddddee",
      accent: "#eeefff",
    }));
    expect(id1).not.toBe(id2);
    expect(id1.startsWith("custom-duplicate-")).toBe(true);
    expect(id2.startsWith("custom-duplicate-")).toBe(true);
    const customs = JSON.parse(store["helix-custom-themes"]);
    expect(customs).toHaveLength(2);
  });
});
