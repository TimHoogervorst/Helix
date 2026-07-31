/**
 * useAutoSave — debounced auto-save with content-phase gating.
 *
 * Watches [entryId, title, description, status, contentVersion, folderId,
 * contentPhase] and fires autoSave() after a 2s debounce once values diverge
 * from the baseline snapshot — but only when contentPhase is "editing".
 *
 * Content-phase state machine (#366 follow-up):
 *   loading  — entry data is being fetched or the editor hasn't stabilized.
 *              Baseline is cleared, dirty flag is false, auto-save suppressed.
 *   editing  — editor is mounted with confirmed content for the current
 *              entryId.  Baseline capture and auto-save are active.
 *
 * When phase transitions to "loading" (navigation, refetch), the baseline is
 * discarded so a fresh baseline is captured from correct data when phase
 * returns to "editing" — never from stale intermediate renders.
 *
 * Unmount flush: if dirty AND phase is "editing", autoSave fires immediately
 * (no debounce) on cleanup.
 */
import { useEffect, useRef } from "react";

export type ContentPhase = "loading" | "editing";

export interface UseAutoSaveOptions {
  entryId?: string;
  title: string;
  description: string;
  status: string;
  contentVersion: number;
  folderId: number | null;
  autoSave: (folderId: number | null) => void;
  /** Content fidelity phase — only "editing" allows auto-save. */
  contentPhase?: ContentPhase;
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
  contentPhase = "loading",
}: UseAutoSaveOptions): void {
  // Refs that stay current without triggering the effect
  const autoSaveRef = useRef(autoSave);
  autoSaveRef.current = autoSave;
  const folderIdRef = useRef(folderId);
  folderIdRef.current = folderId;
  const contentPhaseRef = useRef(contentPhase);
  contentPhaseRef.current = contentPhase;

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
    // No entryId or not yet in editing phase → suppress everything.
    // During "loading" the baseline is cleared so it's never captured
    // from stale intermediate state (e.g. navigation from A→B where
    // isReady is still true but entry data is from the previous entry).
    if (!entryId || contentPhase === "loading") {
      baselineRef.current = null;
      isDirtyRef.current = false;
      return;
    }

    // contentPhase is "editing" — safe to capture baseline and save.

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
      // Re-check phase at call time — if we've left editing phase
      // since the timer was set, suppress the save.
      if (contentPhaseRef.current !== "editing") return;

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
  }, [entryId, title, description, status, contentVersion, folderId, contentPhase]);

  // ── Unmount flush ──
  useEffect(() => {
    return () => {
      clearTimer();
      // Only flush if dirty AND we're confident content matches the entry.
      if (isDirtyRef.current && contentPhaseRef.current === "editing") {
        autoSaveRef.current(folderIdRef.current);
      }
    };
    // Empty deps — only runs on unmount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
