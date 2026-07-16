import { useNavigate, Link } from "react-router-dom";
import { useRef, useState, useCallback, useEffect, useMemo } from "react";
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
  FlaskConical,
  Paperclip,
  Check,
  Loader2,
  AlertTriangle,
  Lock,
} from "lucide-react";
import ElnEditor from "../editor/ElnEditor";
import type { ElnEditorHandle, ElnEditorState } from "../editor/ElnEditor";
import { useMentionContext } from "../../../shell/src/mentions/MentionProvider";
import { CommentVisibilityProvider } from "../context/CommentVisibilityContext";
import { Avatar, getInitials } from "../../../shell/src/shared/Avatar";
import { useActivity } from "../hooks/useActivity";
import { getRecentEditors } from "../activityHelpers";
import MoreActions from "../components/MoreActions";
import { WorkspaceBus } from "../../../shell/src/workspace/WorkspaceBus";
import { SlotRenderer } from "../../../shell/src/workspace/SlotRenderer";
import type { SlotContext } from "../../../shell/src/mod-system/types";
import { useBlockActionLogging } from "../hooks/useBlockActionLogging";

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

interface ElnWorkspaceProps {
  entryId?: string;
}

/** Block IDs bound into the eln.editor slot — lifecycle events for these
 *  are accumulated by useBlockActionLogging and flushed to the batch
 *  actions endpoint on save. */
const EDITOR_BLOCK_IDS = [
  "eln.table-block",
  "eln.legacyTable-block",
  "eln.comment-block",
  "eln.protocol-block",
];

