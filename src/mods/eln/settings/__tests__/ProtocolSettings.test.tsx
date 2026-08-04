import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import ProtocolSettings from "../ProtocolSettings";

const mockGet = vi.fn();
const mockPost = vi.fn();
const mockPut = vi.fn();
const mockDel = vi.fn();

vi.mock("../../../../shell/src/api/client", () => ({
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
    mockGet.mockReturnValue(new Promise(() => {}));
    render(<ProtocolSettings />);
    expect(screen.getByText("Loading…")).toBeInTheDocument();
  });

  it("renders hero header and protocols in the master list after loading", async () => {
    mockGet.mockResolvedValue(
      makeProtocolResponse([protocol1, protocol2]),
    );
    render(<ProtocolSettings />);
    await waitFor(() => {
      expect(screen.getByText("Protocol settings")).toBeInTheDocument();
    });
    expect(screen.getByText("CRISPR RNP Transfection")).toBeInTheDocument();
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
      expect(screen.getByText("Protocol identity")).toBeInTheDocument();
    });
  });

  it("shows save bar when edits are made", async () => {
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
      expect(screen.getByText("Protocol identity")).toBeInTheDocument();
    });

    const nameInput = screen.getByPlaceholderText("Protocol name");
    fireEvent.change(nameInput, { target: { value: "Updated Name" } });

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
      expect(screen.getByText("Protocol identity")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTitle("Close detail"));

    await waitFor(() => {
      expect(screen.queryByText("Protocol identity")).not.toBeInTheDocument();
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

    fireEvent.click(screen.getByText("+ New Protocol"));

    await waitFor(() => {
      expect(
        screen.getByPlaceholderText("e.g., CRISPR RNP Transfection"),
      ).toBeInTheDocument();
    });

    const nameInput = screen.getByPlaceholderText(
      "e.g., CRISPR RNP Transfection",
    );
    fireEvent.change(nameInput, { target: { value: "New Protocol" } });

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

    fireEvent.click(screen.getByText("CRISPR RNP Transfection"));

    await waitFor(() => {
      expect(screen.getByText("Protocol identity")).toBeInTheDocument();
    });

    const nameInput = screen.getByPlaceholderText("Protocol name");
    fireEvent.change(nameInput, { target: { value: "Updated" } });

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

  it('shows "+ New Protocol" button in the hero header', async () => {
    mockGet.mockResolvedValue(makeProtocolResponse([]));
    render(<ProtocolSettings />);

    await waitFor(() => {
      expect(screen.getByText("+ New Protocol")).toBeInTheDocument();
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

    fireEvent.click(screen.getByText("CRISPR RNP Transfection"));

    await waitFor(() => {
      expect(
        screen.getByTitle("Deactivate protocol"),
      ).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTitle("Deactivate protocol"));

    expect(window.confirm).toHaveBeenCalledWith(
      'Deactivate protocol "CRISPR RNP Transfection"?',
    );

    await waitFor(() => {
      expect(mockDel).toHaveBeenCalledWith("/eln/protocols/1/");
    });
  });
});
