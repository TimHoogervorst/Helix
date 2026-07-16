import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import SchemaSettings from "../SchemaSettings";

// Mock the API client
const mockGet = vi.fn();
vi.mock("../../../../core/api/client", () => ({
  get: (...args: unknown[]) => mockGet(...args),
  post: vi.fn(),
  put: vi.fn(),
  del: vi.fn(),
}));

describe("SchemaSettings", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows loading state initially", () => {
    mockGet.mockReturnValue(new Promise(() => {})); // never resolves
    render(<SchemaSettings />);
    expect(screen.getByText("Loading…")).toBeInTheDocument();
  });

  it("renders empty state when no entity types exist", async () => {
    mockGet.mockResolvedValue([]);
    render(<SchemaSettings />);
    await waitFor(() => {
      expect(screen.getByText("No schemas found.")).toBeInTheDocument();
    });
  });

  it("renders entity types in the master panel", async () => {
    mockGet.mockResolvedValue([
      {
        id: 1,
        name: "Blood Sample",
        prefix: "BLOOD",
        icon: "🩸",
        columns: [
          { name: "Volume", type: "Number" as const },
        ],
        is_active: true,
      },
      {
        id: 2,
        name: "Patient",
        prefix: "PAT",
        icon: "👤",
        columns: [],
        is_active: true,
      },
    ]);
    render(<SchemaSettings />);
    await waitFor(() => {
      expect(screen.getByText("Blood Sample")).toBeInTheDocument();
    });
    expect(screen.getByText("Patient")).toBeInTheDocument();
  });

  it("shows error state on API failure", async () => {
    mockGet.mockRejectedValue(new Error("Network error"));
    render(<SchemaSettings />);
    await waitFor(() => {
      expect(screen.getByText("Network error")).toBeInTheDocument();
    });
  });
});
