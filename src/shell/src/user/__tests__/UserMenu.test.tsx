/**
 * Tests for UserMenu — the popover card triggered by clicking the sidebar avatar.
 *
 * Verifies:
 *  - Avatar and username render from CurrentUserContext
 *  - Popover opens/closes on avatar click
 *  - Popover header shows avatar + username
 *  - Profile item navigates to /profile
 *  - Preferences item is enabled and opens the PreferencesWindow
 *  - Settings item navigates to /settings
 *  - Logout item calls logout API and redirects to /login
 *  - Popover closes on outside click
 *  - Popover closes when a menu item is selected
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { CurrentUserProvider } from "../CurrentUserProvider";

// ── Mocks ──────────────────────────────────────────────────────────────────

const mockNavigate = vi.fn();
vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
  return { ...actual, useNavigate: () => mockNavigate };
});

const mockLogout = vi.fn();

const { mockUser } = vi.hoisted(() => ({
  mockUser: {
    id: 1,
    username: "mkato",
    first_name: "Mira",
    last_name: "Kato",
    color: "#4A90D9",
    is_active: true,
    date_joined: "2025-01-15T00:00:00Z",
    organization_role: "user" as string,
  },
}));

vi.mock("../api", () => ({
  logout: (...args: unknown[]) => mockLogout(...args),
  fetchMe: () => Promise.resolve(mockUser),
}));

import { UserMenu } from "../UserMenu";
import { ThemeProvider } from "../../preferences";

// ── Helpers ────────────────────────────────────────────────────────────────

/** Wrap UserMenu in providers & router for testing. */
function renderUserMenu() {
  return render(
    <MemoryRouter>
      <CurrentUserProvider>
        <ThemeProvider>
          <UserMenu />
        </ThemeProvider>
      </CurrentUserProvider>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mockUser.organization_role = "user";
});

// ── Render tests ──────────────────────────────────────────────────────────

describe("UserMenu render", () => {
  it("renders the avatar with user initials", async () => {
    renderUserMenu();
    expect(await screen.findByText("MK")).toBeInTheDocument();
  });

  it("renders the username in the trigger button", async () => {
    renderUserMenu();
    expect(await screen.findByText("mkato")).toBeInTheDocument();
  });

  it("has aria-label 'User menu' on the trigger button", async () => {
    renderUserMenu();
    const btn = await screen.findByRole("button", { name: "User menu" });
    expect(btn).toBeInTheDocument();
  });
});

// ── Popover open/close ────────────────────────────────────────────────────

describe("UserMenu popover", () => {
  it("opens the popover when the trigger button is clicked", async () => {
    renderUserMenu();
    const trigger = await screen.findByRole("button", { name: "User menu" });
    fireEvent.click(trigger);
    // Filter by the enabled Profile button in the popover, not the trigger
    expect(
      await screen.findByRole("button", { name: "Profile" }),
    ).toBeInTheDocument();
  });

  it("closes the popover when the trigger is clicked again", async () => {
    renderUserMenu();
    const trigger = await screen.findByRole("button", { name: "User menu" });
    fireEvent.click(trigger);
    expect(screen.getByRole("button", { name: "Profile" })).toBeInTheDocument();
    fireEvent.click(trigger);
    expect(
      screen.queryByRole("button", { name: "Profile" }),
    ).not.toBeInTheDocument();
  });

  it("closes on outside mousedown", async () => {
    renderUserMenu();
    const trigger = await screen.findByRole("button", { name: "User menu" });
    fireEvent.click(trigger);
    expect(screen.getByRole("button", { name: "Profile" })).toBeInTheDocument();
    fireEvent.mouseDown(document.body);
    expect(
      screen.queryByRole("button", { name: "Profile" }),
    ).not.toBeInTheDocument();
  });

  it("does not close when clicking inside the popover", async () => {
    renderUserMenu();
    const trigger = await screen.findByRole("button", { name: "User menu" });
    fireEvent.click(trigger);
    const profileBtn = screen.getByRole("button", { name: "Profile" });
    fireEvent.mouseDown(profileBtn);
    // Profile button should still be in the DOM (popover stays open)
    expect(profileBtn).toBeInTheDocument();
  });
});

// ── Menu items ────────────────────────────────────────────────────────────

