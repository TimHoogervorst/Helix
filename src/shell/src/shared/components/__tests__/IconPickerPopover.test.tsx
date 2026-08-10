import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { IconPickerPopover } from "../IconPickerPopover";
import { ModRegistry } from "../../../mod-system/ModRegistry";

const TEST_COLORS = [
  { key: "enzyme", label: "Enzyme", hex: "#d9b3e6", hexDark: "#EBC8F2", hexLight: "#D9B3E6" },
  { key: "flask", label: "Flask", hex: "#b3d9e6", hexDark: "#C8EBF2", hexLight: "#B3D9E6" },
  { key: "solvent", label: "Solvent", hex: "#b3e6c8", hexDark: "#C8F2D9", hexLight: "#B3E6C8" },
  { key: "warn", label: "Warn", hex: "#e6d9b3", hexDark: "#F2EBC8", hexLight: "#E6D9B3" },
  { key: "muted", label: "Muted", hex: "#d9d9d9", hexDark: "#E8E8E8", hexLight: "#D9D9D9" },
  { key: "success", label: "Success", hex: "#b3e6b3", hexDark: "#C8F2C8", hexLight: "#B3E6B3" },
];

const TEST_ICON_KEYS = [
  "circle",
  "dna",
  "rat",
  "leaf",
  "cog",
  "notebook",
  "user",
  "folder",
];

function seedRegistry() {
  ModRegistry._reset();
  ModRegistry.getInstance().hydrateFromBackend(
    {
      iconLibrary: TEST_ICON_KEYS.map((key) => ({
        key,
        label: key.charAt(0).toUpperCase() + key.slice(1),
        kind: "lucide",
        token: key,
        svg: "",
      })),
      colorPalette: TEST_COLORS.map((c) => ({
        key: c.key,
        label: c.label,
        hex: c.hex,
        hexDark: c.hexDark,
        hexLight: c.hexLight,
      })),
    },
    new Map(),
  );
}

beforeEach(() => {
  seedRegistry();
});

function renderPopover(
  props: Partial<{
    iconKey: string;
    colorKey: string;
    size: "sm" | "md" | "lg";
    onChange: (iconKey: string, colorKey: string) => void;
  }> = {},
) {
  const onChange = props.onChange ?? vi.fn();
  return render(
    <IconPickerPopover
      iconKey={props.iconKey ?? "circle"}
      colorKey={props.colorKey ?? "muted"}
      size={props.size ?? "md"}
      onChange={onChange}
    />,
  );
}

function openPopover() {
  const trigger = screen.getByTestId("icon-badge");
  fireEvent.click(trigger);
}

