import { useEffect, type RefObject } from "react";

/**
 * Fires `handler` when a mousedown event lands outside `ref`.
 *
 * The listener is only attached when `enabled` is true — pass the popover's
 * open state so the listener is torn down when the popover is closed.
 *
 * Used by UserMenu, LibraryNewDropdown, LimsTableNode, and TagIconPopover
 * to dismiss popovers on outside click.
 */
export function useClickOutside(
  ref: RefObject<HTMLElement | null>,
  handler: () => void,
  enabled: boolean,
): void {
  useEffect(() => {
    if (!enabled) return;

    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        handler();
      }
    };

    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [enabled, ref, handler]);
}
