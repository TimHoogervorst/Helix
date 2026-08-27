import { describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { useActivity, type ActivitySubject } from "../useActivity";

interface Row {
  id: number;
  createdAt: string;
  action: string;
}

function map(row: Row) {
  return {
    id: row.id,
    performedBy: {
      id: 1,
      username: "user",
      firstName: "Test",
      lastName: "User",
      color: "#fff",
    },
    action: row.action,
    actionType: "edited",
    targetType: "test.subject",
    targetId: 1,
    metadata: { message: row.action },
    createdAt: row.createdAt,
    state: "confirmed" as const,
  };
}

function subject(fetchPage: ActivitySubject<Row>["fetchPage"]): ActivitySubject<Row> {
  return { key: "subject-1", fetchPage, map };
}

describe("useActivity", () => {
  it("maps, sorts, groups, and accumulates pages", async () => {
    const fetchPage = vi
      .fn()
      .mockResolvedValueOnce({
        results: [
          { id: 1, action: "Older", createdAt: "2026-01-01T00:00:00Z" },
        ],
        next: "/next",
      })
      .mockResolvedValueOnce({
        results: [
          { id: 2, action: "Newer", createdAt: "2026-01-02T00:00:00Z" },
        ],
        next: null,
      });
    const { result } = renderHook(() => useActivity(subject(fetchPage)));

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.actions.map((item) => item.id)).toEqual([1]);
    expect(result.current.items).toHaveLength(1);
    expect(result.current.hasMore).toBe(true);

    await act(async () => result.current.loadMore());
    await waitFor(() => expect(result.current.isLoadingMore).toBe(false));
    expect(result.current.actions.map((item) => item.id)).toEqual([2, 1]);
    expect(result.current.hasMore).toBe(false);
    expect(fetchPage).toHaveBeenLastCalledWith("/next");
  });

  it("restarts from the first page when refetched", async () => {
    const fetchPage = vi.fn().mockResolvedValue({ results: [], next: null });
    const { result } = renderHook(() => useActivity(subject(fetchPage)));
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    act(() => result.current.refetch());
    await waitFor(() => expect(fetchPage).toHaveBeenCalledTimes(2));
    expect(fetchPage).toHaveBeenLastCalledWith(undefined);
  });

  it("exposes initial fetch errors", async () => {
    const fetchPage = vi.fn().mockRejectedValue(new Error("Network error"));
    const { result } = renderHook(() => useActivity(subject(fetchPage)));
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.error).toBe("Network error");
  });
});
