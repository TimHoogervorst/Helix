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
import { elnExtensions } from "../editor/extensions/elnExtensions";
import type { EntryDetail, Tag } from "../types";
import { useEntryWorkspace } from "../hooks/useEntryWorkspace";
import type { Folder as FolderItem } from "../hooks/useEntryFolder";
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
 *  slot children via SlotContext. Assembled from the facade and taggableItems. */
interface ElnWorkspaceEditorState {
  isReady: boolean;
  isDirty: boolean;
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
  /** Current description text. */
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

  // ── URL param reading ────────────────────────────────────────────────────
  const [searchParams] = useSearchParams();
  const isNew = searchParams.get("new") === "true";

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
  const hasAutoFocusedRef = useRef(false);

  // ── Description textarea ref (for auto-resize) ──
  const descriptionRef = useRef<HTMLTextAreaElement | null>(null);

  const navigate = useNavigate();

  // ── WorkspaceBus — one per workspace instance, shared across all slots ──
  const busRef = useRef<WorkspaceBus>(null);
  if (!busRef.current) {
    busRef.current = new WorkspaceBus();
  }
  const bus = busRef.current;

  // ── Facade hook: owns the entire save pipeline + content bridge ──────
  const workspace = useEntryWorkspace({ entryId, isNew, initialFolderId });

  // ── Tag management (stays outside the facade) ──
  const taggableItems = useTaggableItems({
    initialTags: workspace.entry?.tags ?? [],
    attachFn: !isNew && entryId
      ? async (tagIds: number[]) => {
          const updated = await attachTags(entryId, tagIds);
          workspace.save.applySavedEntry(updated);
        }
      : undefined,
    detachFn: !isNew && entryId
      ? async (tagId: number) => {
          const updated = await detachTag(entryId, tagId);
          workspace.save.applySavedEntry(updated);
        }
      : undefined,
    deferred: isNew,
  });

  // ── Destructure grouped returns ──
  const { isReady, error } = workspace;
  const { title, description, status, setTitle, setDescription, setStatus } = workspace.fields;
  const { folderId, folders, setFolderId } = workspace.folder;
  const { saveStatus, lastSavedAt, queueLength, isDirty, save, deleteEntry } = workspace.save;
  const { isLockedByOther, lockHeldBy } = workspace.lock;
  const { tags, pendingTagIds, addTag, removeTag } = taggableItems;

  // ── Derived editor state (replaces the old onStateChange / useState pattern) ──
  const editorState = useMemo<ElnWorkspaceEditorState>(() => ({
    isReady,
    isDirty,
    saveStatus,
    lastSavedAt,
    queueLength,
    entry: workspace.entry,
    folders,
    folderId,
    status,
    tags,
    description,
    isLockedByOther,
    lockHeldBy,
  }), [isReady, isDirty, saveStatus, lastSavedAt, queueLength, workspace.entry, folders, folderId, status, tags, description, isLockedByOther, lockHeldBy]);

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

  // ── Resolve editor slot bindings for TipTapRenderer ──
  const editorBindings = useMemo(() => {
    const resolved = ModRegistry.getInstance().resolveSlot("eln.editor");
    if (!resolved) return [];
    return resolved.bindings.filter(
      (b): b is BlockBinding => b.type === "block",
    );
  }, []);

  // ── sendAction bound to "eln" workspace — passed to TipTapRenderer as
  //     `onFlushActions` for useActionAccumulator to post block actions to
  //     the unified POST /api/actions/ endpoint (#327, #351).
  const sendAction = useSendAction("eln");

  // ── Emit "eln.entry.saved" on the bus whenever a save completes ───────
  const prevLastSavedAtRef = useRef<Date | null>(null);
  useEffect(() => {
    const current = editorState.lastSavedAt;
    if (current === null) return;
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

  const recentEditors = getRecentEditors(actions);
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
  const folderPath = workspace.entry?.folder_path || "";
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
        entry: workspace.entry,
        lastEditor,
        status: editorState.status,
        folders: editorState.folders,
        folderId: editorState.folderId,
        isLockedByOther: editorState.isLockedByOther,
        onStatusChange: setStatus,
        onFolderChange: setFolderId,
        resolutionMap,
        mentions: workspace.entry?.mentions ?? [],
        navigate: (path: string) => navigate(path),
      } satisfies ElnSidebarData,
    }),
    [
      entryId,
      entryDisplayId,
      workspace.entry,
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
            slotId="eln.header-actions"
            bus={bus}
            context={slotContext}
          />

          {/* ── Save status indicator ── */}
          {showActions && (() => {
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
                onClick={() => save(isNew ? pendingTagIds : undefined)}
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

        {/* ── Content: five-zone layout ── */}
        <div className="flex min-h-0 flex-1 justify-center overflow-y-auto" style={{ overflowX: "clip" }}>
          {/* Zone 2: Left gutter counterweight */}
          <div
            className="hidden xl:block shrink-0"
            style={{ width: "17.5rem" }}
            aria-hidden="true"
          />

          {/* Zone 3: Center gutter */}
          <main className="min-h-0 w-full">
            <div className="px-6 pb-24 pt-8">
              <CommentVisibilityProvider showComments={showComments}>
                {/* ── Editor chrome + TipTapRenderer ── */}
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
                  <div className="max-w-3xl mx-auto">

                    {/* Metadata line */}
                    <div
                      className="mb-3 font-mono text-[11px] uppercase tracking-widest text-muted-foreground"
                      data-testid="metadata-line"
                    >
                      {workspace.entry ? (
                        <>
                          {workspace.entry.display_id}
                          {" · "}
                          Created {formatDateShort(workspace.entry.created_at)}
                          {" · "}
                          Updated {formatDateShort(workspace.entry.updated_at)}
                        </>
                      ) : (
                        "New entry"
                      )}
                    </div>

                    {/* Title — contentEditable when not locked, plain text when locked */}
                    <h1
                      ref={(el) => {
                        titleRef.current = el;
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

                  {/* ── ProseMirror Content (TipTapRenderer) ── */}
                  <div className="min-h-[60vh]" data-testid="prosemirror-wrapper" key={entryId}>
                    <TipTapRenderer
                      slotId="eln.editor"
                      bindings={editorBindings}
                      bus={bus}
                      context={slotContext}
                      content={workspace.editor.content}
                      extensions={elnExtensions}
                      onUpdate={workspace.editor.onUpdate}
                      editable={workspace.editor.editable}
                      saveSignal={workspace.editor.saveSignal}
                      targetId={workspace.editor.targetId}
                      onFlushActions={sendAction}
                      hasPendingRef={workspace.editor.hasPendingRef}
                    />
                  </div>
                </div>
              </CommentVisibilityProvider>
            </div>
          </main>

          {/* Zone 4: Right gutter — comment cards, w-64, hidden below xl. */}
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
