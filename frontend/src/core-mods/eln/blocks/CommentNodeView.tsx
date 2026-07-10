/**
 * React NodeView for the elnComment TipTap node.
 *
 * Renders a threaded comment card: author avatar (initials on colored background),
 * full name, relative timestamp, and an editable comment body. Supports:
 * - Reply: inline reply input adds entries to the thread array
 * - Resolve: sets the resolved flag, collapses to a checkmark icon
 * - Collapse/expand: hides replies behind a "Show N replies" toggle
 *
 * On first render with an empty thread, auto-initializes the first comment
 * entry from the current user.  Subsequent edits sync back to node attributes
 * via ``updateAttributes``.
 */
import { useCallback, useLayoutEffect, useRef, useState } from "react";
import { NodeViewWrapper, type NodeViewProps } from "@tiptap/react";
import { Check, ChevronDown, ChevronRight, MessageSquare, Undo2 } from "lucide-react";
import { useCurrentUser } from "../../../core/user/CurrentUserProvider";
import { useCommentVisibility } from "../context/CommentVisibilityContext";
import { relativeTime } from "../../../shared/format";
import { getInitials } from "../../../shared/Avatar";

// ── Types ───────────────────────────────────────────────────────────────

export interface CommentEntry {
  id: string;
  authorId: number;
  authorName: string;
  authorInitials: string;
  authorColor: string;
  text: string;
  createdAt: string; // ISO 8601
}

// ── Constants ───────────────────────────────────────────────────────────

/** Tailwind background classes for color-based avatars when hex isn't available. */
const AVATAR_BG_CLASS: Record<string, string> = {
  enzyme: "bg-enzyme",
  reporter: "bg-reporter",
  success: "bg-success",
  warning: "bg-warning",
  destructive: "bg-destructive",
  info: "bg-info",
};

const PLACEHOLDER_TEXT = "Write a comment…";

// ── Helpers ─────────────────────────────────────────────────────────────

/** Build a CommentEntry from the current user and a text body. */
function makeCommentEntry(
  user: { id: number; first_name: string; last_name: string; username: string; color: string },
  text: string,
): CommentEntry {
  return {
    id: crypto.randomUUID(),
    authorId: user.id,
    authorName: [user.first_name, user.last_name]
      .filter(Boolean)
      .join(" ")
      .trim() || user.username,
    authorInitials: getInitials({
      first_name: user.first_name,
      last_name: user.last_name,
      username: user.username,
    }),
    authorColor: user.color,
    text,
    createdAt: new Date().toISOString(),
  };
}

function avatarBackgroundStyle(color: string): React.CSSProperties {
  if (color.startsWith("#") || color.startsWith("rgb")) {
    return { backgroundColor: color, color: "#fff" };
  }
  return {};
}

function avatarClasses(color: string): string {
  if (color.startsWith("#") || color.startsWith("rgb")) {
    return "inline-grid h-7 w-7 shrink-0 place-items-center rounded-full font-mono text-[11px] font-medium ring-2 ring-background";
  }
  return `inline-grid h-7 w-7 shrink-0 place-items-center rounded-full font-mono text-[11px] font-medium text-white ring-2 ring-background ${AVATAR_BG_CLASS[color] ?? ""}`;
}

// ── Sub-components ──────────────────────────────────────────────────────

/** Renders a single comment entry (original or reply). */
function CommentBody({
  entry,
  isEditing,
  bodyRef,
  onFocus,
  onBlur,
}: {
  entry: CommentEntry;
  isEditing: boolean;
  bodyRef?: React.RefObject<HTMLDivElement | null>;
  onFocus?: () => void;
  onBlur?: () => void;
}) {
  const text = entry.text;

  if (bodyRef) {
    // Editable version (for the original comment)
    return (
      <div
        ref={bodyRef}
        className={`text-sm leading-relaxed outline-none ${
          isEditing || text
            ? "text-foreground"
            : "text-muted-foreground italic"
        }`}
        contentEditable
        suppressContentEditableWarning
        onFocus={onFocus}
        onBlur={onBlur}
        role="textbox"
        aria-label="Comment body"
        data-testid="comment-body"
      >
        {text || PLACEHOLDER_TEXT}
      </div>
    );
  }

  // Read-only version (for replies)
  return (
    <div
      className={`text-sm leading-relaxed ${
        text ? "text-foreground" : "text-muted-foreground italic"
      }`}
      data-testid="reply-body"
    >
      {text || "No text"}
    </div>
  );
}

