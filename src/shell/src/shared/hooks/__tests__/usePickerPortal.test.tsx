import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { usePickerPortal } from "../usePickerPortal";

function mockTriggerRect(overrides?: Partial<DOMRect>) {
  return {
    bottom: 120,
    left: 50,
    ...overrides,
  } as DOMRect;
}

describe("usePickerPortal", () => {
  let trigger: HTMLElement;
  let panel: HTMLDivElement;

  beforeEach(() => {
    trigger = document.createElement("button");
    panel = document.createElement("div");
  });

  describe("position", () => {
    it("returns null position when closed", () => {
      const { result } = renderHook(() =>
        usePickerPortal({ open: false, onClose: vi.fn() }),
      );

      expect(result.current.position).toBeNull();
    });

    it("computes position from trigger rect when open", () => {
      vi.spyOn(trigger, "getBoundingClientRect").mockReturnValue(
        mockTriggerRect({ bottom: 120, left: 50 }),
      );

      const { result } = renderHook(() =>
        usePickerPortal({ open: true, onClose: vi.fn() }),
      );

      result.current.triggerRef.current = trigger;

      act(() => {
        window.dispatchEvent(new Event("resize"));
      });

      expect(result.current.position).toEqual({ top: 124, left: 50 });
    });

    it("returns null when open but trigger rect is not available", () => {
      const { result } = renderHook(() =>
        usePickerPortal({ open: true, onClose: vi.fn() }),
      );

      result.current.triggerRef.current = null;

      act(() => {
        window.dispatchEvent(new Event("resize"));
      });

      expect(result.current.position).toBeNull();
    });
  });

  describe("listener lifecycle", () => {
    it("attaches scroll and resize listeners when open", () => {
      const addSpy = vi.spyOn(window, "addEventListener");

      renderHook(() =>
        usePickerPortal({ open: true, onClose: vi.fn() }),
      );

      expect(addSpy).toHaveBeenCalledWith(
        "scroll",
        expect.any(Function),
        expect.objectContaining({ capture: true }),
      );
      expect(addSpy).toHaveBeenCalledWith(
        "resize",
        expect.any(Function),
        expect.any(Object),
      );

      addSpy.mockRestore();
    });

    it("detaches scroll and resize listeners on close", () => {
      const removeSpy = vi.spyOn(window, "removeEventListener");

      const { rerender } = renderHook(
        ({ open }) =>
          usePickerPortal({ open, onClose: vi.fn() }),
        { initialProps: { open: true } },
      );

      rerender({ open: false });

      expect(removeSpy).toHaveBeenCalledWith(
        "scroll",
        expect.any(Function),
        expect.objectContaining({ capture: true }),
      );
      expect(removeSpy).toHaveBeenCalledWith(
        "resize",
        expect.any(Function),
      );

      removeSpy.mockRestore();
    });

    it("does not attach listeners when closed", () => {
      const addSpy = vi.spyOn(window, "addEventListener");

      renderHook(() =>
        usePickerPortal({ open: false, onClose: vi.fn() }),
      );

      expect(addSpy).not.toHaveBeenCalledWith(
        "scroll",
        expect.any(Function),
        expect.any(Object),
      );
      expect(addSpy).not.toHaveBeenCalledWith(
        "resize",
        expect.any(Function),
        expect.any(Object),
      );

      addSpy.mockRestore();
    });
  });

  describe("reposition on scroll/resize", () => {
    it("recomputes position on window scroll", () => {
      const rectSpy = vi
        .spyOn(trigger, "getBoundingClientRect")
        .mockReturnValue(mockTriggerRect({ bottom: 120, left: 50 }));

      const { result } = renderHook(() =>
        usePickerPortal({ open: true, onClose: vi.fn() }),
      );

      result.current.triggerRef.current = trigger;

      rectSpy.mockReturnValue(
        mockTriggerRect({ bottom: 200, left: 75 }),
      );

      act(() => {
        window.dispatchEvent(new Event("scroll"));
      });

      expect(result.current.position).toEqual({ top: 204, left: 75 });

      rectSpy.mockRestore();
    });

    it("recomputes position on window resize", () => {
      const rectSpy = vi
        .spyOn(trigger, "getBoundingClientRect")
        .mockReturnValue(mockTriggerRect({ bottom: 120, left: 50 }));

      const { result } = renderHook(() =>
        usePickerPortal({ open: true, onClose: vi.fn() }),
      );

      result.current.triggerRef.current = trigger;

      rectSpy.mockReturnValue(
        mockTriggerRect({ bottom: 300, left: 100 }),
      );

      act(() => {
        window.dispatchEvent(new Event("resize"));
      });

      expect(result.current.position).toEqual({ top: 304, left: 100 });

      rectSpy.mockRestore();
    });
  });

  describe("click-outside", () => {
    beforeEach(() => {
      document.body.innerHTML = "";
    });

    it("invokes onClose when clicking outside trigger and panel", async () => {
      const onClose = vi.fn();

      const { result } = renderHook(() =>
        usePickerPortal({ open: true, onClose }),
      );

      const outside = document.createElement("div");
      document.body.appendChild(outside);
      result.current.triggerRef.current = trigger;
      result.current.panelRef.current = panel;
      document.body.appendChild(trigger);
      document.body.appendChild(panel);

      act(() => {
        outside.dispatchEvent(
          new MouseEvent("mousedown", { bubbles: true }),
        );
      });

      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it("does not invoke onClose when clicking inside trigger", async () => {
      const onClose = vi.fn();

      const { result } = renderHook(() =>
        usePickerPortal({ open: true, onClose }),
      );

      result.current.triggerRef.current = trigger;
      result.current.panelRef.current = panel;
      document.body.appendChild(trigger);
      document.body.appendChild(panel);

      act(() => {
        trigger.dispatchEvent(
          new MouseEvent("mousedown", { bubbles: true }),
        );
      });

      expect(onClose).not.toHaveBeenCalled();
    });

    it("does not invoke onClose when clicking inside panel", async () => {
      const onClose = vi.fn();

      const { result } = renderHook(() =>
        usePickerPortal({ open: true, onClose }),
      );

      result.current.triggerRef.current = trigger;
      result.current.panelRef.current = panel;
      document.body.appendChild(trigger);
      document.body.appendChild(panel);

      act(() => {
        panel.dispatchEvent(
          new MouseEvent("mousedown", { bubbles: true }),
        );
      });

      expect(onClose).not.toHaveBeenCalled();
    });

    it("does not invoke onClose when picker is closed", async () => {
      const onClose = vi.fn();

      renderHook(() =>
        usePickerPortal({ open: false, onClose }),
      );

      const outside = document.createElement("div");
      document.body.appendChild(outside);

      act(() => {
        outside.dispatchEvent(
          new MouseEvent("mousedown", { bubbles: true }),
        );
      });

      expect(onClose).not.toHaveBeenCalled();
    });
  });

  describe("refs", () => {
    it("returns stable trigger and panel refs", () => {
      const { result, rerender } = renderHook(() =>
        usePickerPortal({ open: false, onClose: vi.fn() }),
      );

      const triggerRef1 = result.current.triggerRef;
      const panelRef1 = result.current.panelRef;

      rerender();

      expect(result.current.triggerRef).toBe(triggerRef1);
      expect(result.current.panelRef).toBe(panelRef1);
    });
  });
});
