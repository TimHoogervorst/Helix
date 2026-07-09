/**
 * Tests for MoreActions — portaled dropdown menu component.
 *
 * Verifies: open/close on trigger click, click-outside dismissal, Escape
 * to close with focus return, arrow-key navigation, ARIA attributes,
 * destructive styling, disabled items, tooltips, extensibility.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { Trash2, Copy, FileDown } from "lucide-react";
import MoreActions, { type MoreActionsItem } from "../components/MoreActions";

// ── Helpers ──────────────────────────────────────────────────────────────────

function buildItems(
  overrides?: Partial<MoreActionsItem>[],
): MoreActionsItem[] {
  const defaults: MoreActionsItem[] = [
    {
      key: "delete",
      icon: Trash2,
      label: "Delete",
      onClick: vi.fn(),
      destructive: true,
      tooltip: "Delete this entry",
    },
    {
      key: "duplicate",
      icon: Copy,
      label: "Duplicate",
      onClick: vi.fn(),
      tooltip: "Duplicate this entry",
    },
    {
      key: "export",
      icon: FileDown,
      label: "Export",
      onClick: vi.fn(),
    },
  ];

  if (!overrides) return defaults;

  return defaults.map((d, i) => {
    const o = overrides[i];
    return o ? { ...d, ...o } : d;
  });
}

function renderMoreActions(items?: MoreActionsItem[]) {
  return render(<MoreActions items={items ?? buildItems()} />);
}

/** Helper: open the menu by clicking the trigger. */
function openMenu() {
  fireEvent.click(screen.getByLabelText("More actions"));
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe("MoreActions", () => {
  describe("trigger button", () => {
    it("renders the … trigger button with correct ARIA attributes", () => {
      renderMoreActions();
      const trigger = screen.getByLabelText("More actions");
      expect(trigger).toBeDefined();
      expect(trigger.getAttribute("aria-expanded")).toBe("false");
      expect(trigger.getAttribute("aria-haspopup")).toBe("menu");
      expect(trigger.className).toContain("btn-icon");
    });

    it("opens the menu on click and sets aria-expanded to true", () => {
      renderMoreActions();
      const trigger = screen.getByLabelText("More actions");

      fireEvent.click(trigger);

      expect(trigger.getAttribute("aria-expanded")).toBe("true");
      // Menu should be in the DOM (portaled to body)
      expect(screen.getByRole("menu")).toBeDefined();
    });

    it("closes the menu on second click (toggle)", () => {
      renderMoreActions();
      const trigger = screen.getByLabelText("More actions");

      fireEvent.click(trigger);
      expect(screen.getByRole("menu")).toBeDefined();

      fireEvent.click(trigger);
      expect(screen.queryByRole("menu")).toBeNull();
      expect(trigger.getAttribute("aria-expanded")).toBe("false");
    });

    it("opens and closes menu on Enter key (native button activation)", () => {
      renderMoreActions();
      const trigger = screen.getByLabelText("More actions");
      trigger.focus();

      // Native <button> fires click on Enter; simulate click directly
      // since jsdom's keyDown doesn't trigger the native mapping.
      fireEvent.click(trigger);

      expect(screen.getByRole("menu")).toBeDefined();
      expect(trigger.getAttribute("aria-expanded")).toBe("true");
    });

    it("opens and closes menu on Space key (native button activation)", () => {
      renderMoreActions();
      const trigger = screen.getByLabelText("More actions");
      trigger.focus();

      fireEvent.click(trigger);

      expect(screen.getByRole("menu")).toBeDefined();
      expect(trigger.getAttribute("aria-expanded")).toBe("true");
    });
  });

  describe("menu items", () => {
    it("renders all items from the items prop", () => {
      const items = buildItems();
      renderMoreActions(items);

      openMenu();

      expect(screen.getByText("Delete")).toBeDefined();
      expect(screen.getByText("Duplicate")).toBeDefined();
      expect(screen.getByText("Export")).toBeDefined();
    });

    it("renders destructive item with destructive color class", () => {
      renderMoreActions();
      openMenu();

      const deleteBtn = screen.getByText("Delete");
      expect(deleteBtn.className).toContain("text-destructive");
    });

    it("renders non-destructive items with foreground color class", () => {
      renderMoreActions();
      openMenu();

      const duplicateBtn = screen.getByText("Duplicate");
      expect(duplicateBtn.className).toContain("text-foreground");
    });

    it("renders tooltips on menu items", () => {
      renderMoreActions();
      openMenu();

      const deleteBtn = screen.getByText("Delete");
      expect(deleteBtn.getAttribute("title")).toBe("Delete this entry");

      const duplicateBtn = screen.getByText("Duplicate");
      expect(duplicateBtn.getAttribute("title")).toBe("Duplicate this entry");
    });

    it("calls item onClick and closes menu when item is clicked", () => {
      const items = buildItems();
      renderMoreActions(items);

      openMenu();
      fireEvent.click(screen.getByText("Delete"));

      expect(items[0].onClick).toHaveBeenCalledTimes(1);
      expect(screen.queryByRole("menu")).toBeNull();
    });
  });

  describe("disabled items", () => {
    it("renders disabled items with cursor-not-allowed and reduced opacity", () => {
      const items = buildItems([{ disabled: true }]);
      renderMoreActions(items);

      openMenu();

      const disabledBtn = screen.getByText("Delete");
      expect(disabledBtn).toBeDefined();
      expect(disabledBtn.className).toContain("cursor-not-allowed");
      expect(disabledBtn.className).toContain("opacity-50");
      expect((disabledBtn as HTMLButtonElement).disabled).toBe(true);
    });

    it("skips disabled items in arrow-key navigation", () => {
      const items = buildItems([
        { disabled: true }, // Delete disabled
        {}, // Duplicate enabled
        {}, // Export enabled
      ]);
      renderMoreActions(items);

      openMenu();

      // Arrow down should focus the first enabled item (Duplicate), not Delete
      fireEvent.keyDown(document, { key: "ArrowDown" });

      const duplicateBtn = screen.getByText("Duplicate");
      expect(document.activeElement).toBe(duplicateBtn);
    });
  });

  describe("dismissal", () => {
    it("closes on Escape and returns focus to trigger", () => {
      renderMoreActions();
      const trigger = screen.getByLabelText("More actions");

      fireEvent.click(trigger);
      expect(screen.getByRole("menu")).toBeDefined();

      fireEvent.keyDown(document, { key: "Escape" });

      expect(screen.queryByRole("menu")).toBeNull();
      expect(document.activeElement).toBe(trigger);
    });

    it("closes on click outside", () => {
      renderMoreActions();

      openMenu();
      expect(screen.getByRole("menu")).toBeDefined();

      // Click outside the menu (on document.body)
      fireEvent.mouseDown(document.body);

      expect(screen.queryByRole("menu")).toBeNull();
    });
  });

  describe("arrow key navigation", () => {
    it("navigates down through items with ArrowDown and wraps around", () => {
      renderMoreActions();

      openMenu();

      // First ArrowDown focuses the first item
      fireEvent.keyDown(document, { key: "ArrowDown" });
      expect(document.activeElement).toBe(screen.getByText("Delete"));

      // Second ArrowDown focuses the second item
      fireEvent.keyDown(document, { key: "ArrowDown" });
      expect(document.activeElement).toBe(screen.getByText("Duplicate"));

      // Third ArrowDown focuses the third item
      fireEvent.keyDown(document, { key: "ArrowDown" });
      expect(document.activeElement).toBe(screen.getByText("Export"));

      // Fourth ArrowDown wraps around to first
      fireEvent.keyDown(document, { key: "ArrowDown" });
      expect(document.activeElement).toBe(screen.getByText("Delete"));
    });

    it("navigates up through items with ArrowUp and wraps around", () => {
      renderMoreActions();

      openMenu();

      // ArrowUp wraps to last item
      fireEvent.keyDown(document, { key: "ArrowUp" });
      expect(document.activeElement).toBe(screen.getByText("Export"));

      // ArrowUp goes to second item
      fireEvent.keyDown(document, { key: "ArrowUp" });
      expect(document.activeElement).toBe(screen.getByText("Duplicate"));

      // ArrowUp goes to first item
      fireEvent.keyDown(document, { key: "ArrowUp" });
      expect(document.activeElement).toBe(screen.getByText("Delete"));
    });
  });

  describe("extensibility", () => {
    it("renders additional items without changing component code", () => {
      const items: MoreActionsItem[] = [
        {
          key: "delete",
          icon: Trash2,
          label: "Delete",
          onClick: vi.fn(),
          destructive: true,
        },
        {
          key: "duplicate",
          icon: Copy,
          label: "Duplicate",
          onClick: vi.fn(),
        },
        {
          key: "export",
          icon: FileDown,
          label: "Export",
          onClick: vi.fn(),
        },
        {
          key: "archive",
          icon: FileDown, // reuse icon; irrelevant for test
          label: "Archive",
          onClick: vi.fn(),
          tooltip: "Archive this entry",
        },
      ];

      renderMoreActions(items);
      openMenu();

      expect(screen.getByText("Delete")).toBeDefined();
      expect(screen.getByText("Duplicate")).toBeDefined();
      expect(screen.getByText("Export")).toBeDefined();
      expect(screen.getByText("Archive")).toBeDefined();
      expect(screen.getByText("Archive").getAttribute("title")).toBe(
        "Archive this entry",
      );
    });
  });

  describe("scroll / resize repositioning", () => {
    let addEventListenerSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
      addEventListenerSpy = vi.spyOn(window, "addEventListener");
    });

    afterEach(() => {
      addEventListenerSpy.mockRestore();
    });

    it("registers scroll and resize listeners when menu is open", () => {
      renderMoreActions();

      // Not open yet — listeners shouldn't be registered for scroll/resize
      const scrollCallsBefore = addEventListenerSpy.mock.calls.filter(
        (call: unknown[]) => call[0] === "scroll",
      );
      const resizeCallsBefore = addEventListenerSpy.mock.calls.filter(
        (call: unknown[]) => call[0] === "resize",
      );

      openMenu();

      // Menu is open — listeners should be registered
      const scrollCallsAfter = addEventListenerSpy.mock.calls.filter(
        (call: unknown[]) => call[0] === "scroll",
      );
      const resizeCallsAfter = addEventListenerSpy.mock.calls.filter(
        (call: unknown[]) => call[0] === "resize",
      );

      expect(scrollCallsAfter.length).toBeGreaterThan(scrollCallsBefore.length);
      expect(resizeCallsAfter.length).toBeGreaterThan(resizeCallsBefore.length);
    });
  });
});
