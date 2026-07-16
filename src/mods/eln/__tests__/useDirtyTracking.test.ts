/**
 * Tests for useDirtyTracking — beforeunload guard + isDirty derivation.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { useDirtyTracking, type UseDirtyTrackingOptions } from "../hooks/useDirtyTracking";
import { EMPTY_DOC, type TipTapDoc } from "../types";

function makeOptions(overrides?: Partial<UseDirtyTrackingOptions>): UseDirtyTrackingOptions {
  return {
    title: "",
    initialTitle: "",
    description: "",
    initialDescription: "",
    status: "in_progress",
    initialStatus: "in_progress",
    contentRef: { current: EMPTY_DOC },
    initialContent: EMPTY_DOC,
    ...overrides,
  };
}

describe("useDirtyTracking", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── isDirty derivation ──────────────────────────────────────────────────

  it("returns isDirty=false when all values match initial", () => {
    const { result } = renderHook(() =>
      useDirtyTracking(makeOptions()),
    );
    expect(result.current.isDirty).toBe(false);
  });

  it("returns isDirty=true when title differs", () => {
    const { result } = renderHook(() =>
      useDirtyTracking(makeOptions({ title: "Changed", initialTitle: "Original" })),
    );
    expect(result.current.isDirty).toBe(true);
  });

  it("returns isDirty=true when description differs", () => {
    const { result } = renderHook(() =>
      useDirtyTracking(makeOptions({ description: "New desc", initialDescription: "Old desc" })),
    );
    expect(result.current.isDirty).toBe(true);
  });

  it("returns isDirty=true when status differs", () => {
    const { result } = renderHook(() =>
      useDirtyTracking(makeOptions({ status: "completed", initialStatus: "in_progress" })),
    );
    expect(result.current.isDirty).toBe(true);
  });

  it("returns isDirty=true when content differs", () => {
    const changedContent: TipTapDoc = {
      type: "doc",
      content: [{ type: "paragraph", content: [{ type: "text", text: "dirty" }] }],
    };
    const { result } = renderHook(() =>
      useDirtyTracking(
        makeOptions({
          contentRef: { current: changedContent },
          initialContent: EMPTY_DOC,
        }),
      ),
    );
    expect(result.current.isDirty).toBe(true);
  });

  // ── beforeunload guard ──────────────────────────────────────────────────

  it("registers beforeunload listener on mount", () => {
    const spy = vi.spyOn(window, "addEventListener");
    renderHook(() => useDirtyTracking(makeOptions()));
    expect(spy).toHaveBeenCalledWith("beforeunload", expect.any(Function));
    spy.mockRestore();
  });

  it("prevents unload when isDirty is true", () => {
    const spy = vi.spyOn(window, "addEventListener");
    renderHook(() =>
      useDirtyTracking(
        makeOptions({ title: "Changed", initialTitle: "Original" }),
      ),
    );

    const handler = spy.mock.calls.find(
      (call) => call[0] === "beforeunload",
    )?.[1] as EventListener | undefined;
    expect(handler).toBeDefined();

    const event = { preventDefault: vi.fn(), returnValue: "" as string };
    handler?.(event as unknown as Event);

    expect(event.preventDefault).toHaveBeenCalled();
    expect(event.returnValue).toBe("");
    spy.mockRestore();
  });

  it("does not prevent unload when isDirty is false", () => {
    const spy = vi.spyOn(window, "addEventListener");
    renderHook(() => useDirtyTracking(makeOptions()));

    const handler = spy.mock.calls.find(
      (call) => call[0] === "beforeunload",
    )?.[1] as EventListener | undefined;
    const preventDefault = vi.fn();
    const event = { preventDefault, returnValue: "" };
    handler?.(event as unknown as Event);

    expect(preventDefault).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it("removes beforeunload listener on unmount", () => {
    const spy = vi.spyOn(window, "removeEventListener");
    const { unmount } = renderHook(() => useDirtyTracking(makeOptions()));
    unmount();
    expect(spy).toHaveBeenCalledWith("beforeunload", expect.any(Function));
    spy.mockRestore();
  });

  it("re-registers listener when isDirty changes", () => {
    const addSpy = vi.spyOn(window, "addEventListener");
    const removeSpy = vi.spyOn(window, "removeEventListener");

    const { rerender } = renderHook(
      (props) => useDirtyTracking(makeOptions(props)),
      { initialProps: { title: "A", initialTitle: "A" } as Partial<UseDirtyTrackingOptions> },
    );

    // Initial: clean
    expect(addSpy).toHaveBeenCalledTimes(1);

    // Change to dirty
    rerender({ title: "B", initialTitle: "A" });

    // Effect cleanup runs, then new effect
    expect(removeSpy).toHaveBeenCalledWith("beforeunload", expect.any(Function));
    expect(addSpy).toHaveBeenCalledTimes(2);

    addSpy.mockRestore();
    removeSpy.mockRestore();
  });
});
