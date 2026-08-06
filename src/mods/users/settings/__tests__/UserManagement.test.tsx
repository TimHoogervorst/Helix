import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import UserManagement from "../UserManagement";

const mockGet = vi.fn();
const mockPost = vi.fn();
const mockPatch = vi.fn();
const mockDel = vi.fn();

vi.mock("../../../../shell/src/api/client", () => ({
  get: (...args: unknown[]) => mockGet(...args),
  post: (...args: unknown[]) => mockPost(...args),
  patch: (...args: unknown[]) => mockPatch(...args),
  del: (...args: unknown[]) => mockDel(...args),
}));

const user1 = {
  id: 1,
  username: "alice",
  email: "alice@example.com",
  first_name: "Alice",
  last_name: "Smith",
  color: "#4A90D9",
  is_active: true,
  date_joined: "2025-06-15T00:00:00Z",
  profile: {},
  affiliations: [],
  publications: [],
  recognitions: [],
};

const user2 = {
  id: 2,
  username: "bob",
  email: "bob@example.com",
  first_name: "Bob",
  last_name: "Jones",
  color: "#E06C75",
  is_active: false,
  date_joined: "2025-07-01T00:00:00Z",
  profile: {},
  affiliations: [],
  publications: [],
  recognitions: [],
};

describe("UserManagement", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGet.mockImplementation((url: string) => {
      if (url === "/core/users/") {
        return Promise.resolve([user1, user2]);
      }
      if (url === "/core/settings/allow_self_registration/") {
        return Promise.resolve({ id: 1, key: "allow_self_registration", value: false });
      }
      return Promise.reject(new Error("Unknown URL"));
    });
  });

  it("shows loading state initially", () => {
    mockGet.mockReturnValue(new Promise(() => {}));
    render(<UserManagement />);
    expect(screen.getByText("Loading users…")).toBeInTheDocument();
  });

  it("renders hero header after loading", async () => {
    render(<UserManagement />);
    await waitFor(() => {
      expect(
        screen.getAllByText("Users").length,
      ).toBeGreaterThanOrEqual(1);
    });
    expect(screen.getByText("user management")).toBeInTheDocument();
    expect(
      screen.getByText(
        "Manage user accounts, create new users, and control self-registration settings.",
      ),
    ).toBeInTheDocument();
  });

  it("renders master list with user data", async () => {
    render(<UserManagement />);
    await waitFor(() => {
      expect(screen.getByText("alice")).toBeInTheDocument();
    });
    expect(screen.getByText("bob")).toBeInTheDocument();
    const emails = screen.getAllByText("alice@example.com");
    expect(emails.length).toBe(1);
    const bobEmails = screen.getAllByText("bob@example.com");
    expect(bobEmails.length).toBe(1);
  });

  it("shows empty state when no users exist", async () => {
    mockGet.mockImplementation((url: string) => {
      if (url === "/core/users/") {
        return Promise.resolve([]);
      }
      if (url === "/core/settings/allow_self_registration/") {
        return Promise.resolve({ id: 1, key: "allow_self_registration", value: false });
      }
      return Promise.reject(new Error("Unknown URL"));
    });

    render(<UserManagement />);
    await waitFor(() => {
      expect(screen.getAllByText("No users found.").length).toBeGreaterThanOrEqual(1);
    });
  });

  it("shows error state on API failure", async () => {
    mockGet.mockImplementation((url: string) => {
      if (url === "/core/settings/allow_self_registration/") {
        return Promise.resolve({ id: 1, key: "allow_self_registration", value: false });
      }
      return Promise.reject(new Error("Network error"));
    });

    render(<UserManagement />);
    await waitFor(() => {
      expect(screen.getByText("Network error")).toBeInTheDocument();
    });
  });

  it("shows create user form when + New User button is clicked", async () => {
    render(<UserManagement />);
    await waitFor(() => {
      expect(screen.getByText("alice")).toBeInTheDocument();
    });

    expect(screen.queryByText("Username")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "+ New User" }));

    await waitFor(() => {
      expect(screen.getByText("Username")).toBeInTheDocument();
    });
    expect(screen.getByPlaceholderText("e.g., jdoe")).toBeInTheDocument();
  });

  it("creates a user on form submit", async () => {
    mockPost.mockResolvedValue({ ...user1, username: "charlie" });

    render(<UserManagement />);
    await waitFor(() => {
      expect(screen.getByText("alice")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "+ New User" }));

    await waitFor(() => {
      expect(screen.getByText("Username")).toBeInTheDocument();
    });

    const usernameInput = screen.getByPlaceholderText(
      "e.g., jdoe",
    ) as HTMLInputElement;
    const passwordInput = document.querySelector(
      'input[type="password"]',
    ) as HTMLInputElement;

    fireEvent.change(usernameInput, { target: { value: "charlie" } });
    fireEvent.change(passwordInput, { target: { value: "secret123" } });

    fireEvent.click(screen.getByRole("button", { name: "Create" }));

    await waitFor(() => {
      expect(mockPost).toHaveBeenCalledWith("/core/users/", {
        username: "charlie",
        password: "secret123",
      });
    });
  });

  it("shows validation error when creating user with empty fields", async () => {
    render(<UserManagement />);
    await waitFor(() => {
      expect(screen.getByText("alice")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "+ New User" }));

    await waitFor(() => {
      expect(screen.getByText("Username")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "Create" }));

    await waitFor(() => {
      expect(
        screen.getByText("Username and password are required."),
      ).toBeInTheDocument();
    });
  });

  it("shows user detail with deactivate button when user is selected", async () => {
    render(<UserManagement />);
    await waitFor(() => {
      expect(screen.getByText("alice")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText("alice"));

    await waitFor(() => {
      expect(screen.getByText("User details")).toBeInTheDocument();
    });
    const emails = screen.getAllByText("alice@example.com");
    expect(emails.length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("Active")).toBeInTheDocument();
    expect(screen.getByText("Deactivate")).toBeInTheDocument();
  });

  it("deactivates user on confirm", async () => {
    mockPatch.mockResolvedValue({ ...user1, is_active: false });
    window.confirm = vi.fn().mockReturnValue(true);

    render(<UserManagement />);
    await waitFor(() => {
      expect(screen.getByText("alice")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText("alice"));

    await waitFor(() => {
      expect(screen.getByText("Deactivate")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText("Deactivate"));

    expect(window.confirm).toHaveBeenCalledWith(
      'Deactivate user "alice"?',
    );

    await waitFor(() => {
      expect(mockPatch).toHaveBeenCalledWith("/core/users/1/", {
        is_active: false,
      });
    });
  });

  it("shows delete button for inactive user in detail panel", async () => {
    render(<UserManagement />);
    await waitFor(() => {
      expect(screen.getByText("bob")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText("bob"));

    await waitFor(() => {
      expect(screen.getByTitle("Delete user")).toBeInTheDocument();
    });
    expect(screen.getByText("Inactive")).toBeInTheDocument();
  });

  it("deletes user on confirm", async () => {
    mockDel.mockResolvedValue(undefined);
    window.confirm = vi.fn().mockReturnValue(true);

    render(<UserManagement />);
    await waitFor(() => {
      expect(screen.getByText("bob")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText("bob"));

    await waitFor(() => {
      expect(screen.getByTitle("Delete user")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTitle("Delete user"));

    expect(window.confirm).toHaveBeenCalledWith(
      'Permanently delete user "bob"? This cannot be undone.',
    );

    await waitFor(() => {
      expect(mockDel).toHaveBeenCalledWith("/core/users/2/");
    });
  });

  it("renders Registration card with self-registration toggle", async () => {
    render(<UserManagement />);
    await waitFor(() => {
      expect(screen.getByText("Registration")).toBeInTheDocument();
    });
    expect(screen.getByText("Allow self-registration")).toBeInTheDocument();
    expect(
      screen.getByText(
        "When enabled, anyone can create an account from the login page.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole("switch")).toHaveAttribute(
      "aria-checked",
      "false",
    );
  });

  it("toggles self-registration setting", async () => {
    mockPatch.mockResolvedValue({
      id: 1,
      key: "allow_self_registration",
      value: true,
    });

    render(<UserManagement />);
    await waitFor(() => {
      expect(screen.getByText("Registration")).toBeInTheDocument();
    });

    const toggle = screen.getByRole("switch");
    fireEvent.click(toggle);

    await waitFor(() => {
      expect(mockPatch).toHaveBeenCalledWith(
        "/core/settings/allow_self_registration/",
        { value: true },
      );
    });
    expect(toggle).toHaveAttribute("aria-checked", "true");
  });

  it("shows registration toggle as enabled when setting is true", async () => {
    mockGet.mockImplementation((url: string) => {
      if (url === "/core/users/") {
        return Promise.resolve([user1]);
      }
      if (url === "/core/settings/allow_self_registration/") {
        return Promise.resolve({
          id: 1,
          key: "allow_self_registration",
          value: true,
        });
      }
      return Promise.reject(new Error("Unknown URL"));
    });

    render(<UserManagement />);
    await waitFor(() => {
      expect(screen.getByText("Registration")).toBeInTheDocument();
    });
    expect(screen.getByRole("switch")).toHaveAttribute(
      "aria-checked",
      "true",
    );
  });

  it("dismisses error banner when Dismiss is clicked", async () => {
    mockGet.mockImplementation((url: string) => {
      if (url === "/core/settings/allow_self_registration/") {
        return Promise.resolve({ id: 1, key: "allow_self_registration", value: false });
      }
      return Promise.reject(new Error("Failed to load"));
    });

    render(<UserManagement />);
    await waitFor(() => {
      expect(screen.getByText("Failed to load")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText("Dismiss"));

    await waitFor(() => {
      expect(screen.queryByText("Failed to load")).not.toBeInTheDocument();
    });
  });
});
