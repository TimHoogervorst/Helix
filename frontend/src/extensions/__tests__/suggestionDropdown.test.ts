/**
 * Tests for the shared suggestion dropdown factory.
 *
 * Covers: popup lifecycle, positioning, item rendering, arrow-key
 * navigation, Enter/Escape, selection boundaries, empty state,
 * extra key handlers, and state cleanup.
 *
 * These tests are pure DOM — no TipTap, no React.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { createSuggestionDropdown } from "../suggestionDropdown";
import type {
  SuggestionProps,
  SuggestionKeyDownProps,
} from "@tiptap/suggestion";

// ── Test helpers ──────────────────────────────────────────────────────

interface TestItem {
  label: string;
}

function makeProps(
  overrides: Partial<SuggestionProps<TestItem>> = {},
): SuggestionProps<TestItem> {
  return {
    editor: {} as any,
    range: { from: 0, to: 0 },
    query: "",
    text: "",
    items: [],
    command: vi.fn() as any,
    decorationNode: null,
    clientRect: (() =>
      new DOMRect(
        200,
        100,
        200,
        20,
      )) as SuggestionProps<TestItem>["clientRect"],
    ...overrides,
  } as SuggestionProps<TestItem>;
}

function makeKeyDownProps(
  key: string,
  overrides: Partial<SuggestionKeyDownProps> = {},
): SuggestionKeyDownProps {
  return {
    view: {} as any,
    event: new KeyboardEvent("keydown", { key, bubbles: true }),
    range: { from: 0, to: 0 },
    ...overrides,
  };
}

interface DropdownOptions {
  popupClass: string;
  emptyClass: string;
  renderItem: (item: TestItem, i: number, isSelected: boolean) => string;
  onExtraKeyDown?: any;
}

function makeDropdown(overrides: Partial<DropdownOptions> = {}) {
  return createSuggestionDropdown<TestItem>({
    popupClass: "test-dropdown",
    emptyClass: "test-dropdown-item is-empty",
    renderItem: (item, _i, _isSelected) =>
      `<span class="test-label">${item.label}</span>`,
    ...overrides,
  })();
}

// ── Cleanup ───────────────────────────────────────────────────────────

function removeAllPopups() {
  for (const el of document.querySelectorAll(".test-dropdown")) {
    el.remove();
  }
}

afterEach(() => {
  removeAllPopups();
});

// ── Tests ─────────────────────────────────────────────────────────────

describe("suggestionDropdown", () => {
  // ── Popup lifecycle ────────────────────────────────────────────────

  describe("popup lifecycle", () => {
    it("creates popup on first onStart", () => {
      const dropdown = makeDropdown();
      dropdown.onStart(makeProps());
      const popup = document.querySelector(".test-dropdown");
      expect(popup).toBeTruthy();
      expect(popup!.tagName).toBe("DIV");
    });

    it("reuses the same popup across onStart calls", () => {
      const dropdown = makeDropdown();
      dropdown.onStart(makeProps());
      const popup1 = document.querySelector(".test-dropdown");
      dropdown.onStart(makeProps());
      const popup2 = document.querySelector(".test-dropdown");
      expect(popup1).toBe(popup2);
    });

    it("shows popup on onStart", () => {
      const dropdown = makeDropdown();
      dropdown.onStart(makeProps());
      const popup = document.querySelector(".test-dropdown") as HTMLElement;
      expect(popup.style.display).toBe("block");
    });
  });

  // ── Positioning ─────────────────────────────────────────────────────

  describe("positioning", () => {
    it("positions popup using clientRect on onStart", () => {
      const dropdown = makeDropdown();
      dropdown.onStart(
        makeProps({
          clientRect: (() => ({
            top: 42,
            left: 88,
            bottom: 60,
            right: 200,
            width: 112,
            height: 18,
          })) as any,
        }),
      );
      const popup = document.querySelector(".test-dropdown") as HTMLElement;
      expect(popup.style.top).toBe("64px"); // bottom + 4
      expect(popup.style.left).toBe("88px");
    });

    it("updates position on each onUpdate", () => {
      const dropdown = makeDropdown();
      dropdown.onStart(makeProps());
      dropdown.onUpdate(
        makeProps({
          clientRect: (() => ({
            top: 200,
            left: 300,
            bottom: 220,
            right: 500,
            width: 200,
            height: 20,
          })) as any,
        }),
      );
      const popup = document.querySelector(".test-dropdown") as HTMLElement;
      expect(popup.style.top).toBe("224px");
      expect(popup.style.left).toBe("300px");
    });

    it("does not throw when clientRect returns null", () => {
      const dropdown = makeDropdown();
      expect(() => {
        dropdown.onStart(makeProps({ clientRect: () => null }));
      }).not.toThrow();
    });
  });

  // ── Item rendering ──────────────────────────────────────────────────

  describe("item rendering", () => {
    it("renders items on onUpdate", () => {
      const dropdown = makeDropdown();
      dropdown.onStart(makeProps());
      dropdown.onUpdate(
        makeProps({
          items: [{ label: "Alpha" }, { label: "Beta" }, { label: "Gamma" }],
        }),
      );
      const popup = document.querySelector(".test-dropdown")!;
      const items = popup.querySelectorAll("[data-dropdown-item]");
      expect(items).toHaveLength(3);
      expect(items[0].textContent).toContain("Alpha");
      expect(items[1].textContent).toContain("Beta");
      expect(items[2].textContent).toContain("Gamma");
    });

    it("marks index 0 as selected initially", () => {
      const dropdown = makeDropdown();
      dropdown.onStart(makeProps());
      dropdown.onUpdate(
        makeProps({
          items: [{ label: "A" }, { label: "B" }],
        }),
      );
      const popup = document.querySelector(".test-dropdown")!;
      const first = popup.querySelector("[data-dropdown-item]") as HTMLElement;
      expect(first.classList.contains("is-selected")).toBe(true);
      const second = popup.querySelectorAll(
        "[data-dropdown-item]",
      )[1] as HTMLElement;
      expect(second.classList.contains("is-selected")).toBe(false);
    });

    it("shows empty state when items array is empty", () => {
      const dropdown = makeDropdown();
      dropdown.onStart(makeProps());
      dropdown.onUpdate(makeProps({ items: [] }));
      const popup = document.querySelector(".test-dropdown")!;
      expect(popup.textContent).toContain("No results");
      expect(popup.querySelector(".test-dropdown-item.is-empty")).toBeTruthy();
      expect(popup.querySelectorAll("[data-dropdown-item]")).toHaveLength(0);
    });

    it("calls renderItem with correct arguments", () => {
      const renderItem = vi.fn(
        (item: TestItem) => `<span>${item.label}</span>`,
      );
      const dropdown = makeDropdown({ renderItem });
      const items = [{ label: "X" }, { label: "Y" }];
      dropdown.onStart(makeProps());
      dropdown.onUpdate(makeProps({ items }));
      expect(renderItem).toHaveBeenCalledTimes(2);
      expect(renderItem).toHaveBeenCalledWith(items[0], 0, true); // first item, index 0, selected
      expect(renderItem).toHaveBeenCalledWith(items[1], 1, false); // second item, index 1, not selected
    });
  });

  // ── ArrowDown ───────────────────────────────────────────────────────

  describe("ArrowDown", () => {
    it("advances selection", () => {
      const dropdown = makeDropdown();
      dropdown.onStart(makeProps());
      dropdown.onUpdate(
        makeProps({ items: [{ label: "A" }, { label: "B" }, { label: "C" }] }),
      );
      dropdown.onKeyDown(makeKeyDownProps("ArrowDown"));
      const popup = document.querySelector(".test-dropdown")!;
      const items = popup.querySelectorAll("[data-dropdown-item]");
      expect(items[0].classList.contains("is-selected")).toBe(false);
      expect(items[1].classList.contains("is-selected")).toBe(true);
      expect(items[2].classList.contains("is-selected")).toBe(false);
    });

    it("stays at last item (does not wrap)", () => {
      const dropdown = makeDropdown();
      dropdown.onStart(makeProps());
      dropdown.onUpdate(makeProps({ items: [{ label: "A" }, { label: "B" }] }));
      // Navigate to last item
      dropdown.onKeyDown(makeKeyDownProps("ArrowDown")); // index 0 → 1
      // Try to go past last
      dropdown.onKeyDown(makeKeyDownProps("ArrowDown")); // should stay at 1
      const popup = document.querySelector(".test-dropdown")!;
      const items = popup.querySelectorAll("[data-dropdown-item]");
      expect(items[0].classList.contains("is-selected")).toBe(false);
      expect(items[1].classList.contains("is-selected")).toBe(true);
    });

    it("returns true to indicate handled", () => {
      const dropdown = makeDropdown();
      dropdown.onStart(makeProps());
      dropdown.onUpdate(makeProps({ items: [{ label: "A" }] }));
      const result = dropdown.onKeyDown(makeKeyDownProps("ArrowDown"));
      expect(result).toBe(true);
    });
  });

  // ── ArrowUp ─────────────────────────────────────────────────────────

  describe("ArrowUp", () => {
    it("decreases selection", () => {
      const dropdown = makeDropdown();
      dropdown.onStart(makeProps());
      dropdown.onUpdate(
        makeProps({ items: [{ label: "A" }, { label: "B" }, { label: "C" }] }),
      );
      // Move to index 2 first
      dropdown.onKeyDown(makeKeyDownProps("ArrowDown"));
      dropdown.onKeyDown(makeKeyDownProps("ArrowDown"));
      // Now move up
      dropdown.onKeyDown(makeKeyDownProps("ArrowUp"));
      const popup = document.querySelector(".test-dropdown")!;
      const items = popup.querySelectorAll("[data-dropdown-item]");
      expect(items[0].classList.contains("is-selected")).toBe(false);
      expect(items[1].classList.contains("is-selected")).toBe(true);
      expect(items[2].classList.contains("is-selected")).toBe(false);
    });

    it("stays at index 0 (does not wrap)", () => {
      const dropdown = makeDropdown();
      dropdown.onStart(makeProps());
      dropdown.onUpdate(makeProps({ items: [{ label: "A" }, { label: "B" }] }));
      // Already at 0, try to go up
      dropdown.onKeyDown(makeKeyDownProps("ArrowUp"));
      const popup = document.querySelector(".test-dropdown")!;
      const items = popup.querySelectorAll("[data-dropdown-item]");
      expect(items[0].classList.contains("is-selected")).toBe(true);
    });

    it("returns true to indicate handled", () => {
      const dropdown = makeDropdown();
      dropdown.onStart(makeProps());
      dropdown.onUpdate(makeProps({ items: [{ label: "A" }] }));
      const result = dropdown.onKeyDown(makeKeyDownProps("ArrowUp"));
      expect(result).toBe(true);
    });
  });

  // ── Enter ───────────────────────────────────────────────────────────

  describe("Enter", () => {
    it("calls command with the selected item", () => {
      const command = vi.fn();
      const items = [{ label: "Alpha" }, { label: "Beta" }];
      const dropdown = makeDropdown();
      dropdown.onStart(makeProps());
      dropdown.onUpdate(makeProps({ items, command: command as any }));
      // Select the second item
      dropdown.onKeyDown(makeKeyDownProps("ArrowDown"));
      dropdown.onKeyDown(makeKeyDownProps("Enter"));
      expect(command).toHaveBeenCalledTimes(1);
      expect(command).toHaveBeenCalledWith(items[1]);
    });

    it("is a no-op when items list is empty", () => {
      const command = vi.fn();
      const dropdown = makeDropdown();
      dropdown.onStart(makeProps());
      dropdown.onUpdate(makeProps({ items: [], command: command as any }));
      dropdown.onKeyDown(makeKeyDownProps("Enter"));
      expect(command).not.toHaveBeenCalled();
    });

    it("is a no-op when command is null", () => {
      const dropdown = makeDropdown();
      dropdown.onStart(makeProps());
      dropdown.onUpdate(
        makeProps({ items: [{ label: "A" }], command: null as any }),
      );
      expect(() => dropdown.onKeyDown(makeKeyDownProps("Enter"))).not.toThrow();
    });

    it("returns false when no items (lets TipTap handle)", () => {
      const dropdown = makeDropdown();
      dropdown.onStart(makeProps());
      dropdown.onUpdate(makeProps({ items: [] }));
      const result = dropdown.onKeyDown(makeKeyDownProps("Enter"));
      expect(result).toBe(false);
    });
  });

  // ── Escape ──────────────────────────────────────────────────────────

  describe("Escape", () => {
    it("hides popup", () => {
      const dropdown = makeDropdown();
      dropdown.onStart(makeProps());
      dropdown.onUpdate(makeProps({ items: [{ label: "A" }] }));
      dropdown.onKeyDown(makeKeyDownProps("Escape"));
      const popup = document.querySelector(".test-dropdown") as HTMLElement;
      expect(popup.style.display).toBe("none");
    });

    it("clears popup innerHTML", () => {
      const dropdown = makeDropdown();
      dropdown.onStart(makeProps());
      dropdown.onUpdate(makeProps({ items: [{ label: "A" }] }));
      dropdown.onKeyDown(makeKeyDownProps("Escape"));
      const popup = document.querySelector(".test-dropdown")!;
      expect(popup.innerHTML).toBe("");
    });

    it("returns true to indicate handled", () => {
      const dropdown = makeDropdown();
      dropdown.onStart(makeProps());
      dropdown.onUpdate(makeProps({ items: [{ label: "A" }] }));
      const result = dropdown.onKeyDown(makeKeyDownProps("Escape"));
      expect(result).toBe(true);
    });
  });

  // ── onExit cleanup ──────────────────────────────────────────────────

  describe("onExit", () => {
    it("hides popup", () => {
      const dropdown = makeDropdown();
      dropdown.onStart(makeProps());
      dropdown.onUpdate(makeProps({ items: [{ label: "A" }] }));
      dropdown.onExit();
      const popup = document.querySelector(".test-dropdown") as HTMLElement;
      expect(popup.style.display).toBe("none");
    });

    it("clears popup innerHTML", () => {
      const dropdown = makeDropdown();
      dropdown.onStart(makeProps());
      dropdown.onUpdate(makeProps({ items: [{ label: "A" }] }));
      dropdown.onExit();
      const popup = document.querySelector(".test-dropdown")!;
      expect(popup.innerHTML).toBe("");
    });

    it("resets selection to 0 after exit and new start", () => {
      const dropdown = makeDropdown();
      dropdown.onStart(makeProps());
      dropdown.onUpdate(makeProps({ items: [{ label: "A" }, { label: "B" }] }));
      // Navigate down
      dropdown.onKeyDown(makeKeyDownProps("ArrowDown"));
      // Exit
      dropdown.onExit();
      // New session — should start at 0
      dropdown.onStart(makeProps());
      dropdown.onUpdate(makeProps({ items: [{ label: "X" }, { label: "Y" }] }));
      const popup = document.querySelector(".test-dropdown")!;
      const items = popup.querySelectorAll("[data-dropdown-item]");
      expect(items[0].classList.contains("is-selected")).toBe(true);
      expect(items[1].classList.contains("is-selected")).toBe(false);
    });
  });

  // ── Extra key handlers ──────────────────────────────────────────────

  describe("onExtraKeyDown", () => {
    it("calls onExtraKeyDown before defaults", () => {
      const onExtraKeyDown = vi.fn(() => false);
      const dropdown = makeDropdown({
        onExtraKeyDown,
      });
      dropdown.onStart(makeProps());
      dropdown.onUpdate(makeProps({ items: [{ label: "A" }] }));
      dropdown.onKeyDown(makeKeyDownProps("ArrowDown"));
      expect(onExtraKeyDown).toHaveBeenCalled();
    });

    it("skips defaults when onExtraKeyDown returns true", () => {
      const onExtraKeyDown = vi.fn(() => true);
      const dropdown = makeDropdown({
        onExtraKeyDown,
      });
      dropdown.onStart(makeProps());
      dropdown.onUpdate(makeProps({ items: [{ label: "A" }, { label: "B" }] }));
      // ArrowDown returned true from extra, so default ArrowDown should not run
      dropdown.onKeyDown(makeKeyDownProps("ArrowDown"));
      // Selection should still be at 0 since the default didn't advance it
      const popup = document.querySelector(".test-dropdown")!;
      const items = popup.querySelectorAll("[data-dropdown-item]");
      expect(items[0].classList.contains("is-selected")).toBe(true);
    });

    it("passes state to onExtraKeyDown", () => {
      const onExtraKeyDown = vi.fn(() => false);
      const items = [{ label: "Foo" }, { label: "Bar" }];
      const command = vi.fn();
      const dropdown = makeDropdown({ onExtraKeyDown });
      dropdown.onStart(makeProps());
      dropdown.onUpdate(
        makeProps({ items, command: command as any, query: "test-query" }),
      );
      dropdown.onKeyDown(makeKeyDownProps("Tab"));
      expect(onExtraKeyDown).toHaveBeenCalledWith(
        expect.objectContaining({ event: expect.any(KeyboardEvent) }),
        {
          selectedIndex: 0,
          items,
          command,
          query: "test-query",
        },
      );
    });

    it("handles Tab via onExtraKeyDown", () => {
      const command = vi.fn();
      const items = [{ label: "Command" }];
      const onExtraKeyDown = vi.fn((_props, state) => {
        if (state.command && state.items[state.selectedIndex]) {
          state.command(state.items[state.selectedIndex]);
          return true;
        }
        return false;
      });
      const dropdown = makeDropdown({ onExtraKeyDown });
      dropdown.onStart(makeProps());
      dropdown.onUpdate(makeProps({ items, command: command as any }));
      dropdown.onKeyDown(makeKeyDownProps("Tab"));
      expect(command).toHaveBeenCalledWith(items[0]);
    });
  });

  // ── Unknown keys ────────────────────────────────────────────────────

  describe("unknown keys", () => {
    it("returns false for unhandled keys", () => {
      const dropdown = makeDropdown();
      dropdown.onStart(makeProps());
      dropdown.onUpdate(makeProps({ items: [{ label: "A" }] }));
      const result = dropdown.onKeyDown(makeKeyDownProps("a"));
      expect(result).toBe(false);
    });
  });

  // ── Multiple instances ──────────────────────────────────────────────

  describe("multiple instances", () => {
    it("each instance has independent state", () => {
      const dropdown1 = createSuggestionDropdown<TestItem>({
        popupClass: "test-dropdown",
        emptyClass: "test-dropdown-item is-empty",
        renderItem: (item) => `<span>${item.label}</span>`,
      })();
      const dropdown2 = createSuggestionDropdown<TestItem>({
        popupClass: "test-dropdown-2",
        emptyClass: "test-dropdown-2-item is-empty",
        renderItem: (item) => `<span>${item.label}</span>`,
      })();

      dropdown1.onStart(makeProps());
      dropdown1.onUpdate(
        makeProps({ items: [{ label: "One A" }, { label: "One B" }] }),
      );

      const clientRect2 = (() => ({
        top: 300,
        left: 100,
        bottom: 320,
        right: 200,
        width: 100,
        height: 20,
      })) as any;
      dropdown2.onStart(
        makeProps({
          items: [{ label: "Two A" }, { label: "Two B" }, { label: "Two C" }],
          clientRect: clientRect2,
        }),
      );
      dropdown2.onUpdate(
        makeProps({
          items: [{ label: "Two A" }, { label: "Two B" }, { label: "Two C" }],
          clientRect: clientRect2,
        }),
      );

      // Each popup is independent
      const popup1 = document.querySelector(".test-dropdown")!;
      const popup2 = document.querySelector(".test-dropdown-2")!;
      expect(popup1.querySelectorAll("[data-dropdown-item]")).toHaveLength(2);
      expect(popup2.querySelectorAll("[data-dropdown-item]")).toHaveLength(3);

      dropdown2.onExit();
      // Clean up second popup for afterEach
      const p2 = document.querySelector(".test-dropdown-2");
      if (p2) p2.remove();
    });
  });
});
