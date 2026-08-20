import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { post } from "../../../api/client";
import { useComputedFields } from "../useComputedFields";
import type { GridColumn } from "../../types/types";

vi.mock("../../../api/client", () => ({ post: vi.fn() }));

const mockPost = vi.mocked(post);

const columns: GridColumn[] = [
  { name: "Amount", type: "number" },
  { name: "Root", type: "formula", expression: "SQRT([Amount])" },
  { name: "Label", type: "formula", expression: 'CONCAT("x", [Amount])' },
];

function row(values: Record<string, unknown>, displayId = "ROW1") {
  return { displayId, values };
}

describe("useComputedFields", () => {
  beforeEach(() => mockPost.mockReset());

  it("previews client formulas and leaves backend-only formulas for refresh", () => {
    const { result } = renderHook(() =>
      useComputedFields({ columns, enabled: true, applyRowValues: vi.fn() }),
    );

    expect(result.current.backendOnlyColumns.map((column) => column.name)).toEqual([
      "Root",
    ]);
    expect(result.current.computedValues(row({ Amount: 4 }))).toEqual({
      Amount: 4,
      Root: undefined,
      Label: "x4",
    });
  });

  it("uses parsed calls for namespaced, nested, and string-literal detection", () => {
    const analyzed: GridColumn[] = [
      { name: "Sequence", type: "text" },
      { name: "Namespaced", type: "formula", expression: "molBio.gcContent([Sequence])" },
      { name: "Nested", type: "formula", expression: "SQRT(ABS([Amount]))" },
      { name: "Text", type: "formula", expression: 'CONCAT("SQRT(1)", [Sequence])' },
    ];
    const { result } = renderHook(() =>
      useComputedFields({ columns: analyzed, enabled: true, applyRowValues: vi.fn() }),
    );

    expect(result.current.backendOnlyColumns.map((column) => column.name)).toEqual([
      "Namespaced",
      "Nested",
    ]);
  });

  it("refreshes chained formulas in dependency order without cleared values", async () => {
    const applyRowValues = vi.fn();
    mockPost
      .mockResolvedValueOnce({
        results: {
          Middle: { ok: true, value: 2 },
          Also: { ok: true, value: 4 },
        },
      })
      .mockResolvedValueOnce({ results: { Final: { ok: true, value: 4 } } });
    const chained: GridColumn[] = [
      { name: "Final", type: "formula", expression: "SQRT([Middle])" },
      { name: "Middle", type: "formula", expression: "SQRT([Amount])" },
      { name: "Also", type: "formula", expression: "SQRT([Amount])" },
      { name: "Amount", type: "number" },
    ];
    const { result } = renderHook(() =>
      useComputedFields({ columns: chained, enabled: true, applyRowValues }),
    );

    await act(async () => result.current.refresh(row({ Amount: 16 })));

    expect(mockPost.mock.calls.map((call) => call[1])).toEqual([
      {
        expressions: {
          Middle: "SQRT([Amount])",
          Also: "SQRT([Amount])",
        },
        row: { Amount: 16 },
      },
      {
        expressions: { Final: "SQRT([Middle])" },
        row: { Amount: 16, Middle: 2, Also: 4 },
      },
    ]);
    expect(applyRowValues).toHaveBeenCalledWith("ROW1", {
      Amount: 16,
      Middle: 2,
      Also: 4,
      Final: 4,
    });
  });

  it("does not request incomplete rows or refresh in preview mode", async () => {
    const applyRowValues = vi.fn();
    const { result } = renderHook(() =>
      useComputedFields({
        columns,
        enabled: false,
        applyRowValues,
      }),
    );

    await act(async () => result.current.refresh(row({ Amount: "" })));

    expect(mockPost).not.toHaveBeenCalled();
    expect(applyRowValues).not.toHaveBeenCalled();
  });

  it("silently skips an enabled refresh when referenced inputs are incomplete", async () => {
    const { result } = renderHook(() =>
      useComputedFields({ columns, enabled: true, applyRowValues: vi.fn() }),
    );

    await act(async () => result.current.refresh(row({ Amount: null })));

    expect(mockPost).not.toHaveBeenCalled();
  });

  it("tracks input staleness, ignores non-formula changes, and seeds registration", async () => {
    const applyRowValues = vi.fn();
    mockPost.mockResolvedValue({ results: { Root: { ok: true, value: 2 } } });
    const { result } = renderHook(() =>
      useComputedFields({ columns, enabled: true, applyRowValues }),
    );
    const initial = row({ Amount: 4, Root: 2, Label: "x4" });

    act(() => result.current.markRefreshed("ROW1", initial.values));
    expect(result.current.isStale(initial, "Root")).toBe(false);
    expect(result.current.isStale(row({ Amount: 4, Root: 2, Label: "x4" }), "Amount")).toBe(false);
    expect(result.current.isStale(row({ Amount: 5, Root: 2, Label: "x4" }), "Root")).toBe(true);
    expect(result.current.isStale(row({ Amount: 5, Root: 2, Label: "x5" }), "Label")).toBe(false);
    expect(result.current.isStale(row({ Amount: 4, Root: 2, Label: "x4" }), "Unknown")).toBe(false);
  });

  it("isolates concurrent refresh state by row", async () => {
    let resolveFirst: ((value: unknown) => void) | undefined;
    mockPost.mockImplementationOnce(
      () => new Promise((resolve) => { resolveFirst = resolve; }),
    );
    mockPost.mockImplementationOnce(async () => ({
      results: { Root: { ok: true, value: 3 } },
    }));
    const applyRowValues = vi.fn();
    const { result } = renderHook(() =>
      useComputedFields({
        columns: [columns[0], columns[1]],
        enabled: true,
        applyRowValues,
      }),
    );

    let first: Promise<void>;
    act(() => {
      first = result.current.refresh(row({ Amount: 4 }, "ROW1"));
    });
    expect(result.current.isRefreshing("ROW1")).toBe(true);
    await act(async () => result.current.refresh(row({ Amount: 9 }, "ROW2")));
    expect(result.current.isRefreshing("ROW2")).toBe(false);
    expect(result.current.isRefreshing("ROW1")).toBe(true);
    await act(async () => {
      resolveFirst?.({ results: { Root: { ok: true, value: 2 } } });
      await first;
    });
    expect(result.current.isRefreshing("ROW1")).toBe(false);
  });
});