function ElnWorkspace({ entryId }: ElnWorkspaceProps) {
  const entryDisplayId = entryId ?? "New";

  // ── Editor state lifted from ElnEditor via callback ──
  const [editorState, setEditorState] = useState<ElnEditorState>({
    isReady: false,
    isDirty: false,
    deleting: false,
    saveStatus: "idle",
    lastSavedAt: null,
    queueLength: 0,
    entry: null,
    folders: [],
    folderId: null,
    status: "in_progress",
    tags: [],
    description: "",
    isLockedByOther: false,
    lockHeldBy: null,
  });
  const handleStateChange = useCallback((state: ElnEditorState) => {
    setEditorState(state);
  }, []);

  // ── Editor actions exposed via ref ──
  const editorRef = useRef<ElnEditorHandle>(null);
  const navigate = useNavigate();

  const showActions = editorState.isReady;

  // ── WorkspaceBus — one per workspace instance, shared across all slots ─
  const busRef = useRef<WorkspaceBus>(null);
  if (!busRef.current) {
    busRef.current = new WorkspaceBus();
  }
  const bus = busRef.current;

  // ── Block action logging: accumulate lifecycle events, flush on save ──
  useBlockActionLogging(bus, entryId, EDITOR_BLOCK_IDS);

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

  // ── SlotContext — flat metadata bag available to all blocks and buttons ─
  const slotContext: SlotContext = useMemo(
    () => ({
      workspaceId: "eln",
      user: null,
      viewMode: "edit",
      entryId,
      displayId: entryDisplayId,
    }),
    [entryId, entryDisplayId],
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
  const entry = editorState.entry;
  const folderPath = entry?.folder_path || "";
  const pathSegments = folderPath.split("/").filter(Boolean);

  return (
    <div className="flex min-h-0 min-w-0 flex-1 overflow-hidden">
      {/* ── Left column: toolbar + main content ── */}
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
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
                onClick={() => editorRef.current?.save()}
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
                  onClick: () => editorRef.current?.deleteEntry(),
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

        {/* ── Content ── */}
        {/* Main content area */}
        <main className="min-h-0 min-w-0 flex-1 overflow-y-auto">
          <div className="mx-auto max-w-3xl px-6 pb-24 pt-8">
            <CommentVisibilityProvider showComments={showComments}>
              <ElnEditor entryId={entryId} ref={editorRef} onStateChange={handleStateChange} bus={bus} slotContext={slotContext} />
            </CommentVisibilityProvider>
          </div>
        </main>
      </div>

      {/* Metadata panel — visible at xl and above, full height from top */}
      <aside className="hidden w-72 shrink-0 border-l border-hairline bg-surface/60 xl:block">
        <div className="h-full space-y-6 overflow-y-auto px-5 py-6">
            {/* ── Metadata ── */}
            <section>
              <h3 className="mb-2 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                Metadata
              </h3>
              <dl className="space-y-2.5 text-[13px]">
                <div className="flex items-start justify-between gap-3">
                  <dt className="text-muted-foreground">Author</dt>
                  <dd className="text-right">
                    {entry?.author_info ? (
                      <span className="inline-flex items-center gap-1.5">
                        <Avatar
                          initials={getInitials(entry.author_info)}
                          color={entry.author_info.color}
                          size="sm"
                        />
                        {entry.author_info.username}
                      </span>
                    ) : (
                      entry?.author_username || "—"
                    )}
                  </dd>
                </div>
                <div className="flex items-start justify-between gap-3">
                  <dt className="text-muted-foreground">Last editor</dt>
                  <dd className="text-right">
                    {lastEditor ? (
                      <span className="inline-flex items-center gap-1.5">
                        <Avatar
                          initials={getInitials(lastEditor)}
                          color={lastEditor.color}
                          size="sm"
                        />
                        {lastEditor.username}
                      </span>
                    ) : (
                      "—"
                    )}
                  </dd>
                </div>
                <div className="flex items-start justify-between gap-3">
                  <dt className="text-muted-foreground">Project</dt>
                  <dd className="text-right">
                    {entry?.folder_name || "—"}
                  </dd>
                </div>
                <div className="flex items-start justify-between gap-3">
                  <dt className="text-muted-foreground">Started</dt>
                  <dd className="text-right">
                    {entry
                      ? new Date(entry.created_at).toLocaleDateString(
                          "en-CA",
                        ) +
                        " " +
                        new Date(entry.created_at).toLocaleTimeString(
                          "en-GB",
                          { hour: "2-digit", minute: "2-digit" },
                        )
                      : "—"}
                  </dd>
                </div>
                <div className="flex items-start justify-between gap-3">
                  <dt className="text-muted-foreground">Status</dt>
                  <dd className="text-right">
                    <select
                      value={editorState.status}
                      onChange={(e) =>
                        editorRef.current?.setStatus(e.target.value)
                      }
                      disabled={editorState.isLockedByOther}
                      className="!w-auto !min-w-[120px] !py-0.5 !text-xs"
                      data-testid="status-select"
                    >
                      <option value="in_progress">In Progress</option>
                      <option value="finished">Finished</option>
                    </select>
                  </dd>
                </div>
                <div className="flex items-start justify-between gap-3">
                  <dt className="text-muted-foreground">Folder</dt>
                  <dd className="text-right">
                    <select
                      value={editorState.folderId ?? ""}
                      onChange={(e) =>
                        editorRef.current?.setFolderId(
                          e.target.value ? Number(e.target.value) : null,
                        )
                      }
                      disabled={editorState.isLockedByOther}
                      className="!w-auto !min-w-[140px] !py-0.5 !text-xs"
                      data-testid="folder-select"
                    >
                      <option value="">Folder…</option>
                      {editorState.folders.map((f) => (
                        <option key={f.id} value={f.id}>
                          {f.name}
                        </option>
                      ))}
                    </select>
                  </dd>
                </div>
              </dl>
            </section>

            {/* ── Linked entities ── */}
            <section>
              <h3 className="mb-2 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                Linked entities
              </h3>
              <div className="space-y-1.5 text-[13px]">
                {entry?.mentions && entry.mentions.length > 0 ? (
                  entry.mentions.map((mention) => {
                    const displayId = mention.target_display_id;
                    const resolved = displayId
                      ? resolutionMap.get(displayId)
                      : undefined;
                    // Use resolved title if available, otherwise fall back to mention target_title
                    const title =
                      resolved?.title || mention.target_title || "Unknown";
                    // workspace-aware navigation: /:workspaceId/:displayId
                    const workspaceId = resolved?.workspaceId;
                    const IconComponent = FlaskConical;
                    return (
                      <button
                        key={mention.id}
                        className="flex w-full items-center gap-2 rounded-md border border-hairline bg-panel px-2.5 py-1.5 text-left hover:bg-background transition-colors"
                        aria-label={`View ${title}`}
                        onClick={() => {
                          if (displayId && workspaceId) {
                            navigate(`/${workspaceId}/${displayId}`);
                          } else if (displayId) {
                            // Transitional fallback: navigate to /lims/ when
                            // workspaceId is absent (not yet resolved or
                            // entity type not yet registered).
                            navigate(`/lims/${displayId}`);
                          }
                        }}
                        disabled={!displayId}
                      >
                        <IconComponent
                          className="h-3.5 w-3.5 shrink-0 text-muted-foreground"
                          aria-hidden="true"
                        />
                        <span className="min-w-0 flex-1 truncate">
                          {title}
                        </span>
                        {displayId && (
                          <span className="shrink-0 font-mono text-[11px] text-muted-foreground">
                            {displayId}
                          </span>
                        )}
                      </button>
                    );
                  })
                ) : (
                  <p className="text-muted-foreground/60 text-[12px] italic px-0.5">
                    No linked entities
                  </p>
                )}
              </div>
            </section>

            {/* ── Attachments ── */}
            <section>
              <h3 className="mb-2 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                Attachments
              </h3>
              <div className="space-y-1.5 text-[13px]">
                <div className="flex items-center gap-2 rounded-md border border-hairline bg-panel px-2.5 py-1.5">
                  <Paperclip className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
                  <span className="min-w-0 flex-1 truncate font-mono">raw_gel_2026-06-30.tif</span>
                  <span className="shrink-0 text-[11px] text-muted-foreground">4.2 MB</span>
                </div>
                <div className="flex items-center gap-2 rounded-md border border-hairline bg-panel px-2.5 py-1.5">
                  <Paperclip className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
                  <span className="min-w-0 flex-1 truncate font-mono">plate_layout.xlsx</span>
                  <span className="shrink-0 text-[11px] text-muted-foreground">18 KB</span>
                </div>
                <div className="flex items-center gap-2 rounded-md border border-hairline bg-panel px-2.5 py-1.5">
                  <Paperclip className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
                  <span className="min-w-0 flex-1 truncate font-mono">sequencing_reads.fastq.gz</span>
                  <span className="shrink-0 text-[11px] text-muted-foreground">112 MB</span>
                </div>
              </div>
            </section>

            {/* ── Activity (slot-rendered, dogfood #233) ── */}
            <SlotRenderer
              slotId="eln.sidebar"
              bus={bus}
              context={slotContext}
            />
          </div>
        </aside>
    </div>
  );
}

export default ElnWorkspace;
