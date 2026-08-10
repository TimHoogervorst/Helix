import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { IconBadge, warnMissingIcon } from "../IconBadge";
import { ModRegistry } from "../../../mod-system/ModRegistry";

const SEED_COLORS = [
  { key: "enzyme", label: "Enzyme", hex: "#d9b3e6", hexDark: "#EBC8F2", hexLight: "#D9B3E6" },
  { key: "flask", label: "Flask", hex: "#b3d9e6", hexDark: "#C8EBF2", hexLight: "#B3D9E6" },
  { key: "muted", label: "Muted", hex: "#d9d9d9", hexDark: "#E8E8E8", hexLight: "#D9D9D9" },
];

const SEED_ICONS = [
  { key: "dna", label: "DNA", kind: "lucide" as const, token: "dna", svg: "" },
  { key: "circle", label: "Circle", kind: "lucide" as const, token: "circle", svg: "" },
];

function seedRegistry(icons = SEED_ICONS, colors = SEED_COLORS) {
  ModRegistry._reset();
  ModRegistry.getInstance().hydrateFromBackend(
    {
      iconLibrary: icons,
      colorPalette: colors,
    },
    new Map(),
  );
}

function setThemeMode(mode: "light" | "dark") {
  document.documentElement.setAttribute("data-color-mode", mode);
}

function clearThemeMode() {
  document.documentElement.removeAttribute("data-color-mode");
}

afterEach(() => {
  ModRegistry._reset();
  clearThemeMode();
});

