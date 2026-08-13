/**
 * useEntryWorkspace — facade hook for the ELN entry save pipeline.
 *
 * Owns: the full content bridge (content ref, version counter, content-phase
 * state machine, block-actions flag), baseline derivation, the debounced
 * auto-save wiring, and grouped exposure of the five underlying hooks.
 *
 * Does NOT own: tag management (useTaggableItems stays in the workspace
 * component), activity fetching, the bus, slot context, or any layout/UI.
 *
 * Key behaviours:
 * - Composes useEntryCrud + useAutoSave + useDirtyTracking + useEntryFolder
 *   behind a grouped interface (fields / folder / save / lock / editor).
 * - Content-phase state machine (loading → rAF → editing) guarantees
 *   contentRef matches the current entry before any save fires (#366).
 * - Auto-save is debounced at 2s and gated on contentPhase === "editing".
 * - Unmount flush: dirty edits saved immediately (no debounce).
 * - Baseline advanced after every auto or manual save for the beforeunload
 *   guard, but live editor state is never clobbered (cursor preservation).
 * - ``save(tagIds?)`` — only deferred tag IDs from the tags-mod wiring
 *   (outside the facade) remain a parameter; folder ID and block-actions
 *   flag are internal.
 * - The ``editor`` group is self-contained: the workspace spreads it onto
 *   TipTapRenderer and adds only infrastructure props.
 */
import { useRef, useState, useCallback, useEffect, useMemo } from "react";
import type { Editor } from "@tiptap/core";
import { EMPTY_DOC, type TipTapDoc, type EntryDetail } from "../types";
import { splitFirstParagraph } from "../entryContent";
import { useEntryCrud } from "./useEntryCrud";
import { useAutoSave, type ContentPhase } from "./useAutoSave";
import { useEntryFolder, type Folder } from "./useEntryFolder";
import { useDirtyTracking } from "./useDirtyTracking";
import type { SaveStatus } from "./useSaveQueue";

// ── Types ──────────────────────────────────────────────────────────────────

export interface UseEntryWorkspaceOptions {
  entryId?: string;
  isNew: boolean;
  initialFolderId?: number | null;
  initialProjectId?: number | null;
  projectUid?: string | null;
}

export interface UseEntryWorkspaceReturn {
  isReady: boolean;
  error: string | null;
  errorStatus: number | null;
  entry: EntryDetail | null;

  fields: {
    title: string;
    description: string;
    status: string;
    setTitle: (t: string) => void;
    setDescription: (d: string) => void;
    setStatus: (s: string) => void;
  };

  folder: {
    folderId: number | null;
    folders: Folder[];
    setFolderId: (id: number | null) => void;
  };

  save: {
    saveStatus: SaveStatus;
    lastSavedAt: Date | null;
    queueLength: number;
    isDirty: boolean;
    save: (tagIds?: number[]) => Promise<void>;
    deleteEntry: () => Promise<void>;
    applySavedEntry: (entry: EntryDetail) => void;
  };

  lock: {
    isLockedByOther: boolean;
    lockHeldBy: string | null;
  };

  editor: {
    content: TipTapDoc;
    onUpdate: (editor: Editor) => void;
    editable: boolean;
    saveSignal: Date | null;
    targetId: number | undefined;
    hasPendingRef: React.MutableRefObject<boolean>;
  };
}

// ── Hook ───────────────────────────────────────────────────────────────────

