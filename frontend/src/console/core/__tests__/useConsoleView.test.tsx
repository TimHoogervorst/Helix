import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { ConsoleProvider } from "../ConsoleProvider";
import { useConsoleView } from "../useConsoleView";

function wrapper({ children }: { children: React.ReactNode }) {
  return <ConsoleProvider>{children}</ConsoleProvider>;
}

describe("useConsoleView", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("starts in list state", () => {
    const { result } = renderHook(() => useConsoleView(), { wrapper });
    expect(result.current.viewState).toBe("list");
    expect(result.current.isExiting).toBe(false);
    expect(result.current.isDetailExiting).toBe(false);
  });

  it("goToDetail transitions list → detail", () => {
    const { result } = renderHook(() => useConsoleView(), { wrapper });
    act(() => {
      result.current.goToDetail();
    });
    expect(result.current.viewState).toBe("detail");
    expect(result.current.isExiting).toBe(false);
  });

  it("goToExpanded transitions detail → expanded", () => {
    const { result } = renderHook(() => useConsoleView(), { wrapper });
    act(() => {
      result.current.goToDetail();
    });
    act(() => {
      result.current.goToExpanded();
    });
    expect(result.current.viewState).toBe("expanded");
  });

  it("collapseFromExpanded transitions expanded → detail with exit animation", () => {
    const { result } = renderHook(() => useConsoleView(), { wrapper });
    // Go to expanded first
    act(() => {
      result.current.goToDetail();
    });
    act(() => {
      result.current.goToExpanded();
    });

    act(() => {
      result.current.collapseFromExpanded();
    });

    // Immediately after: isExiting is true, viewState still "expanded"
    expect(result.current.isExiting).toBe(true);
    expect(result.current.viewState).toBe("expanded");

    // After 250ms: transition completes
    act(() => {
      vi.advanceTimersByTime(250);
    });
    expect(result.current.isExiting).toBe(false);
    expect(result.current.viewState).toBe("detail");
  });

  it("closeAll from expanded returns to list with exit animation", () => {
    const { result } = renderHook(() => useConsoleView(), { wrapper });
    act(() => {
      result.current.goToDetail();
    });
    act(() => {
      result.current.goToExpanded();
    });

    act(() => {
      result.current.closeAll();
    });

    expect(result.current.isExiting).toBe(true);
    expect(result.current.viewState).toBe("expanded");

    act(() => {
      vi.advanceTimersByTime(250);
    });
    expect(result.current.isExiting).toBe(false);
    expect(result.current.viewState).toBe("list");
  });

  it("closeAll from detail returns to list with detail exit animation", () => {
    const { result } = renderHook(() => useConsoleView(), { wrapper });
    act(() => {
      result.current.goToDetail();
    });

    act(() => {
      result.current.closeAll();
    });

    expect(result.current.isDetailExiting).toBe(true);
    expect(result.current.viewState).toBe("detail");

    act(() => {
      vi.advanceTimersByTime(250);
    });
    expect(result.current.isDetailExiting).toBe(false);
    expect(result.current.viewState).toBe("list");
  });

  it("closeAll from list stays in list (no-op)", () => {
    const { result } = renderHook(() => useConsoleView(), { wrapper });
    act(() => {
      result.current.closeAll();
    });
    expect(result.current.viewState).toBe("list");
    expect(result.current.isExiting).toBe(false);
  });

  it("updateViewState sets state and clears exiting flags", () => {
    const { result } = renderHook(() => useConsoleView(), { wrapper });
    act(() => {
      result.current.updateViewState("detail");
    });
    expect(result.current.viewState).toBe("detail");
  });
});
