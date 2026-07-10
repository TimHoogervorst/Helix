import { useEffect, type RefObject } from "react";

/**
 * Fires `handler` when a mousedown event lands outside all provided refs.
 *
 * Accepts a single ref or an array of refs — useful when a popover is
 * triggered by a button that should also be treated as "inside."
 *
 * The listener is only attached when `enabled` is true — pass the popover's
 * open state so the listener is torn down when the popover is closed.
 */
export function useClickOutside(
  refs:
    | RefObject<HTMLElement | null>
    | RefObject<HTMLElement | null>[],
  handler: () => void,
  enabled: boolean,
): void {
  useEffect(() => {
    if (!enabled) return;

    const refArray = Array.isArray(refs) ? refs : [refs];

    const handleClick = (e: MouseEvent) => {
      const target = e.target as Node;
      if (!refArray.some((ref) => ref.current?.contains(target))) {
        handler();
      }
    };

    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [enabled, refs, handler]);
}