export function useEntryWorkspace({
  entryId,
  isNew,
  initialFolderId,
  initialProjectId,
  projectUid,
}: UseEntryWorkspaceOptions): UseEntryWorkspaceReturn {
  // ── Content bridge (owned by the facade) ──
  const contentRef = useRef<TipTapDoc>(EMPTY_DOC);
  const [contentVersion, setContentVersion] = useState(0);

  // Content-phase state machine: "loading" suppresses auto-save;
  // "editing" allows it. Gated by rAF after isReady goes true (#366).
  const [contentPhase, setContentPhase] = useState<ContentPhase>("loading");

  // Block action accumulation ref — set by useActionAccumulator in
  // TipTapRenderer, read at save time for the X-Block-Actions header.
  const hasBlockActionsRef = useRef<boolean>(false);

  // ── Compose hooks ──
  const crud = useEntryCrud({ entryId, isNew, contentRef });
  const folder = useEntryFolder({
    initialFolderId: initialFolderId ?? crud.entry?.folder,
    projectId: crud.entry?.project ?? initialProjectId,
    projectUid,
  });

  // Derive baseline values from the saved baseline (last persisted payload).
  const baseline = useMemo(() => {
    const saved = crud.savedBaseline;
    if (!saved) {
      return {
        title: "",
        description: "",
        content: EMPTY_DOC as TipTapDoc,
        status: "in_progress",
      };
    }
    const { description: d, body } = splitFirstParagraph(saved.content);
    return {
      title: saved.name,
      description: d,
      content: body,
      status: saved.status || "in_progress",
    };
  }, [crud.savedBaseline]);

  const { isDirty } = useDirtyTracking({
    title: crud.title,
    initialTitle: baseline.title,
    description: crud.description,
    initialDescription: baseline.description,
    status: crud.status,
    initialStatus: baseline.status,
    contentRef,
    initialContent: baseline.content,
    queueLength: crud.queueLength,
  });

  // ── Auto-save wiring ──
  // Wrap crud.autoSave so hasBlockActionsRef is read at call time
  // (the ref is updated synchronously by useActionAccumulator).
  const autoSaveWithBlockActions = useCallback(
    (folderId: number | null) => {
      crud.autoSave(folderId, hasBlockActionsRef.current ?? false);
    },
    [crud.autoSave, hasBlockActionsRef],
  );

  useAutoSave({
    entryId: entryId ?? crud.entry?.display_id,
    title: crud.title,
    description: crud.description,
    status: crud.status,
    contentVersion,
    folderId: folder.folderId,
    autoSave: autoSaveWithBlockActions,
    contentPhase,
  });

  // ── Content phase transitions ──
  //   isReady false → loading (discard stale baselines)
  //   isReady true  → rAF → editing (editor has mounted + initial onUpdate fired)
  useEffect(() => {
    if (!crud.isReady) {
      setContentPhase("loading");
      return;
    }
    const handle = requestAnimationFrame(() => {
      setContentPhase("editing");
    });
    return () => cancelAnimationFrame(handle);
  }, [crud.isReady]);

  // ── Editor update handler ──
  const handleEditorUpdate = useCallback((editor: Editor) => {
    contentRef.current = editor.getJSON() as TipTapDoc;
    setContentVersion((v) => v + 1);
  }, []);

  // ── Body content for TipTapRenderer ──
  const bodyContent = useMemo(() => {
    if (!crud.entry) return EMPTY_DOC;
    const { body } = splitFirstParagraph(crud.entry.content);
    return body;
  }, [crud.entry]);

  // ── Save (tagIds? only — folderId and blockActions are internal) ──
  const save = useCallback(
    (tagIds?: number[]) =>
      crud.save(folder.folderId, tagIds ?? [], hasBlockActionsRef.current),
    [crud.save, folder.folderId, hasBlockActionsRef],
  );

  // ── Numeric entry ID (only available after load) ──
  const numericEntryId = crud.entry?.id;

  return {
    isReady: crud.isReady,
    error: crud.error,
    errorStatus: crud.errorStatus,
    entry: crud.entry,

    fields: {
      title: crud.title,
      description: crud.description,
      status: crud.status,
      setTitle: crud.setTitle,
      setDescription: crud.setDescription,
      setStatus: crud.setStatus,
    },

    folder: {
      folderId: folder.folderId,
      folders: folder.folders,
      setFolderId: folder.setFolderId,
    },

    save: {
      saveStatus: crud.saveStatus,
      lastSavedAt: crud.lastSavedAt,
      queueLength: crud.queueLength,
      isDirty,
      save,
      deleteEntry: crud.deleteEntry,
      applySavedEntry: crud.applySavedEntry,
    },

    lock: {
      isLockedByOther: crud.isLockedByOther,
      lockHeldBy: crud.lockHeldBy,
    },

    editor: {
      content: bodyContent,
      onUpdate: handleEditorUpdate,
      editable: !crud.isLockedByOther,
      saveSignal: crud.lastSavedAt,
      targetId: numericEntryId,
      hasPendingRef: hasBlockActionsRef,
    },
  };
}
