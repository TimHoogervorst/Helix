import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { IconStrip, type IconStripGroup } from "../IconStrip";

// ── Helpers ─────────────────────────────────────────────────────────────

function makeGroup(
  icons: Array<{ label: string; onClick?: () => void }>,
): IconStripGroup {
  return {
    icons: icons.map(({ label, onClick }) => ({
      icon: <span data-testid={`icon-${label}`}>{label[0]}</span>,
      label,
      onClick,
    })),
  };
}

// ── Tests ───────────────────────────────────────────────────────────────

describe("IconStrip", () => {
  // ── Decorative icons ─────────────────────────────────────────────────

  describe("decorative icons (no onClick)", () => {
    it("renders a decorative icon as a non-interactive element", () => {
      const groups = [makeGroup([{ label: "Logo" }])];
      render(<IconStrip groups={groups} />);

      const icon = screen.getByTestId("icon-Logo");
      expect(icon).toBeInTheDocument();

      // Should be inside a <span>, not a <button>
      const parent = icon.parentElement;
      expect(parent?.tagName).toBe("SPAN");
    });

    it("marks the decorative icon wrapper as aria-hidden", () => {
      const groups = [makeGroup([{ label: "Logo" }])];
      render(<IconStrip groups={groups} />);

      const parent = screen.getByTestId("icon-Logo").parentElement;
      // Purely decorative — hidden from assistive technology
      expect(parent?.getAttribute("aria-hidden")).toBe("true");
    });
  });

  // ── Clickable icons ──────────────────────────────────────────────────

  describe("clickable icons (with onClick)", () => {
    it("renders a clickable icon as a button", () => {
      const onClick = vi.fn();
      const groups = [makeGroup([{ label: "Home", onClick }])];
      render(<IconStrip groups={groups} />);

      const button = screen.getByRole("button", { name: "Home" });
      expect(button).toBeInTheDocument();
      expect(button).toHaveAttribute("title", "Home");
      expect(button).toHaveAttribute("aria-label", "Home");
    });

    it("calls onClick when the button is clicked", () => {
      const onClick = vi.fn();
      const groups = [makeGroup([{ label: "Home", onClick }])];
      render(<IconStrip groups={groups} />);

      fireEvent.click(screen.getByRole("button", { name: "Home" }));
      expect(onClick).toHaveBeenCalledTimes(1);
    });

    it("renders multiple clickable icons as separate buttons", () => {
      const onClick1 = vi.fn();
      const onClick2 = vi.fn();
      const groups = [
        makeGroup([
          { label: "Home", onClick: onClick1 },
          { label: "Settings", onClick: onClick2 },
        ]),
      ];
      render(<IconStrip groups={groups} />);

      const homeBtn = screen.getByRole("button", { name: "Home" });
      const settingsBtn = screen.getByRole("button", { name: "Settings" });

      fireEvent.click(homeBtn);
      expect(onClick1).toHaveBeenCalledTimes(1);
      expect(onClick2).not.toHaveBeenCalled();

      fireEvent.click(settingsBtn);
      expect(onClick2).toHaveBeenCalledTimes(1);
    });
  });

  // ── Groups and dividers ──────────────────────────────────────────────

  describe("groups and dividers", () => {
    it("renders a single group without dividers", () => {
      const groups = [makeGroup([{ label: "A" }, { label: "B" }])];
      const { container } = render(<IconStrip groups={groups} />);

      expect(screen.getByTestId("icon-A")).toBeInTheDocument();
      expect(screen.getByTestId("icon-B")).toBeInTheDocument();

      // No divider elements in a single-group IconStrip
      // (dividers are div.h-px between groups)
      expect(
        container.querySelector(".h-px"),
      ).toBeNull();
    });

    it("renders dividers between multiple groups", () => {
      const groups = [
        makeGroup([{ label: "HubA" }]),
        makeGroup([{ label: "WorkspaceA" }]),
        makeGroup([{ label: "WorkspaceB" }]),
      ];
      const { container } = render(<IconStrip groups={groups} />);

      // All icons should be present
      expect(screen.getByTestId("icon-HubA")).toBeInTheDocument();
      expect(screen.getByTestId("icon-WorkspaceA")).toBeInTheDocument();
      expect(screen.getByTestId("icon-WorkspaceB")).toBeInTheDocument();

      // Two dividers between three groups (gi > 0 → two dividers)
      const dividers = container.querySelectorAll(".h-px");
      expect(dividers).toHaveLength(2);
    });
  });

  // ── Mixed decorative and clickable icons ─────────────────────────────

  describe("mixed icons", () => {
    it("renders decorative and clickable icons in the same group", () => {
      const onClick = vi.fn();
      const groups = [
        {
          icons: [
            {
              icon: <span data-testid="icon-Logo">L</span>,
              label: "Logo",
              // no onClick — decorative
            },
            {
              icon: <span data-testid="icon-Home">H</span>,
              label: "Home",
              onClick,
            },
          ],
        },
      ];
      render(<IconStrip groups={groups} />);

      // Logo is decorative (no button)
      const logoParent = screen.getByTestId("icon-Logo").parentElement;
      expect(logoParent?.tagName).toBe("SPAN");

      // Home is a button
      const homeBtn = screen.getByRole("button", { name: "Home" });
      expect(homeBtn).toBeInTheDocument();

      fireEvent.click(homeBtn);
      expect(onClick).toHaveBeenCalledTimes(1);
    });
  });

  // ── Accessibility ────────────────────────────────────────────────────

  describe("accessibility", () => {
    it("has navigation role on the root container", () => {
      const groups = [makeGroup([{ label: "A" }])];
      render(<IconStrip groups={groups} />);

      expect(
        screen.getByRole("navigation", { name: "Icon strip" }),
      ).toBeInTheDocument();
    });

    it("each clickable icon has title and aria-label matching the label", () => {
      const groups = [makeGroup([{ label: "Dashboard", onClick: vi.fn() }])];
      render(<IconStrip groups={groups} />);

      const btn = screen.getByRole("button", { name: "Dashboard" });
      expect(btn).toHaveAttribute("title", "Dashboard");
      expect(btn).toHaveAttribute("aria-label", "Dashboard");
    });
  });
});
