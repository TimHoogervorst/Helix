import { useNavigate, Link } from "react-router-dom";
import { useRef, useState, useCallback, useEffect, useMemo, useLayoutEffect } from "react";
import { useSearchParams } from "react-router-dom";
import type { Editor } from "@tiptap/core";
import {
  History,
  MessageSquare,
  MessageSquareOff,
  Star,
  Share2,
  CircleCheck,
  Folder,
  ChevronRight,
  Trash2,
  Check,
  Loader2,
  AlertTriangle,
  Lock,
} from "lucide-react";
import { useMentionContext } from "../../../shell/src/mentions/MentionProvider";
import { CommentVisibilityProvider } from "../context/CommentVisibilityContext";
import { Avatar, getInitials } from "../../../shell/src/shared/Avatar";
import { useActivity } from "../hooks/useActivity";
import { getRecentEditors } from "../activityHelpers";
import MoreActions from "../components/MoreActions";
import ContentLoadingSkeleton from "../components/ContentLoadingSkeleton";
import { WorkspaceBus } from "../../../shell/src/workspace/WorkspaceBus";
import { SlotRenderer } from "../../../shell/src/workspace/SlotRenderer";
import { SlotSidebar } from "../../../shell/src/shared/components/Sidebar/SlotSidebar";
import { ModRegistry } from "../../../shell/src/mod-system/ModRegistry";
import type { SlotContext, BlockBinding } from "../../../shell/src/mod-system/types";
import type { ElnSidebarData } from "../blocks/sidebarData";
import { useSendAction } from "../../../shell/src/workspace/useSendAction";
import { TipTapRenderer } from "../../../shell/src/workspace/TipTapRenderer";
import Reference from "../editor/extensions/Reference";
import UnifiedSuggestion from "../editor/extensions/UnifiedSuggestion";
import Placeholder from "@tiptap/extension-placeholder";
import { TableKit } from "@tiptap/extension-table";
import { EMPTY_DOC, type TipTapDoc, type EntryDetail, type Tag } from "../types";
import { splitFirstParagraph } from "../hooks/useEntryEditor";
import { useEntryCrud } from "../hooks/useEntryCrud";
import { useAutoSave, type ContentPhase } from "../hooks/useAutoSave";
import { useEntryFolder, type Folder as FolderItem } from "../hooks/useEntryFolder";
import { useDirtyTracking } from "../hooks/useDirtyTracking";
import { useTaggableItems } from "../../tags/hooks";
import { TagPill } from "../../tags/ui";
import { TagAutocomplete } from "../../tags/ui";
import { attachTags, detachTag } from "../api";
import type { SaveStatus } from "../hooks/useSaveQueue";

// ── Helpers ──────────────────────────────────────────────────────────────────────

/** Format an ISO date string as YYYY-MM-DD. */
function formatDateShort(iso: string): string {
  return new Date(iso).toISOString().split("T")[0];
}

/** Placeholder icon button with tooltip — all wired in future PRDs.
 *  Uses .btn-icon so the global button background is properly overridden. */
function IconButton({
  icon: Icon,
  label,
  tooltip,
  disabled,
  onClick,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  tooltip: string;
  disabled?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      className="btn-icon rounded-md"
      aria-label={label}
      title={tooltip}
      disabled={disabled}
      onClick={onClick}
    >
      <Icon className="h-4 w-4" aria-hidden="true" />
    </button>
  );
}

// ── Types ────────────────────────────────────────────────────────────────────────

/** Snapshot of editor state used throughout the workspace and passed to
 *  slot children via SlotContext. Assembled from the composed hooks. */
interface ElnWorkspaceEditorState {
  isReady: boolean;
  isDirty: boolean;
  deleting: boolean;
  /** Current save-queue status. */
  saveStatus: SaveStatus;
  /** When the most recent successful save completed, or null. */
  lastSavedAt: Date | null;
  /** Number of items currently in the save queue. */
  queueLength: number;
  /** Full entry data for the metadata panel (null for new entries). */
  entry: EntryDetail | null;
  /** Folders available for the folder picker. */
  folders: FolderItem[];
  /** Current folder ID (null if unset). */
  folderId: number | null;
  /** Current status value from the entry. */
  status: string;
  /** Current tags on the entry. */
  tags: Tag[];
  /** Current description text (first paragraph of TipTap content). */
  description: string;
  /** True when another user holds an active lock — entry is read-only. */
  isLockedByOther: boolean;
  /** Username of the lock holder, or null. */
  lockHeldBy: string | null;
}

