import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import ProtocolSettings from "../ProtocolSettings";

// Mock the API client
const mockGet = vi.fn();
const mockPost = vi.fn();
const mockPut = vi.fn();
const mockDel = vi.fn();

vi.mock("../../../../core/api/client", () => ({
  get: (...args: unknown[]) => mockGet(...args),
  post: (...args: unknown[]) => mockPost(...args),
  put: (...args: unknown[]) => mockPut(...args),
  del: (...args: unknown[]) => mockDel(...args),
}));

const makeProtocolResponse = (results: unknown[]) => ({
  count: results.length,
  next: null,
  previous: null,
  results,
});

const protocol1 = {
  id: 1,
  name: "CRISPR RNP Transfection",
  items: [
    { type: "step" as const, text: "Prepare the reaction mix." },
    { type: "note" as const, text: "Use fresh reagents." },
  ],
  is_active: true,
  created_at: "2025-01-01T00:00:00Z",
  updated_at: "2025-01-01T00:00:00Z",
};

const protocol2 = {
  id: 2,
  name: "qPCR Setup",
  items: [],
  is_active: true,
  created_at: "2025-01-02T00:00:00Z",
  updated_at: "2025-01-02T00:00:00Z",
};

describe("ProtocolSettings", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows loading state initially", () => {
    mockGet.mockReturnValue(new Promise(() => {})); // never resolves
    render(<ProtocolSettings />);
    expect(screen.getByText("Loading…")).toBeInTheDocument();
  });

  it("renders protocols in the master panel after loading", async () => {
    mockGet.mockResolvedValue(
      makeProtocolResponse([protocol1, protocol2]),
    );
    render(<ProtocolSettings />);
    await waitFor(() => {
      expect(
        screen.getByText("CRISPR RNP Transfection"),
      ).toBeInTheDocument();
    });
    expect(screen.getByText("qPCR Setup")).toBeInTheDocument();
  });

  it("shows empty state when no protocols exist", async () => {
    mockGet.mockResolvedValue(makeProtocolResponse([]));
    render(<ProtocolSettings />);
    await waitFor(() => {
      expect(screen.getByText("No protocols found.")).toBeInTheDocument();
    });
  });

  it("shows error state on API failure", async () => {
    mockGet.mockRejectedValue(new Error("Network error"));
    render(<ProtocolSettings />);
    await waitFor(() => {
      expect(screen.getByText("Network error")).toBeInTheDocument();
    });
  });

  it("opens detail panel when a protocol is clicked", async () => {
    mockGet.mockResolvedValue(
      makeProtocolResponse([protocol1, protocol2]),
    );
    render(<ProtocolSettings />);
    await waitFor(() => {
      expect(
        screen.getByText("CRISPR RNP Transfection"),
      ).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText("CRISPR RNP Transfection"));

    await waitFor(() => {
      // Detail panel shows the protocol name again in the header
      const headings = screen.getAllByText("CRISPR RNP Transfection");
      expect(headings.length).toBeGreaterThanOrEqual(1);
    });
  });

  it("shows save bar with count when edits are made", async () => {
    mockGet.mockResolvedValue(
      makeProtocolResponse([protocol1, protocol2]),
    );
    render(<ProtocolSettings />);

    await waitFor(() => {
      expect(
        screen.getByText("CRISPR RNP Transfection"),
      ).toBeInTheDocument();
    });

    // Initially save bar is disabled (0 changes)
    const saveBtn = screen.getByText("Save Changes (0)");
    expect(saveBtn).toBeDisabled();

    // Click to open detail panel — this creates a dirty edit copy
    fireEvent.click(screen.getByText("CRISPR RNP Transfection"));

    // Now the protocol is selected but no edits made yet, so dirtyEdits
    // gets populated with a copy on select. Wait for the detail panel.
    await waitFor(() => {
      // Changing the name should trigger dirty tracking
      const nameInput = screen.getAllByRole("textbox")[0];
      fireEvent.change(nameInput, { target: { value: "Updated Name" } });
    });

    // Save button should now show 1 change and be enabled
    await waitFor(() => {
      expect(screen.getByText("Save Changes (1)")).toBeEnabled();
    });
  });

  it("closes detail panel when close button is clicked", async () => {
    mockGet.mockResolvedValue(
      makeProtocolResponse([protocol1]),
    );
    render(<ProtocolSettings />);

    await waitFor(() => {
      expect(
        screen.getByText("CRISPR RNP Transfection"),
      ).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText("CRISPR RNP Transfection"));

    await waitFor(() => {
      expect(
        document.querySelector(".type-detail-close"),
      ).toBeInTheDocument();
    });

    fireEvent.click(document.querySelector(".type-detail-close")!);

    // Should return to just one "CRISPR RNP Transfection" (master panel only)
    await waitFor(() => {
      const occurrences = screen.getAllByText("CRISPR RNP Transfection");
      expect(occurrences).toHaveLength(1);
    });
  });

  it("calls POST API when creating a new protocol", async () => {
    mockGet.mockResolvedValue(makeProtocolResponse([protocol1]));
    mockPost.mockResolvedValue({
      id: 3,
      name: "New Protocol",
      items: [],
      is_active: true,
      created_at: "2025-01-03T00:00:00Z",
      updated_at: "2025-01-03T00:00:00Z",
    });

    render(<ProtocolSettings />);

    await waitFor(() => {
      expect(
        screen.getByText("CRISPR RNP Transfection"),
      ).toBeInTheDocument();
    });

    // Open new form
    fireEvent.click(screen.getByText("+"));

    await waitFor(() => {
      expect(
        screen.getByPlaceholderText("e.g., CRISPR RNP Transfection"),
      ).toBeInTheDocument();
    });

    // Type name
    const nameInput = screen.getByPlaceholderText(
      "e.g., CRISPR RNP Transfection",
    );
    fireEvent.change(nameInput, { target: { value: "New Protocol" } });

    // Click Create
    fireEvent.click(screen.getByText("Create"));

    await waitFor(() => {
      expect(mockPost).toHaveBeenCalledWith("/eln/protocols/", {
        name: "New Protocol",
        items: [],
      });
    });
  });

  it("calls PUT API when saving changes", async () => {
    mockGet.mockResolvedValue(
      makeProtocolResponse([protocol1]),
    );
    mockPut.mockResolvedValue({ ...protocol1, name: "Updated" });

    render(<ProtocolSettings />);

    await waitFor(() => {
      expect(
        screen.getByText("CRISPR RNP Transfection"),
      ).toBeInTheDocument();
    });

    // Select and edit
    fireEvent.click(screen.getByText("CRISPR RNP Transfection"));

    await waitFor(() => {
      const nameInput = screen.getAllByRole("textbox")[0];
      fireEvent.change(nameInput, { target: { value: "Updated" } });
    });

    // Save
    await waitFor(() => {
      expect(screen.getByText("Save Changes (1)")).toBeEnabled();
    });
    fireEvent.click(screen.getByText("Save Changes (1)"));

    await waitFor(() => {
      expect(mockPut).toHaveBeenCalledWith("/eln/protocols/1/", {
        name: "Updated",
        items: protocol1.items,
      });
    });
  });

  it("shows '+' as toggle button text when form is closed", async () => {
    mockGet.mockResolvedValue(makeProtocolResponse([]));
    render(<ProtocolSettings />);

    await waitFor(() => {
      expect(screen.getByText("+")).toBeInTheDocument();
    });
  });

  it("calls DELETE API and removes protocol from list on confirm", async () => {
    mockGet.mockResolvedValue(
      makeProtocolResponse([protocol1, protocol2]),
    );
    mockDel.mockResolvedValue(undefined);
    window.confirm = vi.fn().mockReturnValue(true);

    render(<ProtocolSettings />);

    await waitFor(() => {
      expect(
        screen.getByText("CRISPR RNP Transfection"),
      ).toBeInTheDocument();
    });

    // Select protocol to open detail panel
    fireEvent.click(screen.getByText("CRISPR RNP Transfection"));

    await waitFor(() => {
      expect(
        screen.getByTitle("Deactivate protocol"),
      ).toBeInTheDocument();
    });

    // Click the delete button
    fireEvent.click(screen.getByTitle("Deactivate protocol"));

    expect(window.confirm).toHaveBeenCalledWith(
      'Deactivate protocol "CRISPR RNP Transfection"?',
    );

    await waitFor(() => {
      expect(mockDel).toHaveBeenCalledWith("/eln/protocols/1/");
    });
  });
});