describe("IconPickerPopover", () => {
  describe("open / close", () => {
    it("opens the popover when the IconBadge trigger is clicked", () => {
      renderPopover();
      openPopover();
      expect(screen.getByTestId("icon-picker-popover")).toBeInTheDocument();
    });

    it("closes on outside click", () => {
      renderPopover();
      openPopover();
      expect(screen.getByTestId("icon-picker-popover")).toBeInTheDocument();
      fireEvent.mouseDown(document.body);
      expect(
        screen.queryByTestId("icon-picker-popover"),
      ).not.toBeInTheDocument();
    });

    it("closes on Escape", () => {
      renderPopover();
      openPopover();
      expect(screen.getByTestId("icon-picker-popover")).toBeInTheDocument();
      fireEvent.keyDown(document, { key: "Escape" });
      expect(
        screen.queryByTestId("icon-picker-popover"),
      ).not.toBeInTheDocument();
    });

    it("closes the popover when trigger is clicked again", () => {
      renderPopover();
      const trigger = screen.getByTestId("icon-badge");
      fireEvent.click(trigger);
      expect(screen.getByTestId("icon-picker-popover")).toBeInTheDocument();
      fireEvent.click(trigger);
      expect(
        screen.queryByTestId("icon-picker-popover"),
      ).not.toBeInTheDocument();
    });
  });

  describe("tabs", () => {
    it("shows Icons tab by default", () => {
      renderPopover();
      openPopover();
      expect(screen.getByTestId("icons-grid")).toBeInTheDocument();
      expect(screen.queryByTestId("colour-grid")).not.toBeInTheDocument();
    });

    it("switches to Colour tab when clicked", () => {
      renderPopover();
      openPopover();
      fireEvent.click(screen.getByTestId("tab-colour"));
      expect(screen.getByTestId("colour-grid")).toBeInTheDocument();
      expect(screen.queryByTestId("icons-grid")).not.toBeInTheDocument();
    });

    it("switches back to Icons tab when clicked", () => {
      renderPopover();
      openPopover();
      fireEvent.click(screen.getByTestId("tab-colour"));
      fireEvent.click(screen.getByTestId("tab-icons"));
      expect(screen.getByTestId("icons-grid")).toBeInTheDocument();
    });

    it("preserves search text when switching tabs", () => {
      renderPopover();
      openPopover();
      const searchInput = screen.getByTestId("popover-search");
      fireEvent.change(searchInput, { target: { value: "dna" } });
      fireEvent.click(screen.getByTestId("tab-colour"));
      fireEvent.click(screen.getByTestId("tab-icons"));
      expect(searchInput).toHaveValue("dna");
    });
  });

  describe("search", () => {
    it("filters icons by label", () => {
      renderPopover();
      openPopover();
      const searchInput = screen.getByTestId("popover-search");
      fireEvent.change(searchInput, { target: { value: "Dna" } });
      expect(screen.getByTestId("icon-option-dna")).toBeInTheDocument();
      // Rat should not match "Dna"
      expect(
        screen.queryByTestId("icon-option-rat"),
      ).not.toBeInTheDocument();
    });

    it("shows no icons message when search matches nothing", () => {
      renderPopover();
      openPopover();
      fireEvent.change(screen.getByTestId("popover-search"), {
        target: { value: "zzzzzz" },
      });
      expect(screen.getByText("No icons found.")).toBeInTheDocument();
    });

    it("filters colours by label", () => {
      renderPopover();
      openPopover();
      fireEvent.click(screen.getByTestId("tab-colour"));
      fireEvent.change(screen.getByTestId("popover-search"), {
        target: { value: "Enz" },
      });
      expect(screen.getByTestId("color-option-enzyme")).toBeInTheDocument();
      expect(
        screen.queryByTestId("color-option-flask"),
      ).not.toBeInTheDocument();
    });
  });

  describe("selection", () => {
    it("fires onChange with new iconKey and existing colorKey when an icon is clicked", () => {
      const onChange = vi.fn();
      renderPopover({ onChange });
      openPopover();
      fireEvent.click(screen.getByTestId("icon-option-dna"));
      expect(onChange).toHaveBeenCalledWith("dna", "muted");
    });

    it("closes popover after icon selection", () => {
      renderPopover();
      openPopover();
      fireEvent.click(screen.getByTestId("icon-option-dna"));
      expect(
        screen.queryByTestId("icon-picker-popover"),
      ).not.toBeInTheDocument();
    });

    it("fires onChange with existing iconKey and new colorKey when a colour is clicked", () => {
      const onChange = vi.fn();
      renderPopover({ onChange });
      openPopover();
      fireEvent.click(screen.getByTestId("tab-colour"));
      fireEvent.click(screen.getByTestId("color-option-flask"));
      expect(onChange).toHaveBeenCalledWith("circle", "flask");
    });

    it("closes popover after colour selection", () => {
      renderPopover();
      openPopover();
      fireEvent.click(screen.getByTestId("tab-colour"));
      fireEvent.click(screen.getByTestId("color-option-flask"));
      expect(
        screen.queryByTestId("icon-picker-popover"),
      ).not.toBeInTheDocument();
    });
  });

  describe("pagination", () => {
    it("does not show pagination controls when icons fit on one page", () => {
      // 8 icons with ICONS_PER_PAGE=20 → 1 page
      renderPopover();
      openPopover();
      expect(
        screen.queryByTestId("pagination-controls"),
      ).not.toBeInTheDocument();
    });

    it("shows pagination controls when icons exceed one page", () => {
      // Seed many icons to force pagination
      ModRegistry._reset();
      const manyIcons = Array.from({ length: 25 }, (_, i) => ({
        key: `icon-${i}`,
        label: `Icon ${i}`,
        kind: "lucide" as const,
        token: "circle",
        svg: "",
      }));
      ModRegistry.getInstance().hydrateFromBackend(
        {
          iconLibrary: manyIcons,
          colorPalette: [],
        },
        new Map(),
      );

      renderPopover();
      openPopover();
      expect(screen.getByTestId("pagination-controls")).toBeInTheDocument();
    });

    it("advances to next page when > is clicked", () => {
      ModRegistry._reset();
      const manyIcons = Array.from({ length: 25 }, (_, i) => ({
        key: `icon-${i}`,
        label: `Icon ${i}`,
        kind: "lucide" as const,
        token: "circle",
        svg: "",
      }));
      ModRegistry.getInstance().hydrateFromBackend(
        {
          iconLibrary: manyIcons,
          colorPalette: [],
        },
        new Map(),
      );

      renderPopover();
      openPopover();
      // Page 1: icons 0-19
      expect(screen.getByTestId("icon-option-icon-0")).toBeInTheDocument();
      expect(
        screen.queryByTestId("icon-option-icon-20"),
      ).not.toBeInTheDocument();
      fireEvent.click(screen.getByTestId("pagination-next"));
      // Page 2: icons 20-24
      expect(screen.getByTestId("icon-option-icon-20")).toBeInTheDocument();
      expect(
        screen.queryByTestId("icon-option-icon-0"),
      ).not.toBeInTheDocument();
    });

    it("shows correct page indicator", () => {
      ModRegistry._reset();
      const manyIcons = Array.from({ length: 25 }, (_, i) => ({
        key: `icon-${i}`,
        label: `Icon ${i}`,
        kind: "lucide" as const,
        token: "circle",
        svg: "",
      }));
      ModRegistry.getInstance().hydrateFromBackend(
        {
          iconLibrary: manyIcons,
          colorPalette: [],
        },
        new Map(),
      );

      renderPopover();
      openPopover();
      expect(
        screen.getByTestId("pagination-controls").textContent,
      ).toContain("1 / 2");
      fireEvent.click(screen.getByTestId("pagination-next"));
      expect(
        screen.getByTestId("pagination-controls").textContent,
      ).toContain("2 / 2");
    });
  });

  describe("render states", () => {
    it("renders the IconBadge trigger", () => {
      renderPopover();
      expect(screen.getByTestId("icon-badge")).toBeInTheDocument();
    });

    it("renders with size prop passed to IconBadge", () => {
      renderPopover({ size: "sm" });
      const badge = screen.getByTestId("icon-badge");
      expect(badge.className).toContain("cursor-pointer");
    });

    it("highlights the currently selected icon", () => {
      renderPopover({ iconKey: "dna" });
      openPopover();
      const btn = screen.getByTestId("icon-option-dna");
      expect(btn.className).toContain("border-foreground");
    });

    it("highlights the currently selected colour", () => {
      renderPopover({ colorKey: "flask" });
      openPopover();
      fireEvent.click(screen.getByTestId("tab-colour"));
      const btn = screen.getByTestId("color-option-flask");
      expect(btn.className).toContain("border-foreground");
    });

    it("shows the colour hex as a visual swatch", () => {
      renderPopover();
      openPopover();
      fireEvent.click(screen.getByTestId("tab-colour"));
      const enzyme = screen.getByTestId("color-option-enzyme");
      expect(enzyme.style.backgroundColor).toBe("rgb(217, 179, 230)");
    });
  });
});
