import { describe, it, expect, vi } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { usePaginatedData, type UsePaginatedDataOptions } from "../usePaginatedData";

// ── Test helpers ──────────────────────────────────────────────────────────────

interface TestItem {
  id: number;
  display_id: string;
  name: string;
}

function makeItem(overrides?: Partial<TestItem>): TestItem {
  return {
    id: 1,
    display_id: "TEST1",
    name: "Test Item",
    ...overrides,
  };
}

function makePage(items: TestItem[], nextUrl: string | null = null) {
  return {
    results: items,
    next: nextUrl,
  };
}

interface WrapperOptions {
  initialRoute?: string;
}

function createWrapper(opts: WrapperOptions = {}) {
  const { initialRoute = "/test" } = opts;
  return function TestWrapper({ children }: { children: React.ReactNode }) {
    return <MemoryRouter initialEntries={[initialRoute]}>{children}</MemoryRouter>;
  };
}

const defaultOptions: UsePaginatedDataOptions<TestItem> = {
  fetchFn: async () => makePage([]),
  getId: (item) => item.id,
  getDisplayId: (item) => item.display_id,
};

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("usePaginatedData", () => {
  describe("initial fetch", () => {
    it("fetches items on mount and exposes them", async () => {
      const items = [makeItem({ id: 1, display_id: "A1" })];
      const fetchFn = vi.fn().mockResolvedValue(makePage(items));

      const { result } = renderHook(
        () => usePaginatedData({ ...defaultOptions, fetchFn }),
        { wrapper: createWrapper() },
      );

      // Initially loading
      expect(result.current.loading).toBe(true);
      expect(result.current.items).toEqual([]);

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.items).toEqual(items);
      expect(result.current.error).toBeNull();
      expect(fetchFn).toHaveBeenCalledTimes(1);
    });

    it("exposes error when fetch fails", async () => {
      const fetchFn = vi.fn().mockRejectedValue(new Error("Network error"));

      const { result } = renderHook(
        () => usePaginatedData({ ...defaultOptions, fetchFn }),
        { wrapper: createWrapper() },
      );

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.error).toBe("Network error");
      expect(result.current.items).toEqual([]);
    });

    it("exposes error message for non-Error rejections", async () => {
      const fetchFn = vi.fn().mockRejectedValue("string error");

      const { result } = renderHook(
        () => usePaginatedData({ ...defaultOptions, fetchFn }),
        { wrapper: createWrapper() },
      );

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.error).toBe("Failed to load");
    });
  });

  describe("pagination", () => {
    it("appends items when loading more", async () => {
      const page1 = [makeItem({ id: 1, display_id: "A1" })];
      const page2 = [makeItem({ id: 2, display_id: "A2" })];
      const fetchFn = vi
        .fn()
        .mockResolvedValueOnce(makePage(page1, "/next-page"))
        .mockResolvedValueOnce(makePage(page2, null));

      const { result } = renderHook(
        () => usePaginatedData({ ...defaultOptions, fetchFn }),
        { wrapper: createWrapper() },
      );

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.items).toEqual(page1);
      expect(result.current.nextUrl).toBe("/next-page");

      // Load more
      await act(async () => {
        result.current.handleLoadMore();
      });

      await waitFor(() => {
        expect(result.current.items).toEqual([...page1, ...page2]);
      });

      expect(result.current.nextUrl).toBeNull();
      expect(fetchFn).toHaveBeenCalledTimes(2);
      expect(fetchFn).toHaveBeenLastCalledWith("/next-page");
    });

    it("does not call fetch when nextUrl is null", async () => {
      const fetchFn = vi.fn().mockResolvedValue(makePage([], null));

      const { result } = renderHook(
        () => usePaginatedData({ ...defaultOptions, fetchFn }),
        { wrapper: createWrapper() },
      );

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      const callCount = fetchFn.mock.calls.length;

      await act(async () => {
        result.current.handleLoadMore();
      });

      // No additional call since nextUrl is null
      expect(fetchFn).toHaveBeenCalledTimes(callCount);
    });
  });

  describe("filterKey", () => {
    it("refetches when fetchFn reference changes (e.g. filter param update)", async () => {
      const pageA = [makeItem({ id: 1, display_id: "A1" })];
      const pageB = [makeItem({ id: 2, display_id: "B1" })];

      const fetchFnA = vi.fn().mockResolvedValue(makePage(pageA));
      const fetchFnB = vi.fn().mockResolvedValue(makePage(pageB));

      const { result, rerender } = renderHook(
        ({ fetchFn }) =>
          usePaginatedData({
            ...defaultOptions,
            fetchFn,
            filterKey: "type",
          }),
        {
          wrapper: createWrapper({ initialRoute: "/test?type=blood" }),
          initialProps: { fetchFn: fetchFnA },
        },
      );

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.items).toEqual(pageA);
      expect(fetchFnA).toHaveBeenCalledTimes(1);

      // Simulate filter param change: consumer creates new fetchFn with new closure
      rerender({ fetchFn: fetchFnB });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.items).toEqual(pageB);
      expect(fetchFnB).toHaveBeenCalledTimes(1);
    });

    it("does not refetch when filterKey is not provided and URL changes", async () => {
      const fetchFn = vi
        .fn()
        .mockResolvedValue(makePage([makeItem()]));

      const { result } = renderHook(
        () =>
          usePaginatedData({
            ...defaultOptions,
            fetchFn,
            // no filterKey
          }),
        { wrapper: createWrapper({ initialRoute: "/test?type=blood" }) },
      );

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      // Only the initial fetch
      expect(fetchFn).toHaveBeenCalledTimes(1);
    });
  });

  describe("selection", () => {
    it("selectItem sets selectedId and selectedItem", async () => {
      const item = makeItem({ id: 42, display_id: "X42" });
      const fetchFn = vi.fn().mockResolvedValue(makePage([item]));

      const { result } = renderHook(
        () => usePaginatedData({ ...defaultOptions, fetchFn }),
        { wrapper: createWrapper() },
      );

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      act(() => {
        result.current.selectItem(item);
      });

      expect(result.current.selectedId).toBe(42);
      expect(result.current.selectedItem).toEqual(item);
    });

    it("clearSelection resets selection state", async () => {
      const item = makeItem();
      const fetchFn = vi.fn().mockResolvedValue(makePage([item]));

      const { result } = renderHook(
        () => usePaginatedData({ ...defaultOptions, fetchFn }),
        { wrapper: createWrapper() },
      );

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      act(() => {
        result.current.selectItem(item);
      });

      expect(result.current.selectedItem).not.toBeNull();

      act(() => {
        result.current.clearSelection();
      });

      expect(result.current.selectedId).toBeNull();
      expect(result.current.selectedItem).toBeNull();
    });
  });

  describe("handleRowClick", () => {
    it("returns 'select' when clicking item in list view", async () => {
      const item = makeItem({ id: 1, display_id: "A1" });
      const fetchFn = vi.fn().mockResolvedValue(makePage([item]));

      const { result } = renderHook(
        () => usePaginatedData({ ...defaultOptions, fetchFn }),
        { wrapper: createWrapper() },
      );

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      let action: { type: string } = { type: "none" };
      act(() => {
        action = result.current.handleRowClick(item, "list");
      });

      expect(action.type).toBe("select");
      expect(result.current.selectedId).toBe(1);
      expect(result.current.selectedItem).toEqual(item);
    });

    it("returns 'deselect' when clicking already-selected item in detail view", async () => {
      const item = makeItem({ id: 1, display_id: "A1" });
      const fetchFn = vi.fn().mockResolvedValue(makePage([item]));

      const { result } = renderHook(
        () => usePaginatedData({ ...defaultOptions, fetchFn }),
        { wrapper: createWrapper() },
      );

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      // Select first
      act(() => {
        result.current.handleRowClick(item, "list");
      });

      // Click again in detail view
      let action: { type: string } = { type: "none" };
      act(() => {
        action = result.current.handleRowClick(item, "detail");
      });

      expect(action.type).toBe("deselect");
      expect(result.current.selectedId).toBeNull();
      expect(result.current.selectedItem).toBeNull();
    });

    it("returns 'select' when clicking different item in detail view", async () => {
      const item1 = makeItem({ id: 1, display_id: "A1" });
      const item2 = makeItem({ id: 2, display_id: "A2" });
      const fetchFn = vi.fn().mockResolvedValue(makePage([item1, item2]));

      const { result } = renderHook(
        () => usePaginatedData({ ...defaultOptions, fetchFn }),
        { wrapper: createWrapper() },
      );

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      // Select item1
      act(() => {
        result.current.handleRowClick(item1, "list");
      });

      // Click item2 in detail view
      let action: { type: string } = { type: "none" };
      act(() => {
        action = result.current.handleRowClick(item2, "detail");
      });

      expect(action.type).toBe("select");
      expect(result.current.selectedId).toBe(2);
      expect(result.current.selectedItem).toEqual(item2);
    });

    it("returns 'none' when clicking in expanded view", async () => {
      const item = makeItem();
      const fetchFn = vi.fn().mockResolvedValue(makePage([item]));

      const { result } = renderHook(
        () => usePaginatedData({ ...defaultOptions, fetchFn }),
        { wrapper: createWrapper() },
      );

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      let action: { type: string } = { type: "none" };
      act(() => {
        action = result.current.handleRowClick(item, "expanded");
      });

      expect(action.type).toBe("none");
    });
  });

  describe("?select= auto-resolve", () => {
    it("auto-selects item when ?select= matches a display_id", async () => {
      const item = makeItem({ id: 99, display_id: "MATCH99" });
      const fetchFn = vi.fn().mockResolvedValue(makePage([item]));
      const onSelectResolved = vi.fn();

      const { result } = renderHook(
        () =>
          usePaginatedData({
            ...defaultOptions,
            fetchFn,
            onSelectResolved,
          }),
        { wrapper: createWrapper({ initialRoute: "/test?select=MATCH99" }) },
      );

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      // Should auto-select the matching item
      await waitFor(() => {
        expect(result.current.selectedId).toBe(99);
      });

      expect(result.current.selectedItem).toEqual(item);
      expect(onSelectResolved).toHaveBeenCalledWith(item);
    });

    it("does not auto-select when loading", async () => {
      // Never resolves — stays in loading state
      const fetchFn = vi.fn().mockImplementation(
        () => new Promise(() => {}),
      );
      const onSelectResolved = vi.fn();

      renderHook(
        () =>
          usePaginatedData({
            ...defaultOptions,
            fetchFn,
            onSelectResolved,
          }),
        { wrapper: createWrapper({ initialRoute: "/test?select=MATCH99" }) },
      );

      // Wait a tick to let effects run
      await act(async () => {
        await new Promise((r) => setTimeout(r, 10));
      });

      // Should not have been called because we're still loading
      expect(onSelectResolved).not.toHaveBeenCalled();
    });

    it("does not auto-select when no item matches", async () => {
      const item = makeItem({ id: 1, display_id: "OTHER" });
      const fetchFn = vi.fn().mockResolvedValue(makePage([item]));
      const onSelectResolved = vi.fn();

      const { result } = renderHook(
        () =>
          usePaginatedData({
            ...defaultOptions,
            fetchFn,
            onSelectResolved,
          }),
        {
          wrapper: createWrapper({
            initialRoute: "/test?select=NONEXISTENT",
          }),
        },
      );

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(onSelectResolved).not.toHaveBeenCalled();
      expect(result.current.selectedItem).toBeNull();
    });
  });
});
