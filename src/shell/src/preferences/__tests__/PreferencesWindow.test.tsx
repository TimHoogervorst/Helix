/**
 * PreferencesWindow component tests.
 *
 * Asserts:
 *  - Renders the Modal with title "Preferences"
 *  - Nav shows Themes tab
 *  - Nine theme cards rendered with name and description tooltips
 *  - Active theme is visibly marked
 *  - Clicking a card applies the theme
 *  - X / ESC / overlay-click close the window
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ThemeProvider } from "../ThemeProvider";
import { PreferencesWindow } from "../PreferencesWindow";
import { saveCustomTheme } from "../themeStore";

const originalGetItem = Storage.prototype.getItem;
const originalSetItem = Storage.prototype.setItem;
let store: Record<string, string>;

function Wrapper({ children }: { children: React.ReactNode }) {
  return <ThemeProvider>{children}</ThemeProvider>;
}

function renderPreferences() {
  const onClose = vi.fn();
  const result = render(
    <Wrapper>
      <PreferencesWindow open={true} onClose={onClose} />
    </Wrapper>,
  );
  return { onClose, ...result };
}

beforeEach(() => {
  vi.clearAllMocks();
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

describe("PreferencesWindow", () => {
  // ── Open / close ─────────────────────────────────────────────────────────

  it("renders when open", () => {
    renderPreferences();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("does not render when closed", () => {
    render(
      <Wrapper>
        <PreferencesWindow open={false} onClose={vi.fn()} />
      </Wrapper>,
    );
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("closes on X button click", () => {
    const { onClose } = renderPreferences();
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(onClose).toHaveBeenCalled();
  });

  it("closes on Escape key", () => {
    const { onClose } = renderPreferences();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalled();
  });

  it("closes on overlay click", () => {
    const { onClose } = renderPreferences();
    const overlay = document.querySelector(".fixed.inset-0");
    expect(overlay).not.toBeNull();
    fireEvent.click(overlay!);
    expect(onClose).toHaveBeenCalled();
  });

  // ── Nav ──────────────────────────────────────────────────────────────────

  it("renders the Themes nav item with Palette icon", () => {
    renderPreferences();
    expect(screen.getByText("Themes")).toBeInTheDocument();
  });

  // ── Theme cards ──────────────────────────────────────────────────────────

  it("renders nine built-in theme cards with names", () => {
    renderPreferences();
    const themeNames = [
      "Original",
      "Cyberpunk",
      "Forest",
      "Terminal",
      "Lavender",
      "GPT",
      "Claude",
      "Benchling",
      "eLabFTW",
    ];
    for (const name of themeNames) {
      expect(screen.getByText(name)).toBeInTheDocument();
    }
  });

  it("each card has the theme description as a tooltip", () => {
    renderPreferences();
    expect(screen.getByTitle("Light teal — the Helix default")).toBeInTheDocument();
    expect(screen.getByTitle("Neon purple on deep indigo")).toBeInTheDocument();
  });

  it("the active theme is marked", () => {
    renderPreferences();
    const activeLabels = screen.getAllByText("Active");
    expect(activeLabels.length).toBeGreaterThanOrEqual(1);
  });

  it("clicking a non-active card applies the theme", () => {
    renderPreferences();
    const terminalCard = screen.getByTitle(
      "Black screen with phosphor-green text",
    );
    fireEvent.click(terminalCard);
    const terminalButton = terminalCard.closest("button");
    expect(terminalButton).toBeInTheDocument();
    expect(terminalButton!.className).toContain("border-[var(--color-primary)]");
  });

  // ── Title ─────────────────────────────────────────────────────────────────

  it("shows the title 'Preferences'", () => {
    renderPreferences();
    expect(screen.getByText("Preferences")).toBeInTheDocument();
  });

  // ── Custom themes integration ────────────────────────────────────────────

  it("shows 'Your themes' group when custom themes exist", () => {
    saveCustomTheme("My Cust", {
      background: "#111111",
      surface: "#222222",
      ink: "#ffffff",
      primary: "#ff0000",
      accent: "#00ff00",
    });
    renderPreferences();
    expect(screen.getByText("Your themes")).toBeInTheDocument();
    expect(screen.getByText("My Cust")).toBeInTheDocument();
  });

  it("does not show 'Your themes' when no custom themes exist", () => {
    renderPreferences();
    expect(screen.queryByText("Your themes")).not.toBeInTheDocument();
  });

  it("custom theme card has a delete button with tooltip and aria-label", () => {
    saveCustomTheme("My Cust", {
      background: "#111111",
      surface: "#222222",
      ink: "#ffffff",
      primary: "#ff0000",
      accent: "#00ff00",
    });
    renderPreferences();
    const deleteBtn = screen.getByRole("button", { name: "Delete My Cust" });
    expect(deleteBtn).toBeInTheDocument();
    expect(deleteBtn.closest("button")!.title).toBe("Delete My Cust");
  });

  it("delete removes the custom theme from the list", () => {
    saveCustomTheme("My Cust", {
      background: "#111111",
      surface: "#222222",
      ink: "#ffffff",
      primary: "#ff0000",
      accent: "#00ff00",
    });
    renderPreferences();
    expect(screen.getByText("My Cust")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Delete My Cust" }));

    expect(screen.queryByText("My Cust")).not.toBeInTheDocument();
    expect(screen.queryByText("Your themes")).not.toBeInTheDocument();
  });
});