describe("IconBadge", () => {
  describe("known keys", () => {
    beforeEach(() => {
      seedRegistry();
    });

    it("renders with a known icon and color key", () => {
      render(<IconBadge iconKey="dna" colorKey="flask" />);
      const badge = screen.getByTestId("icon-badge");
      expect(badge).toBeInTheDocument();
      expect(badge.children.length).toBeGreaterThan(0);
    });

    it("applies the raw hex as background", () => {
      render(<IconBadge iconKey="dna" colorKey="enzyme" />);
      const badge = screen.getByTestId("icon-badge");
      expect(badge.style.backgroundColor).toBe("var(--color-label-enzyme, #D9B3E6)");
    });

    it("derives a saturated shade for the foreground", () => {
      render(<IconBadge iconKey="dna" colorKey="muted" />);
      const badge = screen.getByTestId("icon-badge");
      expect(badge.style.color).toBe("var(--color-label-muted-foreground, #5b5b5b)");
    });

    it("derives a saturated shade for mid-tone backgrounds", () => {
      render(<IconBadge iconKey="dna" colorKey="flask" />);
      const badge = screen.getByTestId("icon-badge");
      expect(badge.style.color).toBe("var(--color-label-flask-foreground, #246e88)");
    });
  });

  describe("theme mode", () => {
    beforeEach(() => {
      seedRegistry();
    });

    it("uses hexDark for dark theme mode", () => {
      setThemeMode("dark");
      render(<IconBadge iconKey="dna" colorKey="enzyme" />);
      const badge = screen.getByTestId("icon-badge");
      expect(badge.style.backgroundColor).toBe("var(--color-label-enzyme, #EBC8F2)");
    });

    it("uses hexLight for light theme mode", () => {
      setThemeMode("light");
      render(<IconBadge iconKey="dna" colorKey="enzyme" />);
      const badge = screen.getByTestId("icon-badge");
      expect(badge.style.backgroundColor).toBe("var(--color-label-enzyme, #D9B3E6)");
    });

    it("falls back to hexLight when no mode is set", () => {
      render(<IconBadge iconKey="dna" colorKey="enzyme" />);
      const badge = screen.getByTestId("icon-badge");
      expect(badge.style.backgroundColor).toBe("var(--color-label-enzyme, #D9B3E6)");
    });
  });

  describe("unknown keys", () => {
    beforeEach(() => {
      seedRegistry(
        // Don't seed "nonexistent" or "unknown-a" — they should remain unknown
        [{ key: "dna", label: "DNA", kind: "lucide" as const, token: "dna", svg: "" }],
        [{ key: "flask", label: "Flask", hex: "#b3d9e6", hexDark: "#C8EBF2", hexLight: "#B3D9E6" }],
      );
      vi.spyOn(console, "warn").mockImplementation(() => {});
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    it("still renders an SVG for an unknown iconKey", () => {
      render(<IconBadge iconKey="nonexistent" colorKey="flask" />);
      const badge = screen.getByTestId("icon-badge");
      expect(badge.querySelector("svg")).toBeInTheDocument();
    });

    it("logs a console warning when icon key is unknown", () => {
      render(<IconBadge iconKey="unknown-a" colorKey="flask" />);
      expect(console.warn).toHaveBeenCalledWith(
        expect.stringContaining('[IconBadge] Unknown icon key "unknown-a"'),
      );
    });

    it("does not warn again for the same unknown key", () => {
      warnMissingIcon("dedup-test");
      warnMissingIcon("dedup-test");
      expect(console.warn).toHaveBeenCalledTimes(1);
    });

    it("does not warn for a known icon key", () => {
      render(<IconBadge iconKey="dna" colorKey="flask" />);
      const calls = (console.warn as ReturnType<typeof vi.fn>).mock.calls.filter(
        (c: string[]) => c[0] && c[0].includes("dna"),
      );
      expect(calls).toHaveLength(0);
    });

    it("falls back to muted background for an unknown colorKey", () => {
      render(<IconBadge iconKey="dna" colorKey="nonexistent" />);
      const badge = screen.getByTestId("icon-badge");
      expect(badge.style.backgroundColor).toBe("var(--color-label-nonexistent, #d9d9d9)");
    });

    it("falls back gracefully when both keys are unknown", () => {
      render(<IconBadge iconKey="nonexistent" colorKey="nonexistent" />);
      const badge = screen.getByTestId("icon-badge");
      expect(badge.children.length).toBeGreaterThan(0);
      expect(badge.style.backgroundColor).toBe("var(--color-label-nonexistent, #d9d9d9)");
    });
  });

  describe("clickable vs inert", () => {
    beforeEach(() => {
      seedRegistry();
    });

    it("renders as a div without onChange", () => {
      render(<IconBadge iconKey="circle" colorKey="muted" />);
      const badge = screen.getByTestId("icon-badge");
      expect(badge.tagName).toBe("DIV");
    });

    it("renders as a button with onChange", () => {
      render(
        <IconBadge iconKey="circle" colorKey="muted" onChange={() => {}} />,
      );
      const badge = screen.getByTestId("icon-badge");
      expect(badge.tagName).toBe("BUTTON");
    });

    it("calls onChange when clicked", () => {
      const onChange = vi.fn();
      render(
        <IconBadge iconKey="circle" colorKey="muted" onChange={onChange} />,
      );
      const badge = screen.getByTestId("icon-badge");
      fireEvent.click(badge);
      expect(onChange).toHaveBeenCalledTimes(1);
    });

    it("has cursor-pointer class with onChange", () => {
      render(
        <IconBadge iconKey="circle" colorKey="muted" onChange={() => {}} />,
      );
      const badge = screen.getByTestId("icon-badge");
      expect(badge.className).toContain("cursor-pointer");
    });

    it("does not have cursor-pointer class without onChange", () => {
      render(<IconBadge iconKey="circle" colorKey="muted" />);
      const badge = screen.getByTestId("icon-badge");
      expect(badge.className).not.toContain("cursor-pointer");
    });
  });

  describe("dynamic library", () => {
    beforeEach(() => {
      ModRegistry._reset();
      ModRegistry.getInstance().hydrateFromBackend(
        {
          iconLibrary: [
            {
              key: "dyn-lucide",
              label: "Dynamic Lucide",
              kind: "lucide",
              token: "dna",
              svg: "",
            },
            {
              key: "dyn-custom",
              label: "Dynamic Custom",
              kind: "custom",
              token: "",
              svg: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/></svg>',
            },
          ],
          colorPalette: [
            { key: "dyn-color", label: "Dynamic Color", hex: "#ffcc00", hexDark: "#FFE080", hexLight: "#FFCC00" },
          ],
        },
        new Map(),
      );
    });

    it("resolves color from dynamic palette", () => {
      render(<IconBadge iconKey="circle" colorKey="dyn-color" />);
      const badge = screen.getByTestId("icon-badge");
      expect(badge.style.backgroundColor).toBe("var(--color-label-dyn-color, #FFCC00)");
    });

    it("renders custom SVG from dynamic library", () => {
      render(<IconBadge iconKey="dyn-custom" colorKey="muted" />);
      const badge = screen.getByTestId("icon-badge");
      expect(badge.querySelector("div svg")).toBeInTheDocument();
      expect(badge.innerHTML).toContain("cx=");
    });

    it("does not warn for an icon key found in the dynamic library", () => {
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      render(<IconBadge iconKey="dyn-lucide" colorKey="muted" />);
      const calls = warnSpy.mock.calls.filter(
        (c: string[]) => c[0] && c[0].includes("dyn-lucide"),
      );
      expect(calls).toHaveLength(0);
      warnSpy.mockRestore();
    });

    it("renders an SVG for a dynamic-only icon key (circle fallback in test env)", () => {
      render(<IconBadge iconKey="dyn-lucide" colorKey="muted" />);
      const badge = screen.getByTestId("icon-badge");
      expect(badge.children.length).toBeGreaterThan(0);
    });
  });

  describe("size variants", () => {
    beforeEach(() => {
      seedRegistry();
    });

    it("renders sm size with correct classes", () => {
      render(<IconBadge iconKey="circle" colorKey="muted" size="sm" />);
      const badge = screen.getByTestId("icon-badge");
      expect(badge.className).toContain("h-6");
      expect(badge.className).toContain("w-6");
    });

    it("renders md size with correct classes", () => {
      render(<IconBadge iconKey="circle" colorKey="muted" size="md" />);
      const badge = screen.getByTestId("icon-badge");
      expect(badge.className).toContain("h-9");
      expect(badge.className).toContain("w-9");
    });

    it("renders lg size with correct classes", () => {
      render(<IconBadge iconKey="circle" colorKey="muted" size="lg" />);
      const badge = screen.getByTestId("icon-badge");
      expect(badge.className).toContain("h-12");
      expect(badge.className).toContain("w-12");
    });

    it("defaults to md when size is not specified", () => {
      render(<IconBadge iconKey="circle" colorKey="muted" />);
      const badge = screen.getByTestId("icon-badge");
      expect(badge.className).toContain("h-9");
      expect(badge.className).toContain("w-9");
    });

    it("renders the correct icon size for each variant", () => {
      const { rerender } = render(
        <IconBadge iconKey="circle" colorKey="muted" size="sm" />,
      );
      let badge = screen.getByTestId("icon-badge");
      let iconEl = badge.firstElementChild;
      expect(iconEl?.getAttribute("class")).toContain("h-3.5");

      rerender(<IconBadge iconKey="circle" colorKey="muted" size="md" />);
      badge = screen.getByTestId("icon-badge");
      iconEl = badge.firstElementChild;
      expect(iconEl?.getAttribute("class")).toContain("h-5");

      rerender(<IconBadge iconKey="circle" colorKey="muted" size="lg" />);
      badge = screen.getByTestId("icon-badge");
      iconEl = badge.firstElementChild;
      expect(iconEl?.getAttribute("class")).toContain("h-7");
    });
  });
});