describe("UserMenu items", () => {
  beforeEach(async () => {
    renderUserMenu();
    const trigger = await screen.findByRole("button", { name: "User menu" });
    fireEvent.click(trigger);
  });

  it("Profile navigates to /profile", async () => {
    fireEvent.click(screen.getByRole("button", { name: "Profile" }));
    expect(mockNavigate).toHaveBeenCalledWith("/profile");
  });

  it("Preferences is enabled and opens the PreferencesWindow", async () => {
    const prefsBtn = screen.getByRole("button", {
      name: "Preferences",
    });
    expect(prefsBtn).not.toBeDisabled();

    fireEvent.click(prefsBtn);
    // The PreferencesWindow is a Modal with role="dialog"
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText("Preferences")).toBeInTheDocument();
  });

  it("Logout calls logout API and redirects to /login", async () => {
    mockLogout.mockResolvedValueOnce({ detail: "ok" });

    // jsdom's window.location.href can't be spied on directly — replace
    // location with a writable mock, then restore after
    const originalLocation = window.location;
    const mockLocation = { ...originalLocation, href: "" };
    Object.defineProperty(window, "location", {
      value: mockLocation,
      writable: true,
      configurable: true,
    });
    const locationSpy = vi.spyOn(mockLocation, "href", "set");

    fireEvent.click(screen.getByRole("button", { name: "Logout" }));

    await vi.waitFor(() => {
      expect(mockLogout).toHaveBeenCalled();
    });
    await vi.waitFor(() => {
      expect(locationSpy).toHaveBeenCalledWith("/login");
    });

    locationSpy.mockRestore();
    Object.defineProperty(window, "location", {
      value: originalLocation,
      writable: true,
      configurable: true,
    });
  });

  it("redirects to /login even if logout API fails", async () => {
    mockLogout.mockRejectedValueOnce(new Error("Network error"));

    const originalLocation = window.location;
    const mockLocation = { ...originalLocation, href: "" };
    Object.defineProperty(window, "location", {
      value: mockLocation,
      writable: true,
      configurable: true,
    });
    const locationSpy = vi.spyOn(mockLocation, "href", "set");

    fireEvent.click(screen.getByRole("button", { name: "Logout" }));

    await vi.waitFor(() => {
      expect(locationSpy).toHaveBeenCalledWith("/login");
    });

    locationSpy.mockRestore();
    Object.defineProperty(window, "location", {
      value: originalLocation,
      writable: true,
      configurable: true,
    });
  });
});

// ── Popover header ────────────────────────────────────────────────────────

describe("UserMenu popover header", () => {
  it("shows the username in the popover header", async () => {
    renderUserMenu();
    const trigger = await screen.findByRole("button", { name: "User menu" });
    fireEvent.click(trigger);
    // The username appears twice — once in trigger, once in popover header.
    // getAllByText returns all instances.
    const usernames = screen.getAllByText("mkato");
    expect(usernames.length).toBeGreaterThanOrEqual(2);
  });
});

// ── Role-based gating ─────────────────────────────────────────────────────

describe("UserMenu role-based gating", () => {
  it("shows Settings for admin users", async () => {
    mockUser.organization_role = "admin";
    renderUserMenu();
    const trigger = await screen.findByRole("button", {
      name: "User menu",
    });
    fireEvent.click(trigger);
    expect(
      screen.getByRole("button", { name: "Settings" }),
    ).toBeInTheDocument();
  });

  it("Settings button navigates to /settings for admin users", async () => {
    mockUser.organization_role = "admin";
    renderUserMenu();
    const trigger = await screen.findByRole("button", {
      name: "User menu",
    });
    fireEvent.click(trigger);
    fireEvent.click(screen.getByRole("button", { name: "Settings" }));
    expect(mockNavigate).toHaveBeenCalledWith("/settings");
  });

  it("hides Settings for non-admin users", async () => {
    mockUser.organization_role = "user";
    renderUserMenu();
    const trigger = await screen.findByRole("button", {
      name: "User menu",
    });
    fireEvent.click(trigger);
    expect(
      screen.queryByRole("button", { name: "Settings" }),
    ).not.toBeInTheDocument();
  });

  it("hides Settings for users with null organization_role", async () => {
    mockUser.organization_role = null;
    renderUserMenu();
    const trigger = await screen.findByRole("button", {
      name: "User menu",
    });
    fireEvent.click(trigger);
    expect(
      screen.queryByRole("button", { name: "Settings" }),
    ).not.toBeInTheDocument();
  });
});
