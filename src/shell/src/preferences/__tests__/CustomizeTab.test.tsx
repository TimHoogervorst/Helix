/**
 * CustomizeTab component tests.
 *
 * Asserts:
 *  - Five seed rows render with label, color picker, and hex text input
 *  - Each field is initialized from the Active Theme's seeds
 *  - Editing a seed applies CSS variables live without writing to localStorage
 *  - Reset restores the Active Theme's canonical seeds
 *  - Unmount restores the Active Theme's seeds (draft discard on close)
 *  - Semantic colors (destructive, success, warning) are absent
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ThemeProvider } from "../ThemeProvider";
import { CustomizeTab } from "../CustomizeTab";
import { applyTheme, getSeedsForTheme } from "../themeStore";

const originalGetItem = Storage.prototype.getItem;
const originalSetItem = Storage.prototype.setItem;
let store: Record<string, string>;

function readSeeds() {
  const root = document.documentElement;
  return {
    background: root.style.getPropertyValue("--color-background"),
    surface: root.style.getPropertyValue("--color-surface"),
    ink: root.style.getPropertyValue("--color-ink"),
    primary: root.style.getPropertyValue("--color-primary"),
    accent: root.style.getPropertyValue("--color-accent"),
  };
}

function renderCustomize(themeId = "cyberpunk") {
  store["helix-active-theme"] = themeId;
  applyTheme(themeId);
  return render(
    <ThemeProvider>
      <CustomizeTab />
    </ThemeProvider>,
  );
}

describe("CustomizeTab", () => {
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

  it("renders five seed rows with labels", () => {
    renderCustomize();
    const labels = ["Background", "Surface", "Ink", "Primary", "Accent"];
    for (const label of labels) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
  });

  it("each seed row has a color picker and text input initialized from the active theme", () => {
    renderCustomize();
    const seeds = getSeedsForTheme("cyberpunk");

    expect(
      screen.getByLabelText("Background hex value"),
    ).toHaveValue(seeds.background);
    expect(
      screen.getByLabelText("Surface hex value"),
    ).toHaveValue(seeds.surface);
    expect(screen.getByLabelText("Ink hex value")).toHaveValue(seeds.ink);
    expect(
      screen.getByLabelText("Primary hex value"),
    ).toHaveValue(seeds.primary);
    expect(
      screen.getByLabelText("Accent hex value"),
    ).toHaveValue(seeds.accent);
  });

  it("editing a seed applies CSS variables live without writing to localStorage", () => {
    renderCustomize();

    const setItemMock = Storage.prototype.setItem as ReturnType<typeof vi.fn>;
    setItemMock.mockClear();

    const bgInput = screen.getByLabelText("Background hex value");
    fireEvent.change(bgInput, { target: { value: "#ff0000" } });

    const seeds = readSeeds();
    expect(seeds.background).toBe("#ff0000");
    expect(seeds.surface).not.toBe("#ff0000");

    const themeWrites = setItemMock.mock.calls.filter(
      (c: string[]) => c[0] === "helix-active-theme",
    );
    expect(themeWrites.length).toBe(0);
  });

  it("Reset restores the active theme seeds", () => {
    renderCustomize();
    const originalSeeds = getSeedsForTheme("cyberpunk");

    const bgInput = screen.getByLabelText("Background hex value");
    fireEvent.change(bgInput, { target: { value: "#ff0000" } });

    expect(readSeeds().background).toBe("#ff0000");

    fireEvent.click(screen.getByText("Reset"));

    const seeds = readSeeds();
    expect(seeds.background).toBe(originalSeeds.background);
    expect(seeds.surface).toBe(originalSeeds.surface);
    expect(seeds.ink).toBe(originalSeeds.ink);
    expect(seeds.primary).toBe(originalSeeds.primary);
    expect(seeds.accent).toBe(originalSeeds.accent);
  });

  it("Reset appears only when the draft is dirty", () => {
    renderCustomize();
    expect(screen.queryByText("Reset")).not.toBeInTheDocument();

    const bgInput = screen.getByLabelText("Background hex value");
    fireEvent.change(bgInput, { target: { value: "#ff0000" } });

    expect(screen.getByText("Reset")).toBeInTheDocument();

    fireEvent.click(screen.getByText("Reset"));
    expect(screen.queryByText("Reset")).not.toBeInTheDocument();
  });

  it("unmount discards the draft and restores the active theme seeds", () => {
    const { unmount } = renderCustomize();
    const originalSeeds = getSeedsForTheme("cyberpunk");

    const bgInput = screen.getByLabelText("Background hex value");
    fireEvent.change(bgInput, { target: { value: "#AABBCC" } });
    expect(readSeeds().background).toBe("#AABBCC");

    unmount();

    const seeds = readSeeds();
    expect(seeds.background).toBe(originalSeeds.background);
    expect(seeds.surface).toBe(originalSeeds.surface);
  });

  it("does not show semantic colors", () => {
    renderCustomize();
    expect(screen.queryByText("Destructive")).not.toBeInTheDocument();
    expect(screen.queryByText("Success")).not.toBeInTheDocument();
    expect(screen.queryByText("Warning")).not.toBeInTheDocument();
  });

  it("works with oklch seed values from the Original theme", () => {
    renderCustomize("original");
    const seeds = getSeedsForTheme("original");

    expect(screen.getByLabelText("Background hex value")).toHaveValue(
      seeds.background,
    );
    expect(screen.getByLabelText("Surface hex value")).toHaveValue(
      seeds.surface,
    );
    const colorPicker = screen.getByLabelText("Background color picker");
    expect(colorPicker).toHaveValue("#000000");
  });

  // ── Save as theme ────────────────────────────────────────────────────────

  it("shows 'Save as theme…' button when draft is dirty", () => {
    renderCustomize();
    const bgInput = screen.getByLabelText("Background hex value");
    fireEvent.change(bgInput, { target: { value: "#ff0000" } });

    expect(screen.getByText("Save as theme…")).toBeInTheDocument();
  });

  it("does not show 'Save as theme…' when draft is clean", () => {
    renderCustomize();
    expect(screen.queryByText("Save as theme…")).not.toBeInTheDocument();
  });

  it("clicking 'Save as theme…' prompts and persists a custom theme", () => {
    const promptMock = vi.fn().mockReturnValue("My Custom");
    window.prompt = promptMock;

    renderCustomize();
    const bgInput = screen.getByLabelText("Background hex value");
    fireEvent.change(bgInput, { target: { value: "#AABBCC" } });

    fireEvent.click(screen.getByText("Save as theme…"));

    expect(promptMock).toHaveBeenCalledWith("Theme name:");
    const raw = JSON.parse(store["helix-custom-themes"]);
    expect(raw).toHaveLength(1);
    expect(raw[0].name).toBe("My Custom");
    expect(raw[0].seeds.background).toBe("#AABBCC");
  });

  it("does not save when prompt is cancelled", () => {
    window.prompt = vi.fn().mockReturnValue(null);

    renderCustomize();
    const bgInput = screen.getByLabelText("Background hex value");
    fireEvent.change(bgInput, { target: { value: "#AABBCC" } });

    fireEvent.click(screen.getByText("Save as theme…"));

    expect(store["helix-custom-themes"]).toBeUndefined();
  });

  it("does not save when prompt returns empty string", () => {
    window.prompt = vi.fn().mockReturnValue("   ");

    renderCustomize();
    const bgInput = screen.getByLabelText("Background hex value");
    fireEvent.change(bgInput, { target: { value: "#AABBCC" } });

    fireEvent.click(screen.getByText("Save as theme…"));

    expect(store["helix-custom-themes"]).toBeUndefined();
  });
});
