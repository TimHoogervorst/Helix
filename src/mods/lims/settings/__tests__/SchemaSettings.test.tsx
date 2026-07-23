import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import SchemaSettings from "../SchemaSettings";

// Mock the API client
const mockGet = vi.fn();
vi.mock("../../../../shell/src/api/client", () => ({
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

  it("renders empty state when no schemas exist", async () => {
    // First call = schemas, second call = schema types
    mockGet
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);
    render(<SchemaSettings />);
    await waitFor(() => {
      expect(screen.getByText("No schemas found.")).toBeInTheDocument();
    });
  });

  it("renders schemas in the master panel", async () => {
    mockGet
      .mockResolvedValueOnce([
        {
          id: 1,
          name: "Blood Sample",
          prefix: "BLOOD",
          schema_type: 1,
          schema_type_display: "LIMS Entity",
          columns: [
            { name: "Volume", type: "Number" as const },
          ],
          is_default: false,
          is_active: true,
          content_hash: "abc123",
        },
        {
          id: 2,
          name: "Patient",
          prefix: "PAT",
          schema_type: 1,
          schema_type_display: "LIMS Entity",
          columns: [],
          is_default: false,
          is_active: true,
          content_hash: "def456",
        },
      ])
      .mockResolvedValueOnce([
        { id: 1, display_name: "LIMS Entity", workspace_id: "lims", is_active: true },
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

  it("shows system badge for default schemas", async () => {
    mockGet
      .mockResolvedValueOnce([
        {
          id: 1,
          name: "Default",
          prefix: "E",
          schema_type: 1,
          schema_type_display: "LIMS Entity",
          columns: [],
          is_default: true,
          is_active: true,
          content_hash: "abc123",
        },
      ])
      .mockResolvedValueOnce([
        { id: 1, display_name: "LIMS Entity", workspace_id: "lims", is_active: true },
      ]);
    render(<SchemaSettings />);
    await waitFor(() => {
      expect(screen.getByText("System")).toBeInTheDocument();
    });
  });
});
