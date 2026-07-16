/**
 * useDirtyTracking — beforeunload guard and isDirty derivation.
 *
 * Owns: the beforeunload event listener and the isDirty computation.
 * Does NOT own the values it compares — they are passed in as inputs
 * from the CRUD hook and contentRef.
 */
import { useEffect } from "react";
import type { TipTapDoc } from "../types";

export interface UseDirtyTrackingOptions {
  title: string;
  initialTitle: string;
  description: string;
  initialDescription: string;
  status: string;
  initialStatus: string;
  contentRef: React.MutableRefObject<TipTapDoc>;
  initialContent: TipTapDoc;
  /** When > 0, force isDirty = true regardless of value comparison.
   *  This ensures beforeunload fires even if all value comparisons match
   *  but there are still queued saves that haven't reached the server. */
  queueLength?: number;
}

export interface UseDirtyTrackingReturn {
  isDirty: boolean;
}

export function useDirtyTracking({
  title,
  initialTitle,
  description,
  initialDescription,
  status,
  initialStatus,
  contentRef,
  initialContent,
  queueLength = 0,
}: UseDirtyTrackingOptions): UseDirtyTrackingReturn {
  const currentContent = contentRef.current;

  const isDirty =
    queueLength > 0 ||
    title !== initialTitle ||
    description !== initialDescription ||
    status !== initialStatus ||
    JSON.stringify(currentContent) !== JSON.stringify(initialContent);

  // ── Unsaved changes guard ──
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (isDirty) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [isDirty]);

  return { isDirty };
}
