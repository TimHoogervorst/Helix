import { useRef, useState, useCallback, useLayoutEffect } from "react";
import type { ReactNode } from "react";
import { Link } from "react-router-dom";
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
import { CommentVisibilityProvider } from "../context/CommentVisibilityContext";
import { Avatar, getInitials } from "../../../shell/src/shared/Avatar";
import MoreActions from "../components/MoreActions";
import ContentLoadingSkeleton from "../components/ContentLoadingSkeleton";
import { TagSection } from "../../tags/ui";
import { Button } from "../../../shell/src/shared/primitives/Button";
import { IconButton } from "../../../shell/src/shared/primitives/IconButton";
import NotFound from "../../../shell/src/shared/components/NotFound";
import { pathSegments, segmentPath } from "../../library/path";
import type { EntryDetail, Tag, ElnAction, SourcePathSegment } from "../types";
import type { SaveStatus } from "../hooks/useSaveQueue";

function formatDateShort(iso: string): string {
  return new Date(iso).toISOString().split("T")[0];
}

export interface ElnChromeProps {
  isReady: boolean;
  error: string | null;
  errorStatus?: number | null;
  isNew: boolean;
  entryDisplayId: string;

  entry: EntryDetail | null;
  projectUid?: string | null;
  folderPath: string;
  sourcePath?: SourcePathSegment[];

  title: string;
  onTitleChange: (t: string) => void;

  description: string;
  onDescriptionChange: (d: string) => void;

  isLockedByOther: boolean;
  lockHeldBy: string | null;

  saveStatus: SaveStatus;
  queueLength: number;
  onSave: () => void;
  onDelete: () => void;

  tags: Tag[];
  onAddTag: (tag: Tag) => void;
  onRemoveTag: (tagId: number) => void;

  recentEditors: ElnAction[];

  headerActions: ReactNode;
  editor: ReactNode;
  onAppendParagraph: () => void;
  sidebar: ReactNode;
}

