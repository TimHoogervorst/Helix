import { type RefObject, type ReactNode } from "react";
import { createPortal } from "react-dom";

export interface PickerPortalProps {
  position: { top: number; left: number } | null;
  panelRef: RefObject<HTMLDivElement | null>;
  testId: string;
  children: ReactNode;
}

const POPOVER_CLASSES =
  "z-50 w-72 max-h-60 overflow-y-auto rounded-md border border-hairline bg-popover shadow-lg";

export function PickerPortal({
  position,
  panelRef,
  testId,
  children,
}: PickerPortalProps) {
  if (!position) return null;

  return createPortal(
    <div
      ref={panelRef}
      className={POPOVER_CLASSES}
      style={{
        position: "fixed",
        top: position.top,
        left: position.left,
      }}
      data-testid={testId}
    >
      {children}
    </div>,
    document.body,
  );
}
