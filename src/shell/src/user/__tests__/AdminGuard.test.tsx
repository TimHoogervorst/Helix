import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Routes, Route, Link } from "react-router-dom";

vi.mock("../CurrentUserProvider", () => ({
  CurrentUserProvider: ({ children }: { children: React.ReactNode }) =>
    children,
  useCurrentUser: vi.fn(),
}));

import { useCurrentUser } from "../CurrentUserProvider";
import { AdminGuard } from "../AdminGuard";

function renderGuard(role: string | null) {
  vi.mocked(useCurrentUser).mockReturnValue({
    user: {
      id: 1,
      username: "mkato",
      organization_role: role,
    },
    isChecking: false,
    error: null,
    refresh: vi.fn(),
  } as any);

  return render(
    <MemoryRouter initialEntries={["/protected"]}>
      <Routes>
        <Route
          path="/protected"
          element={
            <AdminGuard>
              <div data-testid="admin-content">Admin Content</div>
            </AdminGuard>
          }
        />
        <Route path="/library" element={<div data-testid="library">Library</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("AdminGuard", () => {
  it("renders children for admin users", () => {
    renderGuard("admin");
    expect(screen.getByTestId("admin-content")).toBeInTheDocument();
  });

  it("redirects non-admin users to /library", () => {
    renderGuard("user");
    expect(screen.getByTestId("library")).toBeInTheDocument();
    expect(screen.queryByTestId("admin-content")).not.toBeInTheDocument();
  });

  it("redirects users with null organization_role to /library", () => {
    renderGuard(null);
    expect(screen.getByTestId("library")).toBeInTheDocument();
    expect(screen.queryByTestId("admin-content")).not.toBeInTheDocument();
  });

  it("redirects when user is null", () => {
    vi.mocked(useCurrentUser).mockReturnValue({
      user: null,
      isChecking: false,
      error: null,
      refresh: vi.fn(),
    } as any);

    render(
      <MemoryRouter initialEntries={["/protected"]}>
        <Routes>
          <Route
            path="/protected"
            element={
              <AdminGuard>
                <div data-testid="admin-content">Admin Content</div>
              </AdminGuard>
            }
          />
          <Route path="/library" element={<div data-testid="library">Library</div>} />
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByTestId("library")).toBeInTheDocument();
    expect(screen.queryByTestId("admin-content")).not.toBeInTheDocument();
  });
});