function ElnChrome({
  isReady,
  error,
  errorStatus,
  isNew,
  entryDisplayId,
  entry,
  projectUid,
  folderPath,
  sourcePath,
  title,
  onTitleChange,
  description,
  onDescriptionChange,
  isLockedByOther,
  lockHeldBy,
  saveStatus,
  queueLength,
  onSave,
  onDelete,
  tags,
  onAddTag,
  onRemoveTag,
  recentEditors,
  headerActions,
  editor,
  onAppendParagraph,
  sidebar,
}: ElnChromeProps) {
  const titleRef = useRef<HTMLHeadingElement | null>(null);
  const hasAutoFocusedRef = useRef(false);
  const descriptionRef = useRef<HTMLTextAreaElement | null>(null);

  const [showComments, setShowComments] = useState(true);
  const [shareClicked, setShareClicked] = useState(false);

  const handleShare = useCallback(() => {
    const url = `${window.location.origin}/eln/${entryDisplayId}`;
    navigator.clipboard.writeText(url).then(() => {
      setShareClicked(true);
      setTimeout(() => setShareClicked(false), 2000);
    }).catch(() => {});
  }, [entryDisplayId]);

  useLayoutEffect(() => {
    const el = titleRef.current;
    if (!el) return;
    const desired = title || "Untitled";
    if (el.textContent !== desired) {
      el.textContent = desired;
    }
  }, [title, isReady]);

  useLayoutEffect(() => {
    const el = descriptionRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [description]);

  const sourceSegments = sourcePath ?? entry?.source_path ?? [];
  const projectSegment = sourceSegments.find((segment) => segment.kind === "project");
  const resolvedProjectUid = projectSegment?.uid ?? projectUid;
  const libraryRoot = resolvedProjectUid
    ? `/library?project=${encodeURIComponent(resolvedProjectUid)}`
    : "/library";
  const folderPathSegments = pathSegments(folderPath);

  if (!isReady && !error) {
    return (
      <div className="flex min-h-0 min-w-0 flex-1">
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <div className="flex min-h-0 flex-1 overflow-y-auto" style={{ overflowX: "clip" }}>
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
    if (errorStatus === 404) {
      return <NotFound />;
    }

    return (
      <div className="flex min-h-0 min-w-0 flex-1">
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <div className="flex min-h-0 flex-1 overflow-y-auto" style={{ overflowX: "clip" }}>
            <main className="min-h-0 w-full">
              <div className="px-6 pb-24 pt-8">
                <div>
                  <div className="error">{error}</div>
                  <Link to="/library">← Back to entries</Link>
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
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        {/* ── Top toolbar ── */}
        <div className="flex items-center justify-between border-b border-hairline px-6 py-2.5">
          {/* Left: breadcrumbs */}
          <div className="flex items-center gap-1.5 text-base text-muted-foreground">
            <Folder
              className="h-3.5 w-3.5 text-muted-foreground"
              aria-hidden="true"
            />
            {sourceSegments.length > 0 ? (
              sourceSegments.map((segment, index) => {
                const folders = sourceSegments
                  .slice(0, index + 1)
                  .filter((item) => item.kind === "folder")
                  .map((item) => item.name);
                let to = libraryRoot;
                if (segment.kind === "folder") {
                  to = `${libraryRoot}&path=${encodeURIComponent(`/${folders.join("/")}`)}`;
                } else if (segment.kind === "entry") {
                  to = `/eln/${segment.display_id}`;
                } else if (segment.kind === "entity") {
                  to = `/lims/${segment.display_id}`;
                }
                return (
                  <span key={`${segment.kind}-${segment.id}`} className="flex items-center gap-1.5">
                    <Link to={to} className="hover:text-foreground transition-colors">
                      {segment.name}
                    </Link>
                    <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/60" aria-hidden="true" />
                  </span>
                );
              })
            ) : folderPathSegments.length > 0 ? (
              folderPathSegments.map((segment, i) => {
                const isLast = i === folderPathSegments.length - 1;
                const path = segmentPath(folderPathSegments, i);
                return (
                  <span key={i} className="flex items-center gap-1.5">
                    {isLast ? (
                      <span>{segment}</span>
                    ) : (
                      <Link
                        to={`${libraryRoot}&path=${encodeURIComponent(path)}`}
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
            ) : null}
            <span className="font-medium text-foreground">
              {entryDisplayId}
            </span>
          </div>

          {/* Right: actions + avatars + share */}
          <div className="flex items-center gap-1">
            {headerActions}

            {/* ── Save status indicator ── */}
            {isReady && (() => {
              if (isLockedByOther) {
                const lockLabel = `Locked by ${lockHeldBy || "another user"} — read-only`;
                return (
                  <IconButton
                    aria-label={lockLabel}
                    title={lockLabel}
                  >
                    <Lock className="h-5 w-5 text-[var(--color-warning)]" aria-hidden="true" />
                  </IconButton>
                );
              }

              const isSaving = saveStatus === "saving" || queueLength > 0;
              const isError = saveStatus === "error";

              let Icon: React.ComponentType<{ className?: string }>;
              let label: string;
              let iconClass: string;

              if (isError) {
                Icon = AlertTriangle;
                label = "Save failed — click to retry";
                iconClass = "h-5 w-5 text-destructive";
              } else if (isSaving) {
                Icon = Loader2;
                label = "Saving…";
                iconClass = "h-5 w-5 animate-spin text-muted-foreground";
              } else {
                Icon = Check;
                label = "Saved";
                iconClass = "h-5 w-5 text-muted-foreground";
              }

              return (
                <IconButton
                  aria-label={label}
                  title={label}
                  onClick={onSave}
                >
                  <Icon className={iconClass} aria-hidden="true" />
                </IconButton>
              );
            })()}

            <IconButton
              aria-label="History"
              title="Placeholder — version history coming soon"
            >
              <History className="h-5 w-5" aria-hidden="true" />
            </IconButton>
            {/* ── Global comment toggle ── */}
            <IconButton
              aria-label={showComments ? "Hide comments" : "Show comments"}
              aria-pressed={showComments}
              title={showComments ? "Hide comments" : "Show comments"}
              onClick={() => setShowComments((prev) => !prev)}
            >
              {showComments ? (
                <MessageSquare className="h-5 w-5" aria-hidden="true" />
              ) : (
                <MessageSquareOff className="h-5 w-5" aria-hidden="true" />
              )}
            </IconButton>
            <IconButton
              aria-label="Star"
              title="Placeholder — bookmark coming soon"
            >
              <Star className="h-5 w-5" aria-hidden="true" />
            </IconButton>

            {/* ── MoreActions dropdown (Delete) — hidden when locked ── */}
            {isReady && !isLockedByOther && (
              <MoreActions
                items={[
                  {
                    key: "delete",
                    icon: Trash2,
                    label: "Delete",
                    onClick: onDelete,
                    destructive: true,
                  },
                ]}
              />
            )}

            {/* Separator */}
            <div className="mx-1.5 h-4 w-px bg-hairline" aria-hidden="true" />

            {/* Recent editor avatars */}
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
                  <span className="inline-grid h-6 w-6 shrink-0 place-items-center rounded-full bg-muted font-[var(--font-label)] text-2xs font-medium text-muted-foreground ring-2 ring-background">
                    …
                  </span>
                )}
              </div>
            )}

            {/* Share button */}
            <Button
              variant="primary"
              className={`ml-2 ${shareClicked ? "!bg-[var(--color-success)] !text-[var(--color-success-foreground)] !border-[var(--color-success)]" : ""}`}
              aria-label={shareClicked ? "Copied!" : "Share"}
              title={shareClicked ? "Copied!" : "Copy link to clipboard"}
              onClick={handleShare}
            >
              {shareClicked ? (
                <Check className="h-3.5 w-3.5" aria-hidden="true" />
              ) : (
                <Share2 className="h-3.5 w-3.5" aria-hidden="true" />
              )}
            </Button>

            {/* Sign & Witness button */}
            <Button
              variant="primary"
              aria-label="Sign & Witness"
              title="Placeholder — sign & witness coming soon"
            >
              <CircleCheck className="h-3.5 w-3.5" aria-hidden="true" />
              Sign &amp; witness
            </Button>
          </div>
        </div>

        {/* ── Content: padded full-bleed editor ── */}
        <div className="flex min-h-0 flex-1 overflow-y-auto" style={{ overflowX: "clip" }}>
          <main className="min-h-0 w-full">
            <div className="px-6 pb-24 pt-8">
              <CommentVisibilityProvider showComments={showComments}>
                <div>
                  {/* ── Locked banner ── */}
                  {isLockedByOther && (
                    <div
                      className="mb-4 flex items-center gap-2 rounded-md border border-[var(--color-ink-hairline)] bg-[var(--color-surface)] px-4 py-2.5 text-base text-[var(--color-ink-muted-foreground)]"
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
                  <div className="workspace-text-column">

                    {/* Metadata line */}
                    <div
                      className="mb-3 font-[var(--font-label)] text-xs uppercase tracking-widest text-muted-foreground"
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

                    {/* Title */}
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
                        if (!isLockedByOther) onTitleChange(e.currentTarget.textContent || "");
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
                        if (!isLockedByOther && title.trim() !== title) onTitleChange(title.trim());
                      }}
                      className="mb-3 font-[var(--font-body)] text-4xl font-semibold leading-[1.05] tracking-tight text-foreground outline-none empty:before:text-muted-foreground/30 empty:before:content-['Untitled']"
                      data-testid="title-display"
                    />

                    {/* Description */}
                    <textarea
                      ref={descriptionRef}
                      className="eln-description-textarea mb-3 w-full resize-none overflow-hidden text-md leading-relaxed text-muted-foreground placeholder:text-muted-foreground/30"
                      value={description}
                      onChange={(e) => {
                        if (!isLockedByOther) onDescriptionChange(e.target.value);
                      }}
                      readOnly={isLockedByOther}
                      placeholder="Add a description…"
                      data-testid="description-input"
                    />

                    {/* Tags */}
                    <TagSection
                      tags={tags}
                      onAddTag={isLockedByOther ? undefined : onAddTag}
                      onRemoveTag={isLockedByOther ? undefined : onRemoveTag}
                    />

                    {/* Hairline divider */}
                    <div className="my-6 h-px bg-hairline" data-testid="content-divider" />

                  </div>

                  {/* ── ProseMirror Content (injected editor) ── */}
                  <div
                    className="min-h-[60vh]"
                    data-testid="prosemirror-wrapper"
                    onClick={(event) => {
                      const target = event.target;
                      if (!(target instanceof Element)) return;
                      if (
                        !target.closest(".ProseMirror") ||
                        target.closest(".ProseMirror > *")
                      ) {
                        return;
                      }
                      if (!isLockedByOther) onAppendParagraph();
                    }}
                  >
                    {editor}
                  </div>
                  <button
                    type="button"
                    className="eln-end-of-entry workspace-text-column block w-full border-0 bg-transparent p-0 text-left"
                    data-testid="end-of-entry"
                    onClick={() => !isLockedByOther && onAppendParagraph()}
                  >
                    <div className="h-px bg-hairline" />
                    <div className="flex items-center justify-between pt-2 font-[var(--font-label)] text-xs uppercase tracking-widest text-muted-foreground">
                      <span>{`ELN – ${entryDisplayId}`}</span>
                      <span>End of Entry</span>
                    </div>
                  </button>
                </div>
              </CommentVisibilityProvider>
            </div>
          </main>
        </div>
      </div>

      {/* Metadata sidebar */}
      {sidebar && <div className="hidden xl:block">{sidebar}</div>}
    </div>
  );
}

export default ElnChrome;