// ── NodeView ────────────────────────────────────────────────────────────

function CommentNodeView(props: NodeViewProps) {
  const { node, updateAttributes } = props;

  const resolved = (node.attrs.resolved as boolean) ?? false;
  const thread: CommentEntry[] = (node.attrs.thread as CommentEntry[]) ?? [];

  const { user } = useCurrentUser();
  const { showComments } = useCommentVisibility();
  const hasInitialized = useRef(false);

  // Editable body state — mirrors thread[0].text, synced on blur
  const bodyRef = useRef<HTMLDivElement>(null);
  const [isEditing, setIsEditing] = useState(false);

  // Reply state
  const [isReplying, setIsReplying] = useState(false);
  const replyRef = useRef<HTMLTextAreaElement>(null);
  const [replyText, setReplyText] = useState("");

  // Collapse state — only applies when there are replies
  const [isCollapsed, setIsCollapsed] = useState(false);

  // Expand resolved — clicking a resolved banner opens the full thread
  const [expandedResolved, setExpandedResolved] = useState(false);

  // ── Auto-initialise first comment from current user ──────────────────
  // Lazy-init a local entry during render so the comment card is shown
  // immediately, avoiding a flash of "Loading comment…".  Persisted to
  // the node in the layout effect below.
  const localEntryRef = useRef<CommentEntry | null>(null);
  if (thread.length === 0 && user && !localEntryRef.current) {
    localEntryRef.current = makeCommentEntry(user, "");
  }
  // Clear the local entry once the node thread is populated.
  if (thread.length > 0 && localEntryRef.current) {
    localEntryRef.current = null;
  }

  useLayoutEffect(() => {
    if (hasInitialized.current) return;
    if (thread.length > 0) {
      hasInitialized.current = true;
      return;
    }
    if (!user || !localEntryRef.current) return;

    hasInitialized.current = true;
    updateAttributes({ thread: [localEntryRef.current] });
  }, [thread.length, user, updateAttributes]);

  // Effective thread — uses the locally-initialized entry while the node
  // hasn't been updated yet, otherwise uses the node's stored thread.
  const effectiveThread: CommentEntry[] =
    thread.length > 0 ? thread
    : localEntryRef.current ? [localEntryRef.current]
    : [];

  // ── Sync text back to node on blur ───────────────────────────────────
  const handleBodyBlur = useCallback(() => {
    setIsEditing(false);
    const newText = bodyRef.current?.textContent?.trim() ?? "";
    const currentThread = thread.length > 0 ? thread : effectiveThread;
    if (currentThread.length === 0) return;
    const updated = currentThread.map((entry, i) =>
      i === 0 ? { ...entry, text: newText } : entry,
    );
    updateAttributes({ thread: updated });
  }, [thread, effectiveThread, updateAttributes]);

  const handleBodyFocus = useCallback(() => {
    setIsEditing(true);
    // Clear placeholder text on first focus
    if (bodyRef.current && bodyRef.current.textContent === PLACEHOLDER_TEXT) {
      bodyRef.current.textContent = "";
    }
  }, []);

  // ── Reply ──────────────────────────────────────────────────────────────
  const openReply = useCallback(() => {
    setIsReplying(true);
    setReplyText("");
  }, []);

  const cancelReply = useCallback(() => {
    setIsReplying(false);
    setReplyText("");
  }, []);

  const submitReply = useCallback(() => {
    const trimmed = replyText.trim();
    if (!trimmed || !user) return;

    const newReply = makeCommentEntry(user, trimmed);
    updateAttributes({ thread: [...effectiveThread, newReply] });
    setIsReplying(false);
    setReplyText("");
    // Auto-expand to show the new reply
    setIsCollapsed(false);
  }, [replyText, user, effectiveThread, updateAttributes]);

  // ── Resolve / Unresolve ────────────────────────────────────────────────
  const handleResolve = useCallback(() => {
    updateAttributes({ resolved: true });
  }, [updateAttributes]);

  const handleUnresolve = useCallback(() => {
    updateAttributes({ resolved: false });
    setExpandedResolved(false);
  }, [updateAttributes]);

  // ── Collapse toggle ────────────────────────────────────────────────────
  const handleToggleCollapse = useCallback(() => {
    setIsCollapsed((prev) => !prev);
  }, []);

  // ── Render: empty state while user loads ─────────────────────────────
  if (effectiveThread.length === 0) {
    return (
      <NodeViewWrapper
        className="comment-wrapper"
        contentEditable={false}
      >
        <div className="rounded-lg border border-hairline bg-panel p-4">
          <span className="text-muted-foreground text-sm italic">
            Loading comment…
          </span>
        </div>
      </NodeViewWrapper>
    );
  }

  const firstComment = effectiveThread[0];
  const replyCount = effectiveThread.length - 1;
  const hasReplies = replyCount > 0;

  // ── Render: hidden comment toggle ──────────────────────────────────
  // Resolved comments are fully hidden when comments are toggled off.
  if (!showComments && resolved) {
    return (
      <NodeViewWrapper
        className="comment-wrapper"
        contentEditable={false}
      />
    );
  }

  // Ghost icon for active (unresolved) comments when hidden.
  if (!showComments) {
    return (
      <NodeViewWrapper
        className="comment-wrapper"
        contentEditable={false}
      >
        <div className="flex justify-end">
          <button
            type="button"
            className="btn-ghost rounded-md"
            aria-label={resolved ? "Resolved comment" : "Comment"}
            data-testid="comment-ghost"
          >
            {resolved ? (
              <Check className="h-4 w-4" aria-hidden="true" />
            ) : (
              <MessageSquare className="h-4 w-4" aria-hidden="true" />
            )}
          </button>
        </div>
      </NodeViewWrapper>
    );
  }

  // ── Render: resolved state (collapsed, click to expand) ──────────
  if (resolved && !expandedResolved) {
    return (
      <NodeViewWrapper
        className="comment-wrapper"
        contentEditable={false}
      >
        <button
          type="button"
          className="flex w-full items-center gap-2 rounded-lg border border-hairline/50 bg-surface/40 px-4 py-2 text-xs text-muted-foreground hover:bg-surface/60 transition-colors"
          onClick={() => setExpandedResolved(true)}
          data-testid="comment-resolved"
          aria-label="Show resolved comment thread"
        >
          <Check className="h-4 w-4 text-success" aria-hidden="true" />
          <span>Resolved by {firstComment.authorName}</span>
          <span className="flex-1" />
          <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      </NodeViewWrapper>
    );
  }

  // ── Render: active comment card ─────────────────────────────────────
  return (
    <NodeViewWrapper
      className="comment-wrapper"
      contentEditable={false}
    >
      <div
        className="rounded-lg border border-hairline bg-panel p-4"
        data-testid="comment-card"
      >
        {/* ── Header: avatar, name, timestamp, actions ───────────────── */}
        <div className="mb-2 flex items-center gap-2">
          <span
            className={avatarClasses(firstComment.authorColor)}
            style={avatarBackgroundStyle(firstComment.authorColor)}
            aria-label={firstComment.authorInitials}
          >
            {firstComment.authorInitials}
          </span>
          <span className="text-sm font-medium leading-none">
            {firstComment.authorName}
          </span>
          <span className="text-xs text-muted-foreground leading-none">
            {relativeTime(firstComment.createdAt)}
          </span>

          {/* Spacer */}
          <span className="flex-1" />

          {/* Collapse toggle (visible when expanded, hidden when resolved) */}
          {!resolved && hasReplies && !isCollapsed && (
            <button
              type="button"
              className="btn-ghost flex items-center gap-1 rounded-md px-2 py-1 text-xs text-muted-foreground hover:text-foreground"
              onClick={handleToggleCollapse}
              aria-label="Collapse replies"
              data-testid="collapse-toggle"
            >
              <ChevronDown className="h-3.5 w-3.5" />
              <span>Hide replies</span>
            </button>
          )}

          {/* Resolve / Unresolve button */}
          {resolved ? (
            <button
              type="button"
              className="btn-ghost flex items-center gap-1 rounded-md px-2 py-1 text-xs text-muted-foreground hover:text-foreground"
              onClick={handleUnresolve}
              aria-label="Unresolve thread"
              data-testid="unresolve-btn"
            >
              <Undo2 className="h-3.5 w-3.5" />
              <span>Unresolve</span>
            </button>
          ) : (
            <button
              type="button"
              className="btn-ghost flex items-center gap-1 rounded-md px-2 py-1 text-xs text-muted-foreground hover:text-success"
              onClick={handleResolve}
              aria-label="Resolve thread"
              data-testid="resolve-btn"
            >
              <Check className="h-3.5 w-3.5" />
              <span>Resolve</span>
            </button>
          )}
        </div>

        {/* ── Original comment body ──────────────────────────────────── */}
        {resolved ? (
          <CommentBody entry={firstComment} isEditing={false} />
        ) : (
          <CommentBody
            entry={firstComment}
            isEditing={isEditing}
            bodyRef={bodyRef}
            onFocus={handleBodyFocus}
            onBlur={handleBodyBlur}
          />
        )}

        {/* ── Replies ────────────────────────────────────────────────── */}
        {hasReplies && !isCollapsed && (
          <div className="mt-3 space-y-3" data-testid="replies-container">
            {effectiveThread.slice(1).map((reply) => (
              <div
                key={reply.id}
                className="border-t border-hairline pt-3"
                data-testid={`reply-${reply.id}`}
              >
                {/* Reply header */}
                <div className="mb-1.5 flex items-center gap-2">
                  <span
                    className={avatarClasses(reply.authorColor)}
                    style={avatarBackgroundStyle(reply.authorColor)}
                    aria-label={reply.authorInitials}
                  >
                    {reply.authorInitials}
                  </span>
                  <span className="text-sm font-medium leading-none">
                    {reply.authorName}
                  </span>
                  <span className="text-xs text-muted-foreground leading-none">
                    {relativeTime(reply.createdAt)}
                  </span>
                </div>
                {/* Reply body (read-only) */}
                <CommentBody entry={reply} isEditing={false} />
              </div>
            ))}
          </div>
        )}

        {/* ── "Show N replies" when collapsed ────────────────────────── */}
        {hasReplies && isCollapsed && (
          <div className="mt-3 border-t border-hairline pt-3">
            <button
              type="button"
              className="btn-ghost flex items-center gap-1.5 rounded-md px-2 py-1 text-xs text-muted-foreground hover:text-foreground"
              onClick={handleToggleCollapse}
              aria-label={`Show ${replyCount} ${replyCount === 1 ? "reply" : "replies"}`}
              data-testid="show-replies-btn"
            >
              <ChevronRight className="h-3.5 w-3.5" />
              <span>
                Show {replyCount} {replyCount === 1 ? "reply" : "replies"}
              </span>
            </button>
          </div>
        )}

        {/* ── Reply button (hidden when resolved) ────────────────────── */}
        {!resolved && !isReplying && (
          <div className="mt-3 border-t border-hairline pt-3">
            <button
              type="button"
              className="btn-ghost flex items-center gap-1.5 rounded-md px-2 py-1 text-xs text-muted-foreground hover:text-foreground"
              onClick={openReply}
              aria-label="Reply to comment"
              data-testid="reply-btn"
            >
              <MessageSquare className="h-3.5 w-3.5" />
              <span>Reply</span>
            </button>
          </div>
        )}

        {/* ── Inline reply input ─────────────────────────────────────── */}
        {isReplying && (
          <div className="mt-3 border-t border-hairline pt-3" data-testid="reply-input-container">
            <textarea
              ref={replyRef}
              className="w-full rounded-md border border-hairline bg-surface/40 px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/20 resize-y min-h-[60px]"
              placeholder="Write a reply…"
              value={replyText}
              onChange={(e) => setReplyText(e.target.value)}
              rows={2}
              aria-label="Reply text"
              data-testid="reply-input"
            />
            <div className="mt-2 flex items-center gap-2">
              <button
                type="button"
                className="rounded-md bg-primary px-3 py-1 text-xs font-medium text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
                onClick={submitReply}
                disabled={!replyText.trim()}
                data-testid="submit-reply-btn"
              >
                Reply
              </button>
              <button
                type="button"
                className="btn-ghost rounded-md px-3 py-1 text-xs text-muted-foreground hover:text-foreground"
                onClick={cancelReply}
                data-testid="cancel-reply-btn"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    </NodeViewWrapper>
  );
}

export default CommentNodeView;
