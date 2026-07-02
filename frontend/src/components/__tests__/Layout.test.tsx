/**
 * Tests for Layout — the global sidebar shell wrapping <Outlet />.
 *
 * Verifies:
 *  - Sidebar renders with all required sections (brand, search, nav,
 *    workspace, user avatar)
 *  - The old horizontal <nav> topbar no longer exists
 *  - The brand text "Helix" is present
 *  - Navigation placeholder buttons exist
 *  - The user avatar shows "MK" initials
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

// ── Mocks ──────────────────────────────────────────────────────────────────────

const mockGet = vi.fn().mockResolvedValue(undefined);
vi.mock("../../api/client", () => ({
  get: (...args: unknown[]) => mockGet(...args),
}));

import Layout from "../Layout";

function renderLayout() {
  return render(
    <MemoryRouter>
      <Layout />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  mockGet.mockClear();
});

describe("Layout sidebar", () => {
  // ── Brand ──────────────────────────────────────────────────────────────

  it("renders the Helix brand text", () => {
    renderLayout();
    expect(screen.getByText("Helix")).toBeInTheDocument();
  });

  it("renders the subtitle Alpha", () => {
    renderLayout();
    expect(screen.getByText("Alpha")).toBeInTheDocument();
  });

  // ── Search placeholder ─────────────────────────────────────────────────

  it("renders the search placeholder with ⌘K badge", () => {
    renderLayout();
    expect(screen.getByText("Search entries…")).toBeInTheDocument();
    expect(screen.getByText("⌘K")).toBeInTheDocument();
  });

  // ── Navigation ─────────────────────────────────────────────────────────

  it("renders Home nav button", () => {
    renderLayout();
    expect(
      screen.getByRole("button", { name: "Home" }),
    ).toBeInTheDocument();
  });

  it("renders Starred nav button", () => {
    renderLayout();
    expect(
      screen.getByRole("button", { name: "Starred" }),
    ).toBeInTheDocument();
  });

  it("renders Inventory nav button", () => {
    renderLayout();
    expect(
      screen.getByRole("button", { name: "Inventory" }),
    ).toBeInTheDocument();
  });

  // ── Workspace section ──────────────────────────────────────────────────

  it("renders the Workspace section header", () => {
    renderLayout();
    expect(screen.getByText("Workspace")).toBeInTheDocument();
  });

  it("renders a workspace tree placeholder", () => {
    renderLayout();
    expect(screen.getByText("Projects")).toBeInTheDocument();
  });

  // ── User avatar ────────────────────────────────────────────────────────

  it("renders the user initials MK", () => {
    renderLayout();
    expect(screen.getByText("MK")).toBeInTheDocument();
  });

  it("renders the user name", () => {
    renderLayout();
    expect(screen.getByText("Dr. Mira Kato")).toBeInTheDocument();
  });

  it("renders the user subtitle", () => {
    renderLayout();
    expect(screen.getByText("Molecular Bio · Lab 3B")).toBeInTheDocument();
  });

  // ── Removal of old topbar ──────────────────────────────────────────────

  it("does not contain the old horizontal nav topbar", () => {
    renderLayout();
    // The <aside> is the only landmark navigation region; no old <nav>
    // topbar element should exist.
    const oldNavLinks = screen.queryAllByRole("link");
    // No Link-based nav items should exist (sidebar uses buttons instead)
    expect(oldNavLinks).toHaveLength(0);
  });

  it("does not contain OpenScience text anywhere", () => {
    renderLayout();
    expect(screen.queryByText("OpenScience")).not.toBeInTheDocument();
  });

  // ── Sidebar structure ──────────────────────────────────────────────────

  it("renders the sidebar as an <aside> element", () => {
    renderLayout();
    // The sidebar is the first <aside> in the document
    const aside = document.querySelector("aside");
    expect(aside).toBeInTheDocument();
  });

  it("has the search placeholder bar with correct aria-label", () => {
    renderLayout();
    expect(
      screen.getByLabelText("Search"),
    ).toBeInTheDocument();
  });

  it("renders all nav buttons with tooltip titles", () => {
    renderLayout();
    const homeBtn = screen.getByRole("button", { name: "Home" });
    expect(homeBtn).toHaveAttribute("title", "Home — coming soon");

    const starredBtn = screen.getByRole("button", { name: "Starred" });
    expect(starredBtn).toHaveAttribute("title", "Starred — coming soon");

    const inventoryBtn = screen.getByRole("button", { name: "Inventory" });
    expect(inventoryBtn).toHaveAttribute("title", "Inventory — coming soon");
  });

  // ── ReferenceProvider is still used ────────────────────────────────────

  it("renders without crashing (CSRF priming runs)", () => {
    renderLayout();
    expect(mockGet).toHaveBeenCalledWith("/core/csrf/");
  });
});
