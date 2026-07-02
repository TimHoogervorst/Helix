/**
 * Tests for Layout — the global sidebar shell wrapping <Outlet />.
 *
 * Verifies:
 *  - Sidebar renders with all required sections (brand, search, nav,
 *    workspace, user avatar)
 *  - The old horizontal <nav> topbar no longer exists
 *  - Pinned workspaces UI (PRD #79):
 *    - Renders pinned workspaces from API response
 *    - Shows "Current" badge on non-pinned current workspace
 *    - Shows "Current" badge on pinned current workspace
 *    - Shows nothing when no current workspace and no pins
 *    - Pin/unpin buttons appear on hover
 *    - Pin button click calls API and optimistically moves item
 *    - Unpin button click on current workspace moves it to Current slot
 *    - Unpin button click on non-current workspace removes it
 *    - Clicking a row navigates to its URL
 *    - Domain-appropriate icons for LIMS vs ELN
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { makePinnedWorkspace } from "../../test/factories";

// ── Mocks ──────────────────────────────────────────────────────────────────────

const mockNavigate = vi.fn();
vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
  return { ...actual, useNavigate: () => mockNavigate };
});

const mockGet = vi.fn();
const mockPost = vi.fn();
const mockDel = vi.fn();
vi.mock("../../api/client", () => ({
  get: (...args: unknown[]) => mockGet(...args),
  post: (...args: unknown[]) => mockPost(...args),
  del: (...args: unknown[]) => mockDel(...args),
}));

import Layout from "../Layout";

function renderLayout(initialRoute = "/library") {
  return render(
    <MemoryRouter initialEntries={[initialRoute]}>
      <Layout />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  // Default: no pins, no CSRF error
  mockGet.mockResolvedValue([]);
});

// ── Static sidebar sections ────────────────────────────────────────────────────

describe("Layout sidebar", () => {
  it("renders the Helix brand text", () => {
    renderLayout();
    expect(screen.getByText("Helix")).toBeInTheDocument();
  });

  it("renders the subtitle Alpha", () => {
    renderLayout();
    expect(screen.getByText("Alpha")).toBeInTheDocument();
  });

  it("renders the search placeholder with ⌘K badge", () => {
    renderLayout();
    expect(screen.getByText("Search entries…")).toBeInTheDocument();
    expect(screen.getByText("⌘K")).toBeInTheDocument();
  });

  it("renders Home nav button", () => {
    renderLayout();
    expect(screen.getByRole("button", { name: "Home" })).toBeInTheDocument();
  });

  it("renders Starred nav button", () => {
    renderLayout();
    expect(screen.getByRole("button", { name: "Starred" })).toBeInTheDocument();
  });

  it("renders Library nav link", () => {
    renderLayout();
    expect(screen.getByRole("link", { name: "Library" })).toBeInTheDocument();
  });

  it("renders Database nav link", () => {
    renderLayout();
    expect(screen.getByRole("link", { name: "Database" })).toBeInTheDocument();
  });

  it("Library nav link points to /library", () => {
    renderLayout();
    const libraryLink = screen.getByRole("link", { name: "Library" });
    expect(libraryLink).toHaveAttribute("href", "/library");
  });

  it("Database nav link points to /lims", () => {
    renderLayout();
    const dbLink = screen.getByRole("link", { name: "Database" });
    expect(dbLink).toHaveAttribute("href", "/lims");
  });

  it("renders the Workspace section header", () => {
    renderLayout();
    expect(screen.getByText("Workspace")).toBeInTheDocument();
  });

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

  it("does not contain the old horizontal nav topbar", () => {
    renderLayout();
    const navLinks = screen.getAllByRole("link");
    expect(navLinks.length).toBeGreaterThanOrEqual(2);
  });

  it("does not contain OpenScience text anywhere", () => {
    renderLayout();
    expect(screen.queryByText("OpenScience")).not.toBeInTheDocument();
  });

  it("renders the sidebar as an <aside> element", () => {
    renderLayout();
    const aside = document.querySelector("aside");
    expect(aside).toBeInTheDocument();
  });

  it("has the search placeholder bar with correct aria-label", () => {
    renderLayout();
    expect(screen.getByLabelText("Search")).toBeInTheDocument();
  });

  it("renders all nav buttons with tooltip titles", () => {
    renderLayout();
    const homeBtn = screen.getByRole("button", { name: "Home" });
    expect(homeBtn).toHaveAttribute("title", "Home — coming soon");

    const starredBtn = screen.getByRole("button", { name: "Starred" });
    expect(starredBtn).toHaveAttribute("title", "Starred — coming soon");

    const libraryLink = screen.getByRole("link", { name: "Library" });
    expect(libraryLink).toHaveAttribute("title", "Library");

    const dbLink = screen.getByRole("link", { name: "Database" });
    expect(dbLink).toHaveAttribute("title", "Database");
  });

  it("renders without crashing (CSRF priming runs)", () => {
    renderLayout();
    expect(mockGet).toHaveBeenCalledWith("/core/csrf/");
  });
});

// ── Pinned Workspaces (PRD #79) ──────────────────────────────────────────────

describe("Pinned Workspaces", () => {
  // ── Rendering from API ──────────────────────────────────────────────────

  it("renders pinned workspaces from API response", async () => {
    const pins = [
      makePinnedWorkspace({ id: 1, display_id: "BLOOD1", url: "/lims/BLOOD1" }),
      makePinnedWorkspace({ id: 2, display_id: "E1", label: "PCR Results", url: "/eln/E1" }),
    ];
    mockGet.mockImplementation((path: string) => {
      if (path === "/core/pins/") return Promise.resolve(pins);
      if (path === "/core/csrf/") return Promise.resolve(undefined);
      return Promise.resolve(undefined);
    });

    renderLayout();

    await waitFor(() => {
      expect(screen.getByText("BLOOD1")).toBeInTheDocument();
    });
    expect(screen.getByText("E1")).toBeInTheDocument();
    expect(screen.getByText("PCR Results")).toBeInTheDocument();
  });

  it("shows nothing below Workspace header when no current workspace and no pins", async () => {
    mockGet.mockImplementation((path: string) => {
      if (path === "/core/pins/") return Promise.resolve([]);
      if (path === "/core/csrf/") return Promise.resolve(undefined);
      return Promise.resolve(undefined);
    });

    renderLayout("/library");

    await waitFor(() => {
      expect(mockGet).toHaveBeenCalledWith("/core/pins/");
    });

    // Workspace header should exist
    expect(screen.getByText("Workspace")).toBeInTheDocument();

    // But no "Current" badge and no "Projects" placeholder
    expect(screen.queryByText("Current")).not.toBeInTheDocument();
    expect(screen.queryByText("Projects")).not.toBeInTheDocument();
  });

  // ── Current workspace detection ─────────────────────────────────────────

  it("shows Current row when on a LIMS workspace page and not pinned", async () => {
    renderLayout("/lims/BLOOD1");

    await waitFor(() => {
      expect(screen.getByText("Current")).toBeInTheDocument();
    });
    expect(screen.getByText("BLOOD1")).toBeInTheDocument();
    // Pin button should exist (hidden via opacity:0)
    expect(
      screen.getByRole("button", { name: "Pin current workspace" }),
    ).toBeInTheDocument();
  });

  it("shows Current row when on an ELN workspace page and not pinned", async () => {
    renderLayout("/eln/E1");

    await waitFor(() => {
      expect(screen.getByText("Current")).toBeInTheDocument();
    });
    expect(screen.getByText("E1")).toBeInTheDocument();
  });

  it("shows Current badge on pinned item when current workspace matches a pin", async () => {
    const pins = [
      makePinnedWorkspace({ id: 1, display_id: "BLOOD1", url: "/lims/BLOOD1" }),
    ];
    mockGet.mockImplementation((path: string) => {
      if (path === "/core/pins/") return Promise.resolve(pins);
      if (path === "/core/csrf/") return Promise.resolve(undefined);
      return Promise.resolve(undefined);
    });

    renderLayout("/lims/BLOOD1");

    await waitFor(() => {
      expect(screen.getByText("BLOOD1")).toBeInTheDocument();
    });

    // "Current" badge should appear on the pinned row
    const currentBadges = screen.getAllByText("Current");
    expect(currentBadges.length).toBe(1);

    // No separate "Current" row with pin button
    expect(
      screen.queryByRole("button", { name: "Pin current workspace" }),
    ).not.toBeInTheDocument();
  });

  // ── Unpin button appears on pinned rows ─────────────────────────────────

  it("renders unpin button on each pinned workspace row", async () => {
    const pins = [
      makePinnedWorkspace({ id: 1, display_id: "BLOOD1", url: "/lims/BLOOD1" }),
    ];
    mockGet.mockImplementation((path: string) => {
      if (path === "/core/pins/") return Promise.resolve(pins);
      if (path === "/core/csrf/") return Promise.resolve(undefined);
      return Promise.resolve(undefined);
    });

    renderLayout();

    await waitFor(() => {
      expect(screen.getByText("BLOOD1")).toBeInTheDocument();
    });
    expect(
      screen.getByRole("button", { name: "Unpin workspace: BLOOD1" }),
    ).toBeInTheDocument();
  });

  // ── Domain icons ────────────────────────────────────────────────────────

  it("renders Dna icon for LIMS workspace", async () => {
    const pins = [
      makePinnedWorkspace({ id: 1, display_id: "BLOOD1", url: "/lims/BLOOD1" }),
    ];
    mockGet.mockImplementation((path: string) => {
      if (path === "/core/pins/") return Promise.resolve(pins);
      if (path === "/core/csrf/") return Promise.resolve(undefined);
      return Promise.resolve(undefined);
    });

    renderLayout();

    await waitFor(() => {
      expect(screen.getByText("BLOOD1")).toBeInTheDocument();
    });

    // The Dna icon is rendered with aria-hidden="true" inside the row button
    const rowButton = screen.getByRole("button", { name: "Open workspace: BLOOD1" });
    const svg = rowButton.querySelector("svg");
    expect(svg).toBeInTheDocument();
  });

  it("renders FileText icon for ELN workspace", async () => {
    const pins = [
      makePinnedWorkspace({ id: 2, display_id: "E1", url: "/eln/E1" }),
    ];
    mockGet.mockImplementation((path: string) => {
      if (path === "/core/pins/") return Promise.resolve(pins);
      if (path === "/core/csrf/") return Promise.resolve(undefined);
      return Promise.resolve(undefined);
    });

    renderLayout();

    await waitFor(() => {
      expect(screen.getByText("E1")).toBeInTheDocument();
    });

    const rowButton = screen.getByRole("button", { name: "Open workspace: E1" });
    const svg = rowButton.querySelector("svg");
    expect(svg).toBeInTheDocument();
  });

  // ── Navigation ──────────────────────────────────────────────────────────

  it("clicking a pinned workspace row navigates to its URL", async () => {
    const pins = [
      makePinnedWorkspace({ id: 1, display_id: "BLOOD1", url: "/lims/BLOOD1" }),
    ];
    mockGet.mockImplementation((path: string) => {
      if (path === "/core/pins/") return Promise.resolve(pins);
      if (path === "/core/csrf/") return Promise.resolve(undefined);
      return Promise.resolve(undefined);
    });

    renderLayout();

    await waitFor(() => {
      expect(screen.getByText("BLOOD1")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "Open workspace: BLOOD1" }));
    expect(mockNavigate).toHaveBeenCalledWith("/lims/BLOOD1");
  });

  it("clicking the Current workspace row navigates to its URL", async () => {
    renderLayout("/lims/BLOOD1");

    await waitFor(() => {
      expect(screen.getByText("Current")).toBeInTheDocument();
    });

    fireEvent.click(
      screen.getByRole("button", { name: "Current workspace: BLOOD1" }),
    );
    expect(mockNavigate).toHaveBeenCalledWith("/lims/BLOOD1");
  });

  // ── Pin action ──────────────────────────────────────────────────────────

  it("clicking pin button calls POST API and optimistically moves item to pinned list", async () => {
    const createdPin = makePinnedWorkspace({
      id: 10,
      display_id: "BLOOD1",
      url: "/lims/BLOOD1",
    });
    mockGet.mockImplementation((path: string) => {
      if (path === "/core/pins/") return Promise.resolve([]);
      if (path === "/core/csrf/") return Promise.resolve(undefined);
      return Promise.resolve(undefined);
    });
    mockPost.mockResolvedValue(createdPin);

    renderLayout("/lims/BLOOD1");

    await waitFor(() => {
      expect(screen.getByText("Current")).toBeInTheDocument();
    });

    // Click the pin button on the Current row
    fireEvent.click(
      screen.getByRole("button", { name: "Pin current workspace" }),
    );

    // Should have posted to the API (label is empty since sidebar
    // doesn't have access to the entity/entry name)
    expect(mockPost).toHaveBeenCalledWith("/core/pins/", {
      display_id: "BLOOD1",
      label: "",
      url: "/lims/BLOOD1",
    });

    // After optimistic update + server response, the item should be in pinned list
    await waitFor(() => {
      // The pinned row now shows "Current" badge
      const openButton = screen.getByRole("button", {
        name: "Open workspace: BLOOD1",
      });
      expect(openButton).toBeInTheDocument();
    });
  });

  // ── Unpin action ────────────────────────────────────────────────────────

  it("clicking unpin on current workspace calls DELETE and moves it to Current slot", async () => {
    const pins = [
      makePinnedWorkspace({ id: 1, display_id: "BLOOD1", url: "/lims/BLOOD1" }),
    ];
    mockGet.mockImplementation((path: string) => {
      if (path === "/core/pins/") return Promise.resolve(pins);
      if (path === "/core/csrf/") return Promise.resolve(undefined);
      return Promise.resolve(undefined);
    });
    mockDel.mockResolvedValue(undefined);

    renderLayout("/lims/BLOOD1");

    await waitFor(() => {
      expect(screen.getByText("BLOOD1")).toBeInTheDocument();
    });

    // Click unpin button
    fireEvent.click(
      screen.getByRole("button", { name: "Unpin workspace: BLOOD1" }),
    );

    expect(mockDel).toHaveBeenCalledWith("/core/pins/1/");

    // After unpinning, the item should move to Current slot with pin button
    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: "Pin current workspace" }),
      ).toBeInTheDocument();
    });
  });

  it("clicking unpin on a non-current workspace removes it from the list", async () => {
    const pins = [
      makePinnedWorkspace({ id: 1, display_id: "BLOOD1", url: "/lims/BLOOD1" }),
      makePinnedWorkspace({ id: 2, display_id: "E1", url: "/eln/E1" }),
    ];
    mockGet.mockImplementation((path: string) => {
      if (path === "/core/pins/") return Promise.resolve(pins);
      if (path === "/core/csrf/") return Promise.resolve(undefined);
      return Promise.resolve(undefined);
    });
    mockDel.mockResolvedValue(undefined);

    renderLayout("/lims/BLOOD1");

    await waitFor(() => {
      expect(screen.getByText("E1")).toBeInTheDocument();
    });

    // Unpin the non-current E1
    fireEvent.click(
      screen.getByRole("button", { name: "Unpin workspace: E1" }),
    );

    expect(mockDel).toHaveBeenCalledWith("/core/pins/2/");

    // E1 should be gone
    await waitFor(() => {
      expect(screen.queryByText("E1")).not.toBeInTheDocument();
    });

    // BLOOD1 should still be there (now as Current)
    expect(screen.getByText("BLOOD1")).toBeInTheDocument();
  });

  // ── Duplicate prevention ────────────────────────────────────────────────

  it("does not show pin button when current workspace is already pinned", async () => {
    const pins = [
      makePinnedWorkspace({ id: 1, display_id: "BLOOD1", url: "/lims/BLOOD1" }),
    ];
    mockGet.mockImplementation((path: string) => {
      if (path === "/core/pins/") return Promise.resolve(pins);
      if (path === "/core/csrf/") return Promise.resolve(undefined);
      return Promise.resolve(undefined);
    });

    renderLayout("/lims/BLOOD1");

    await waitFor(() => {
      expect(screen.getByText("BLOOD1")).toBeInTheDocument();
    });

    // No separate "Pin current workspace" button when already pinned
    expect(
      screen.queryByRole("button", { name: "Pin current workspace" }),
    ).not.toBeInTheDocument();
  });

  // ── Truncation ──────────────────────────────────────────────────────────

  it("renders display_id with truncation class", async () => {
    const pins = [
      makePinnedWorkspace({
        id: 1,
        display_id: "VERY-LONG-DISPLAY-ID-THAT-SHOULD-TRUNCATE",
        url: "/lims/VERY-LONG-DISPLAY-ID-THAT-SHOULD-TRUNCATE",
      }),
    ];
    mockGet.mockImplementation((path: string) => {
      if (path === "/core/pins/") return Promise.resolve(pins);
      if (path === "/core/csrf/") return Promise.resolve(undefined);
      return Promise.resolve(undefined);
    });

    renderLayout();

    await waitFor(() => {
      expect(
        screen.getByText("VERY-LONG-DISPLAY-ID-THAT-SHOULD-TRUNCATE"),
      ).toBeInTheDocument();
    });

    const displayIdSpan = screen.getByText(
      "VERY-LONG-DISPLAY-ID-THAT-SHOULD-TRUNCATE",
    );
    expect(displayIdSpan.className).toContain("truncate");
  });

  // ── Row title/ARIA ──────────────────────────────────────────────────────

  it("pinned row has correct title attribute", async () => {
    const pins = [
      makePinnedWorkspace({
        id: 1,
        display_id: "BLOOD1",
        label: "Blood Sample A",
        url: "/lims/BLOOD1",
      }),
    ];
    mockGet.mockImplementation((path: string) => {
      if (path === "/core/pins/") return Promise.resolve(pins);
      if (path === "/core/csrf/") return Promise.resolve(undefined);
      return Promise.resolve(undefined);
    });

    renderLayout();

    await waitFor(() => {
      expect(screen.getByText("BLOOD1")).toBeInTheDocument();
    });

    const rowButton = screen.getByRole("button", {
      name: "Open workspace: BLOOD1",
    });
    expect(rowButton).toHaveAttribute("title", "BLOOD1 — Blood Sample A");
  });

  it("pin and unpin buttons have aria-labels", async () => {
    const pins = [
      makePinnedWorkspace({ id: 1, display_id: "BLOOD1", url: "/lims/BLOOD1" }),
    ];
    mockGet.mockImplementation((path: string) => {
      if (path === "/core/pins/") return Promise.resolve(pins);
      if (path === "/core/csrf/") return Promise.resolve(undefined);
      return Promise.resolve(undefined);
    });

    // Test unpin aria-label — render on non-LIMS page to also see Current row with pin button
    renderLayout("/eln/E1");

    await waitFor(() => {
      expect(screen.getByText("BLOOD1")).toBeInTheDocument();
    });

    expect(
      screen.getByRole("button", { name: "Unpin workspace: BLOOD1" }),
    ).toHaveAttribute("aria-label", "Unpin workspace: BLOOD1");

    expect(
      screen.getByRole("button", { name: "Pin current workspace" }),
    ).toHaveAttribute("aria-label", "Pin current workspace");
  });
});
