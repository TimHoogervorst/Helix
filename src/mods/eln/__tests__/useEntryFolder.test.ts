/**
 * Tests for useEntryFolder — folder listing and selection.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { useEntryFolder } from "../hooks/useEntryFolder";

const mockGet = vi.fn();
vi.mock("../../../shell/src/api/client", () => ({
  get: (...args: unknown[]) => mockGet(...args),
}));

describe("useEntryFolder", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGet.mockReset();
    mockGet.mockResolvedValue([]);
  });

  it("fetches folders on mount", async () => {
    const folders = [
      { id: 1, name: "Experiments" },
      { id: 2, name: "Notes" },
    ];
    mockGet.mockResolvedValue(folders);

    const { result } = renderHook(() => useEntryFolder());

    await waitFor(() => {
      expect(result.current.folders).toEqual(folders);
    });
    expect(mockGet).toHaveBeenCalledWith("/core/folders/");
  });

  it("handles fetch error gracefully (keeps empty folders)", async () => {
    mockGet.mockRejectedValue(new Error("Network error"));

    const { result } = renderHook(() => useEntryFolder());

    // Folders remain empty on error
    await waitFor(() => {
      expect(result.current.folders).toEqual([]);
    });
  });

  it("defaults folderId to null", () => {
    const { result } = renderHook(() => useEntryFolder());
    expect(result.current.folderId).toBeNull();
  });

  it("initializes folderId from initialFolderId option", () => {
    const { result } = renderHook(() =>
      useEntryFolder({ initialFolderId: 7 }),
    );
    expect(result.current.folderId).toBe(7);
  });

  it("setFolderId updates folderId", () => {
    const { result } = renderHook(() => useEntryFolder());

    act(() => {
      result.current.setFolderId(42);
    });

    expect(result.current.folderId).toBe(42);
  });

  it("setFolderId accepts null", () => {
    const { result } = renderHook(() =>
      useEntryFolder({ initialFolderId: 5 }),
    );

    act(() => {
      result.current.setFolderId(null);
    });

    expect(result.current.folderId).toBeNull();
  });
});
