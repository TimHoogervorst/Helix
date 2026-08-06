import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import DevToolsSettings from "../DevToolsSettings";

const mockDel = vi.fn();

vi.mock("../../../../shell/src/api/client", () => ({
  get: vi.fn(),
  post: vi.fn(),
  put: vi.fn(),
  patch: vi.fn(),
  del: (...args: unknown[]) => mockDel(...args),
}));

function clickAction(label: string) {
  fireEvent.click(screen.getByRole("button", { name: label }));
}

describe("DevToolsSettings", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders hero header with eyebrow, title, and description", () => {
    render(<DevToolsSettings />);
    expect(screen.getByText("developer tools")).toBeInTheDocument();
    expect(screen.getByText("Dev/test utilities")).toBeInTheDocument();
    expect(
      screen.getByText(/Mass-deletion tools for resetting test data/),
    ).toBeInTheDocument();
  });

  it("renders Danger Zone section card", () => {
    render(<DevToolsSettings />);
    expect(screen.getByText("Danger Zone")).toBeInTheDocument();
    expect(
      screen.getByText(
        /These operations permanently delete data\. There is no undo\./,
      ),
    ).toBeInTheDocument();
  });

  it("renders all four DELETE ALL action buttons", () => {
    render(<DevToolsSettings />);
    expect(
      screen.getByRole("button", { name: "DELETE ALL ENTITIES" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "DELETE ALL ENTRIES" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "DELETE ALL SCHEMAS" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "DELETE EVERYTHING" }),
    ).toBeInTheDocument();
  });

  it("shows confirmation buttons when a DELETE ALL action is clicked", async () => {
    render(<DevToolsSettings />);
    clickAction("DELETE ALL ENTITIES");
    await waitFor(() => {
      expect(screen.getByText("Are you sure?")).toBeInTheDocument();
    });
    expect(screen.getByText("Confirm")).toBeInTheDocument();
    expect(screen.getByText("Cancel")).toBeInTheDocument();
  });

  it("calls the correct endpoint on DELETE ALL ENTITIES confirm", async () => {
    mockDel.mockResolvedValue({ deleted: 5 });
    render(<DevToolsSettings />);
    clickAction("DELETE ALL ENTITIES");
    await waitFor(() => {
      expect(screen.getByText("Confirm")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText("Confirm"));
    await waitFor(() => {
      expect(mockDel).toHaveBeenCalledWith("/lims/entities/delete_all/");
    });
  });

  it("calls the correct endpoint on DELETE ALL ENTRIES confirm", async () => {
    mockDel.mockResolvedValue({ deleted: 3 });
    render(<DevToolsSettings />);
    clickAction("DELETE ALL ENTRIES");
    await waitFor(() => {
      expect(screen.getByText("Confirm")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText("Confirm"));
    await waitFor(() => {
      expect(mockDel).toHaveBeenCalledWith("/eln/entries/delete_all/");
    });
  });

  it("calls the correct endpoint on DELETE ALL SCHEMAS confirm", async () => {
    mockDel.mockResolvedValue({ deleted: 2 });
    render(<DevToolsSettings />);
    clickAction("DELETE ALL SCHEMAS");
    await waitFor(() => {
      expect(screen.getByText("Confirm")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText("Confirm"));
    await waitFor(() => {
      expect(mockDel).toHaveBeenCalledWith("/schemas/delete_all/");
    });
  });

  it("calls the correct endpoint on DELETE EVERYTHING confirm", async () => {
    mockDel.mockResolvedValue({ deleted: 10 });
    render(<DevToolsSettings />);
    clickAction("DELETE EVERYTHING");
    await waitFor(() => {
      expect(screen.getByText("Confirm")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText("Confirm"));
    await waitFor(() => {
      expect(mockDel).toHaveBeenCalledWith("/delete-everything/");
    });
  });

  it("cancels confirmation when Cancel is clicked", async () => {
    render(<DevToolsSettings />);
    clickAction("DELETE ALL ENTITIES");
    await waitFor(() => {
      expect(screen.getByText("Are you sure?")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText("Cancel"));
    await waitFor(() => {
      expect(screen.queryByText("Are you sure?")).not.toBeInTheDocument();
    });
    expect(mockDel).not.toHaveBeenCalled();
  });

  it("shows success status after deletion", async () => {
    mockDel.mockResolvedValue({ deleted: 7 });
    render(<DevToolsSettings />);
    clickAction("DELETE ALL ENTITIES");
    await waitFor(() => {
      expect(screen.getByText("Confirm")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText("Confirm"));
    await waitFor(() => {
      expect(
        screen.getByText(
          '"DELETE ALL ENTITIES" completed — 7 records deleted.',
        ),
      ).toBeInTheDocument();
    });
  });

  it("shows error on API failure", async () => {
    mockDel.mockRejectedValue(new Error("Server error"));
    render(<DevToolsSettings />);
    clickAction("DELETE ALL ENTITIES");
    await waitFor(() => {
      expect(screen.getByText("Confirm")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText("Confirm"));
    await waitFor(() => {
      expect(screen.getByText("Server error")).toBeInTheDocument();
    });
  });

  it("only one confirmation is visible at a time", async () => {
    render(<DevToolsSettings />);
    clickAction("DELETE ALL ENTITIES");
    await waitFor(() => {
      expect(screen.getByText("Are you sure?")).toBeInTheDocument();
    });
    const allConfirm = screen.queryAllByText("Confirm");
    expect(allConfirm).toHaveLength(1);
  });
});
