/**
 * useAutoSave — debounced auto-save with initial-load suppression.
 *
 * Watches [entryId, title, description, status, contentVersion, folderId] and
 * fires autoSave() after a 2s debounce once values diverge from the baseline
 * snapshot captured when entryId first resolves.
 *
 * Unmount flush: if dirty, autoSave fires immediately (no debounce) on cleanup.
 */
import { useEffect, useRef } from "react";

export interface UseAutoSaveOptions {
  entryId?: string;
  title: string;
  description: string;
  status: string;
  contentVersion: number;
  folderId: number | null;
  autoSave: (folderId: number | null) => void;
}

/**
 * Pure side-effect hook — returns nothing. Callers pass the current values and
 * the autoSave callback; the hook manages debounce timing.
 */
export function useAutoSave({
  entryId,
  title,
  description,
  status,
  contentVersion,
  folderId,
  autoSave,
}: UseAutoSaveOptions): void {
  // Refs that stay current without triggering the effect
  const autoSaveRef = useRef(autoSave);
  autoSaveRef.current = autoSave;
  const folderIdRef = useRef(folderId);
  folderIdRef.current = folderId;

  // Baseline snapshot — captured when entryId resolves, used to suppress
  // initial-load saves.
  const baselineRef = useRef<{
    entryId: string;
    title: string;
    description: string;
    status: string;
    contentVersion: number;
    folderId: number | null;
  } | null>(null);

  const isDirtyRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTimer = () => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };

  // ── Debounced auto-save effect ──
  useEffect(() => {
    // No entryId → nothing to save
    if (!entryId) {
      baselineRef.current = null;
      isDirtyRef.current = false;
      return;
    }

    // Capture baseline on first resolve or when entryId changes
    if (!baselineRef.current || baselineRef.current.entryId !== entryId) {
      baselineRef.current = {
        entryId,
        title,
        description,
        status,
        contentVersion,
        folderId,
      };
      isDirtyRef.current = false;
      return;
    }

    const baseline = baselineRef.current;

    // Check if any watched value diverges from baseline
    const dirty =
      title !== baseline.title ||
      description !== baseline.description ||
      status !== baseline.status ||
      contentVersion !== baseline.contentVersion ||
      folderId !== baseline.folderId;

    if (!dirty) return;

    isDirtyRef.current = true;

    // Restart the debounce timer
    clearTimer();
    timerRef.current = setTimeout(() => {
      autoSaveRef.current(folderIdRef.current);
      // Update baseline to current values after save fires
      baselineRef.current = {
        entryId,
        title,
        description,
        status,
        contentVersion,
        folderId,
      };
      isDirtyRef.current = false;
    }, 2000);

    return clearTimer;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entryId, title, description, status, contentVersion, folderId]);

  // ── Unmount flush ──
  useEffect(() => {
    return () => {
      clearTimer();
      if (isDirtyRef.current) {
        autoSaveRef.current(folderIdRef.current);
      }
    };
    // Empty deps — only runs on unmount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
