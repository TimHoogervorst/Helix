import { useEffect, useRef, useState, type RefObject } from "react";
import { useClickOutside } from "./useClickOutside";

export interface UsePickerPortalArgs {
  open: boolean;
  onClose: () => void;
}

export interface UsePickerPortalResult {
  triggerRef: RefObject<HTMLElement | null>;
  panelRef: RefObject<HTMLDivElement | null>;
  position: { top: number; left: number } | null;
}

export function usePickerPortal({
  open,
  onClose,
}: UsePickerPortalArgs): UsePickerPortalResult {
  const triggerRef = useRef<HTMLElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const [position, setPosition] = useState<{
    top: number;
    left: number;
  } | null>(null);

  useEffect(() => {
    if (!open) {
      setPosition(null);
      return;
    }

    const recalc = () => {
      const trigger = triggerRef.current;
      if (!trigger) return;
      const rect = trigger.getBoundingClientRect();
      setPosition({
        top: rect.bottom + 4,
        left: rect.left,
      });
    };

    recalc();
    window.addEventListener("scroll", recalc, { capture: true, passive: true });
    window.addEventListener("resize", recalc, { passive: true });
    return () => {
      window.removeEventListener("scroll", recalc, { capture: true });
      window.removeEventListener("resize", recalc);
    };
  }, [open]);

  useClickOutside([triggerRef, panelRef], onClose, open);

  return { triggerRef, panelRef, position };
}