interface ElnWorkspaceProps {
  entryId?: string;
}

// ── Component ────────────────────────────────────────────────────────────────────

function ElnWorkspace({ entryId }: ElnWorkspaceProps) {
  const entryDisplayId = entryId ?? "New";

  // ── URL param reading (was in ElnEditor) ────────────────────────────────────
  const [searchParams] = useSearchParams();
  // A "new" entry is one that was just created server-side and navigated
  // to with ?new=true. It's immediately editable with deferred tag collection.
  const isNew = searchParams.get("new") === "true";

  // Read initial folder from URL params (set when creating from library)
  const initialFolderId: number | null = (() => {
    const raw = searchParams.get("folderId");
    if (raw) {
      const parsed = Number(raw);
      return Number.isFinite(parsed) ? parsed : null;
    }
    return null;
  })();

  // ── Title ref (for contentEditable cursor preservation) ──
  const titleRef = useRef<HTMLHeadingElement | null>(null);
  // Guard so auto-focus only fires once on mount, not on every re-render.
  const hasAutoFocusedRef = useRef(false);

  // ── Description textarea ref (for auto-resize) ──
  const descriptionRef = useRef<HTMLTextAreaElement | null>(null);

  const navigate = useNavigate();

  // ── TipTap content tracking ──
  const contentRef = useRef<TipTapDoc>(EMPTY_DOC);
  const [contentVersion, setContentVersion] = useState(0);

  // ── Content fidelity phase state machine ──
  // Only "editing" allows auto-save.  Transitions to "loading" when
  // isReady drops (navigation, refetch) and back to "editing" via rAF
  // after the editor mount + initial onUpdate have committed.
  // This guarantees contentRef.current corresponds to the current entry
  // before any save can fire.  #366 follow-up.
  const [contentPhase, setContentPhase] = useState<ContentPhase>("loading");

  // ── WorkspaceBus — one per workspace instance, shared across all slots ──
  const busRef = useRef<WorkspaceBus>(null);
  if (!busRef.current) {
    busRef.current = new WorkspaceBus();
  }
  const bus = busRef.current;

  // ── Hooks (was in ElnEditor) ──────────────────────────────────────────────
  const crud = useEntryCrud({ entryId, isNew, contentRef });
  const taggableItems = useTaggableItems({
    initialTags: crud.entry?.tags ?? [],
    attachFn: !isNew && entryId
      ? async (tagIds: number[]) => {
          const updated = await attachTags(entryId, tagIds);
          crud.setEntry(updated);
        }
      : undefined,
    detachFn: !isNew && entryId
      ? async (tagId: number) => {
          const updated = await detachTag(entryId, tagId);
          crud.setEntry(updated);
        }
      : undefined,
    deferred: isNew,
  });
  const folder = useEntryFolder({ initialFolderId });

  // ── Derive baseline values from the last-saved entry ──
  const baseline = useMemo(() => {
    const saved = crud.entry;
    if (!saved) {
      return { title: "", description: "", content: EMPTY_DOC as TipTapDoc, status: "in_progress" };
    }
    const { description: d, body } = (() => {
      const doc = saved.content;
      if (!doc || typeof doc !== "object") return { description: "", body: EMPTY_DOC as TipTapDoc };
      const c = doc as Record<string, unknown>;
      const children = c.content;
      if (Array.isArray(children) && children.length > 0) {
        const first = children[0] as Record<string, unknown>;
        if (first && first.type === "paragraph") {
          const textContent = first.content as Array<Record<string, unknown>> | undefined;
          const desc = textContent ? textContent.map((t) => t.text || "").join("") : "";
          return { description: desc, body: { ...c, content: children.slice(1) } as TipTapDoc };
        }
      }
      return { description: "", body: doc as TipTapDoc };
    })();
    // Use body (document minus first paragraph) for initialContent so the
    // dirty-tracking comparison is apples-to-apples with contentRef.current
    // (which also holds only the body after initial setContent).
    return { title: saved.name, description: d, content: body, status: saved.status || "in_progress" };
  }, [crud.entry]);

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

  // ── Block action accumulation ref (updated by useActionAccumulator in
  //     TipTapRenderer, read at save time for the X-Block-Actions header).
  //     Declared before auto-save hooks so it can be captured by
  //     autoSaveWithBlockActions. ──
  const hasBlockActionsRef = useRef<boolean>(false);

  // ── Auto-save ──
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
  //
  // The rAF gate catches the synchronous onUpdate that fires during
  // useEditor's useState initializer. Without it, the auto-save effect
  // runs in the same render commit as the editor init and may capture
  // a baseline before contentRef.current has been set.
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

  // Destructure for convenient access
  const {
    isReady,
    entry,
    title,
    setTitle,
    description,
    setDescription,
    status,
    setStatus,
    error,
    deleting,
    isLockedByOther,
    lockHeldBy,
    saveStatus,
    lastSavedAt,
    queueLength,
  } = crud;

  const {
    tags,
    pendingTagIds,
    addTag,
    removeTag,
  } = taggableItems;

  const { folderId, setFolderId, folders } = folder;

  // Wire cross-hook actions
  const save = useCallback(
    (options?: { hasBlockActions?: boolean }) =>
      crud.save(folderId, isNew ? pendingTagIds : [], options?.hasBlockActions),
    [crud.save, folderId, isNew, pendingTagIds],
  );
  const { deleteEntry } = crud;

  // ── Derived editor state (replaces the old onStateChange / useState pattern) ──
  const editorState = useMemo<ElnWorkspaceEditorState>(() => ({
    isReady,
    isDirty,
    deleting,
    saveStatus,
    lastSavedAt,
    queueLength,
    entry,
    folders,
    folderId,
    status,
    tags,
    description,
    isLockedByOther,
    lockHeldBy,
  }), [isReady, isDirty, deleting, saveStatus, lastSavedAt, queueLength, entry, folders, folderId, status, tags, description, isLockedByOther, lockHeldBy]);

  const showActions = editorState.isReady;

  // ── Sync contentEditable h1 DOM when title changes externally ──
  useLayoutEffect(() => {
    const el = titleRef.current;
    if (!el) return;
    const desired = title || "Untitled";
    if (el.textContent !== desired) {
      el.textContent = desired;
    }
  }, [title, isReady]);

  // Auto-resize description textarea to fit its content exactly.
  useLayoutEffect(() => {
    const el = descriptionRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [description]);

  // ── ELN-specific extensions (passed to TipTapRenderer as a prop) ──
  const elnExtensions = useMemo(
    () => [
      Placeholder.configure({ placeholder: "Start writing…" }),
      Reference,
      UnifiedSuggestion,
      TableKit,
    ],
    [],
  );

  // ── Resolve editor slot bindings for TipTapRenderer ──
  const editorBindings = useMemo(() => {
    const resolved = ModRegistry.getInstance().resolveSlot("eln.editor");
    if (!resolved) return [];
    return resolved.bindings.filter(
      (b): b is BlockBinding => b.type === "block",
    );
  }, []);

  // ── TipTapRenderer callbacks ──
  const handleEditorUpdate = useCallback((editor: Editor) => {
    contentRef.current = editor.getJSON() as TipTapDoc;
    setContentVersion((v) => v + 1);
  }, []);

  // ── Derive body content for TipTapRenderer ──
  // Guaranteed non-null at mount: isReady gates the renderer branch for
  // existing entries (entry is loaded), and EMPTY_DOC serves as the
  // fallback for new entries (content arrives at mount — no post-mount
  // setContent needed).
  const bodyContent = useMemo(() => {
    if (!editorState.entry) return EMPTY_DOC;
    const { body } = splitFirstParagraph(editorState.entry.content);
    return body;
  }, [editorState.entry]);

  // ── sendAction bound to "eln" workspace — passed to TipTapRenderer as
  //     `onFlushActions` for useActionAccumulator to post block actions to
  //     the unified POST /api/actions/ endpoint (#327, #351).
  const sendAction = useSendAction("eln");

  // Numeric entry ID — only available after the entry is loaded.  The
  // accumulator skips the flush when this is undefined (new entry).
  const numericEntryId = editorState.entry?.id;

  // ── Emit "eln.entry.saved" on the bus whenever a save completes ───────
  const prevLastSavedAtRef = useRef<Date | null>(null);
  useEffect(() => {
    const current = editorState.lastSavedAt;
    // Skip initial null and unchanged values
    if (current === null) return;
    // Skip the initial transition from null → first Date value on page load.
    // The entry was just fetched from the server, not saved by the user, so
    // we must not flush accumulated lifecycle events that were emitted during
    // programmatic content loading (Strict Mode re-mounts, etc.).
    if (prevLastSavedAtRef.current === null) {
      prevLastSavedAtRef.current = current;
      return;
    }
    if (prevLastSavedAtRef.current.getTime() === current.getTime()) return;
    prevLastSavedAtRef.current = current;

    bus.emit("eln.entry.saved", {
      entryId: editorState.entry?.display_id ?? entryId,
    });
  }, [editorState.lastSavedAt, editorState.entry?.display_id, entryId, bus]);

  // ── Activity data (single fetch serves Activity feed + toolbar avatars + last editor) ──
  const { actions } = useActivity(entryId);

  // Deduplicate editors from the last week for the toolbar avatar row
  const recentEditors = getRecentEditors(actions);

  // Most recent action's performer is the "last editor"
  const lastEditor =
    actions.length > 0 ? actions[0].performed_by : null;

  // ── Reference resolution for linked entities ──
  const { resolutionMap, resolveIds } = useMentionContext();

  useEffect(() => {
    const mentions = editorState.entry?.mentions;
    if (mentions && mentions.length > 0) {
      const ids = mentions
        .map((m) => m.target_display_id)
        .filter((id): id is string => id !== null);
      if (ids.length > 0) resolveIds(ids);
    }
  }, [editorState.entry?.mentions, resolveIds]);

  // ── Derived metadata for the panel ──
  const folderPath = entry?.folder_path || "";
  const pathSegments = folderPath.split("/").filter(Boolean);

  // ── SlotContext — flat metadata bag available to all blocks and buttons ─
  const slotContext: SlotContext = useMemo(
    () => ({
      workspaceId: "eln",
      user: null,
      viewMode: "edit",
      entryId,
      displayId: entryDisplayId,
      actions: ModRegistry.getInstance().getActions("eln"),
      entry: {
        entry,
        lastEditor,
        status: editorState.status,
        folders: editorState.folders,
        folderId: editorState.folderId,
        isLockedByOther: editorState.isLockedByOther,
        onStatusChange: setStatus,
        onFolderChange: setFolderId,
        resolutionMap,
        mentions: entry?.mentions ?? [],
        navigate: (path: string) => navigate(path),
      } satisfies ElnSidebarData,
    }),
    [
      entryId,
      entryDisplayId,
      entry,
      lastEditor,
      editorState.status,
      editorState.folders,
      editorState.folderId,
      editorState.isLockedByOther,
      setStatus,
      setFolderId,
      resolutionMap,
      navigate,
    ],
  );

  // ── Share state ──
  const [shareClicked, setShareClicked] = useState(false);

  // ── Comment toggle state ──
  const [showComments, setShowComments] = useState(true);
  const handleShare = useCallback(() => {
    const url = `${window.location.origin}/eln/${entryDisplayId}`;
    navigator.clipboard.writeText(url).then(() => {
      setShareClicked(true);
      setTimeout(() => setShareClicked(false), 2000);
    }).catch(() => {
      // Clipboard API may fail in insecure contexts; no-op
    });
  }, [entryDisplayId]);

  // ── Render: loading / error states ──

  if (!isReady && !error) {
    return (
      <div className="flex min-h-0 min-w-0 flex-1">
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <div className="flex min-h-0 flex-1 justify-center overflow-y-auto" style={{ overflowX: "clip" }}>
            <main className="min-h-0 w-full">
              <div className="px-6 pb-24 pt-8">
                <ContentLoadingSkeleton />
              </div>
            </main>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex min-h-0 min-w-0 flex-1">
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <div className="flex min-h-0 flex-1 justify-center overflow-y-auto" style={{ overflowX: "clip" }}>
            <main className="min-h-0 w-full">
              <div className="px-6 pb-24 pt-8">
                <div>
                  <div className="error">{error}</div>
                  <button onClick={() => navigate("/library")}>← Back to entries</button>
                </div>
              </div>
            </main>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 min-w-0 flex-1">
      {/* ── Left column: toolbar + main content (scrolls independently) ── */}
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        {/* ── Top toolbar ── */}
        <div className="flex items-center justify-between border-b border-hairline px-6 py-2.5">
        {/* Left: breadcrumbs — real folder path with clickable segments */}
        <div className="flex items-center gap-1.5 text-[13px] text-muted-foreground">
          <Folder
            className="h-3.5 w-3.5 text-muted-foreground"
            aria-hidden="true"
          />
          {pathSegments.length > 0 ? (
            pathSegments.map((segment, i) => {
              const isLast = i === pathSegments.length - 1;
              const segmentPath = "/" + pathSegments.slice(0, i + 1).join("/");
              return (
                <span key={i} className="flex items-center gap-1.5">
                  {isLast ? (
                    <span>{segment}</span>
                  ) : (
                    <Link
                      to={`/library?path=${encodeURIComponent(segmentPath)}`}
                      className="hover:text-foreground transition-colors"
                    >
                      {segment}
                    </Link>
                  )}
                  <ChevronRight
                    className="h-3.5 w-3.5 text-muted-foreground/60"
                    aria-hidden="true"
                  />
                </span>
              );
            })
          ) : (
            <>
              <span>—</span>
              <ChevronRight
                className="h-3.5 w-3.5 text-muted-foreground/60"
                aria-hidden="true"
              />
            </>
          )}
          <span className="font-medium text-foreground">
            {entryDisplayId}
          </span>
        </div>

        {/* Right: actions + avatars + share */}
        <div className="flex items-center gap-1">
          {/* ── Slot-rendered header actions (dogfood #227) ── */}
          <SlotRenderer
            slotId="eln.header.actions"
            bus={bus}
            context={slotContext}
          />

          {/* ── Save status indicator ── */}
          {showActions && (() => {
            // When locked by another user, show lock icon with tooltip.
            if (editorState.isLockedByOther) {
              const lockLabel = `Locked by ${editorState.lockHeldBy || "another user"} — read-only`;
              return (
                <span
                  className="btn-icon rounded-md"
                  aria-label={lockLabel}
                  title={lockLabel}
                >
                  <Lock className="h-4 w-4 text-amber-600 dark:text-amber-400" aria-hidden="true" />
                </span>
              );
            }

            const isSaving = editorState.saveStatus === "saving" || editorState.queueLength > 0;
            const isError = editorState.saveStatus === "error";

            let Icon: React.ComponentType<{ className?: string }>;
            let label: string;
            let iconClass: string;

            if (isError) {
              Icon = AlertTriangle;
              label = "Save failed — click to retry";
              iconClass = "h-4 w-4 text-destructive";
            } else if (isSaving) {
              Icon = Loader2;
              label = "Saving…";
              iconClass = "h-4 w-4 animate-spin text-muted-foreground";
            } else {
              Icon = Check;
              label = "Saved";
              iconClass = "h-4 w-4 text-muted-foreground";
            }

            return (
              <button
                className="btn-icon rounded-md"
                aria-label={label}
                title={label}
                onClick={() => save({ hasBlockActions: hasBlockActionsRef.current })}
              >
                <Icon className={iconClass} aria-hidden="true" />
              </button>
            );
          })()}

          <IconButton
            icon={History}
            label="History"
            tooltip="Placeholder — version history coming soon"
          />
          {/* ── Global comment toggle ── */}
          <button
            className={`btn-icon rounded-md ${
              showComments
                ? "bg-primary text-primary-foreground hover:bg-primary/90"
                : ""
            }`}
            aria-label={showComments ? "Hide comments" : "Show comments"}
            aria-pressed={showComments}
            title={showComments ? "Hide comments" : "Show comments"}
            onClick={() => setShowComments((prev) => !prev)}
          >
            {showComments ? (
              <MessageSquare className="h-4 w-4" aria-hidden="true" />
            ) : (
              <MessageSquareOff className="h-4 w-4" aria-hidden="true" />
            )}
          </button>
          <IconButton
            icon={Star}
            label="Star"
            tooltip="Placeholder — bookmark coming soon"
          />

          {/* ── MoreActions dropdown (Delete) — hidden when locked ── */}
          {showActions && !editorState.isLockedByOther && (
            <MoreActions
              items={[
                {
                  key: "delete",
                  icon: Trash2,
                  label: "Delete",
                  onClick: () => deleteEntry(),
                  destructive: true,
                },
              ]}
            />
          )}

          {/* Separator */}
          <div className="mx-1.5 h-4 w-px bg-hairline" aria-hidden="true" />

          {/* Recent editor avatars — up to 3 distinct editors from last week */}
          {recentEditors.length > 0 && (
            <div className="flex -space-x-1.5">
              {recentEditors.slice(0, 3).map((action) => (
                <Avatar
                  key={action.performed_by.id}
                  initials={getInitials(action.performed_by)}
                  color={action.performed_by.color}
                  size="sm"
                />
              ))}
              {recentEditors.length > 3 && (
                <span className="inline-grid h-6 w-6 shrink-0 place-items-center rounded-full bg-muted font-mono text-[9.5px] font-medium text-muted-foreground ring-2 ring-background">
                  …
                </span>
              )}
            </div>
          )}

          {/* Share button — copies canonical URL to clipboard */}
          <button
            className={`ml-2 flex items-center gap-1.5 rounded-md px-2 py-1.5 text-[12px] transition-colors ${
              shareClicked
                ? "bg-success text-success-foreground"
                : "bg-primary text-primary-foreground hover:opacity-90"
            }`}
            aria-label={shareClicked ? "Copied!" : "Share"}
            title={shareClicked ? "Copied!" : "Copy link to clipboard"}
            onClick={handleShare}
          >
            {shareClicked ? (
              <Check className="h-3.5 w-3.5" aria-hidden="true" />
            ) : (
              <Share2 className="h-3.5 w-3.5" aria-hidden="true" />
            )}
          </button>

          {/* Sign & Witness button */}
          <button
            className="flex items-center gap-1.5 rounded-md bg-primary px-2.5 py-1 text-[12px] font-medium text-primary-foreground hover:opacity-90"
            aria-label="Sign & Witness"
            title="Placeholder — sign & witness coming soon"
          >
            <CircleCheck className="h-3.5 w-3.5" aria-hidden="true" />
            Sign &amp; witness
          </button>
        </div>
      </div>

        {/* ── Content: five-zone layout (zones 2–5; zone 1 left sidebar is from Layout.tsx) ── */}
        {/* An invisible left counterweight (zone 2) balances the right gutter
            (zone 4) so the center gutter (zone 3) is always horizontally
            centred via justify-center — the group (counterweight + center +
            right gutter) is symmetric.  When comments hide below xl, the
            counterweight hides with them so the center gutter is still centred.

            Scroll lives on this five-zone content row, not on
            Layout's <main> — the scrollbar stays between the left sidebar
            and the right sidebar. The toolbar above is fixed (not scrollable). */}
        <div className="flex min-h-0 flex-1 justify-center overflow-y-auto" style={{ overflowX: "clip" }}>
          {/* Zone 2: Left gutter counterweight — invisible spacer matching
              right gutter width (w-64 16rem + ml-6 1.5rem = 17.5rem).
              Hidden together with the right gutter below xl. */}
          <div
            className="hidden xl:block shrink-0"
            style={{ width: "17.5rem" }}
            aria-hidden="true"
          />

          {/* Zone 3: Center gutter — per-block centering (max-w-3xl mx-auto)
              lives on .ProseMirror children and BlockNodeView wrappers.
              No max-w-3xl on <main> itself so stretched blocks can expand
              beyond the text column into the gutter space. */}
          <main className="min-h-0 w-full">
            <div className="px-6 pb-24 pt-8">
              <CommentVisibilityProvider showComments={showComments}>
                {/* ── Editor chrome + TipTapRenderer (was ElnEditor) ── */}
                <div>
                  {/* ── Locked banner ── */}
                  {isLockedByOther && (
                    <div
                      className="mb-4 flex items-center gap-2 rounded-md border border-gray-200 bg-gray-50 px-4 py-2.5 text-[13px] text-gray-600 dark:border-gray-700 dark:bg-gray-800/70 dark:text-gray-200"
                      data-testid="locked-banner"
                    >
                      <Lock className="h-4 w-4 shrink-0" aria-hidden="true" />
                      <span>
                        This entry is currently being edited by{" "}
                        <strong>{lockHeldBy || "another user"}</strong>. You are viewing it
                        in read-only mode.
                      </span>
                    </div>
                  )}

                  {/* ── Content area ── */}

                  {/* Header section: centred like ProseMirror text, so the title,
                      description, tags, and metadata line align with the text column.
                      Stretch blocks (e.g. registry tables) still expand full-width
                      because the ProseMirror wrapper lives outside this container. */}
                  <div className="max-w-3xl mx-auto">

                    {/* Metadata line */}
                    <div
                      className="mb-3 font-mono text-[11px] uppercase tracking-widest text-muted-foreground"
                      data-testid="metadata-line"
                    >
                      {entry ? (
                        <>
                          {entry.display_id}
                          {" · "}
                          Created {formatDateShort(entry.created_at)}
                          {" · "}
                          Updated {formatDateShort(entry.updated_at)}
                        </>
                      ) : (
                        "New entry"
                      )}
                    </div>

                    {/* Title — contentEditable when not locked, plain text when locked */}
                    <h1
                      ref={(el) => {
                        titleRef.current = el;
                        // Autofocus new entries exactly once on mount (not on every re-render).
                        if (el && isNew && !isLockedByOther && !hasAutoFocusedRef.current) {
                          hasAutoFocusedRef.current = true;
                          requestAnimationFrame(() => el.focus());
                        }
                      }}
                      contentEditable={!isLockedByOther}
                      suppressContentEditableWarning
                      onInput={(e) => {
                        if (!isLockedByOther) setTitle(e.currentTarget.textContent || "");
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") e.preventDefault();
                      }}
                      onPaste={(e) => {
                        if (isLockedByOther) return;
                        e.preventDefault();
                        const text = e.clipboardData.getData("text/plain");
                        document.execCommand("insertText", false, text);
                      }}
                      onBlur={() => {
                        if (!isLockedByOther && title.trim() !== title) setTitle(title.trim());
                      }}
                      className="mb-3 font-serif text-[42px] font-semibold leading-[1.05] tracking-tight text-foreground outline-none empty:before:text-muted-foreground/30 empty:before:content-['Untitled']"
                      data-testid="title-display"
                    />

                    {/* Description — textarea, readOnly when locked */}
                    <textarea
                      ref={descriptionRef}
                      className="eln-description-textarea mb-3 w-full resize-none overflow-hidden text-[15px] leading-relaxed text-muted-foreground placeholder:text-muted-foreground/30"
                      value={description}
                      onChange={(e) => {
                        if (!isLockedByOther) setDescription(e.target.value);
                      }}
                      readOnly={isLockedByOther}
                      placeholder="Add a description…"
                      data-testid="description-input"
                    />

                    {/* Tags — read-only display when locked */}
                    <div className="mt-3 flex flex-wrap items-center gap-1.5" data-testid="tags-section">
                      {tags.map((tag) => (
                        <TagPill
                          key={tag.id}
                          tag={tag}
                          onRemove={isLockedByOther ? undefined : removeTag}
                        />
                      ))}

                      {!isLockedByOther && (
                        <TagAutocomplete
                          attachedTagIds={tags.map((t) => t.id)}
                          onTagSelect={addTag}
                          onTagCreated={addTag}
                          placeholder="Search tags…"
                        />
                      )}
                    </div>

                    {/* Hairline divider */}
                    <div className="my-6 h-px bg-hairline" data-testid="content-divider" />

                  </div>

                  {/* ── ProseMirror Content (TipTapRenderer) ──
                      Not constrained by max-w-3xl so stretch blocks (registry tables,
                      etc.) can expand into the gutters. Per-child centering is handled
                      by .ProseMirror > * in styles.css. */}
                  <div className="min-h-[60vh]" data-testid="prosemirror-wrapper" key={entryId}>
                    <TipTapRenderer
                      slotId="eln.editor"
                      bindings={editorBindings}
                      bus={bus}
                      context={slotContext}
                      content={bodyContent}
                      extensions={elnExtensions}
                      onUpdate={handleEditorUpdate}
                      editable={!editorState.isLockedByOther}
                      saveSignal={editorState.lastSavedAt}
                      targetId={numericEntryId}
                      onFlushActions={sendAction}
                      hasPendingRef={hasBlockActionsRef}
                    />
                  </div>
                </div>
              </CommentVisibilityProvider>
            </div>
          </main>

          {/* Zone 4: Right gutter — comment cards, w-64, hidden below xl.
              Border separator only appears when the gutter has content
              (rendered by comment card components — future PRD). */}
          <aside
            className="hidden xl:block w-64 shrink-0 overflow-y-auto ml-6"
            aria-label="Comments"
          >
            {/* Comment cards rendered here — future PRD */}
          </aside>
        </div>
      </div>

      {/* Zone 5: Right sidebar — metadata panel, w-72, hidden below xl */}
      <SlotSidebar
        slotId="eln.sidebar"
        context={slotContext}
        bus={bus}
      />
    </div>
  );
}

export default ElnWorkspace;
