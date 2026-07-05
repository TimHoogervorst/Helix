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
}: UseDirtyTrackingOptions): UseDirtyTrackingReturn {
  const currentContent = contentRef.current;

  const isDirty =
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
