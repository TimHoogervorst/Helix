/**
 * React NodeView for the elnComment TipTap node.
 *
 * Renders a comment card: author avatar (initials on colored background),
 * full name, relative timestamp, and an editable comment body.
 *
 * On first render with an empty thread, auto-initializes the first comment
 * entry from the current user.  Subsequent edits sync back to node attributes
 * via ``updateAttributes``.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { NodeViewWrapper, type NodeViewProps } from "@tiptap/react";
import { useCurrentUser } from "../../../core/user/CurrentUserProvider";
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

function avatarBackgroundStyle(color: string): React.CSSProperties {
  // Named color tokens get a CSS variable; raw hex/color values are used directly.
  if (color.startsWith("#") || color.startsWith("rgb")) {
    return { backgroundColor: color, color: "#fff" };
  }
  // Assume it's a design-token color name — leave styling to CSS class.
  return {};
}

function avatarClasses(color: string): string {
  if (color.startsWith("#") || color.startsWith("rgb")) {
    return "inline-grid h-7 w-7 shrink-0 place-items-center rounded-full font-mono text-[11px] font-medium ring-2 ring-background";
  }
  return `inline-grid h-7 w-7 shrink-0 place-items-center rounded-full font-mono text-[11px] font-medium text-white ring-2 ring-background ${AVATAR_BG_CLASS[color] ?? ""}`;
}

// ── NodeView ────────────────────────────────────────────────────────────

function CommentNodeView(props: NodeViewProps) {
  const { node, updateAttributes } = props;

  const resolved = (node.attrs.resolved as boolean) ?? false;
  const thread: CommentEntry[] = (node.attrs.thread as CommentEntry[]) ?? [];

  const { user } = useCurrentUser();
  const hasInitialized = useRef(false);

  // Editable body state — mirrors thread[0].text, synced on blur
  const bodyRef = useRef<HTMLDivElement>(null);
  const [isEditing, setIsEditing] = useState(false);

  // ── Auto-initialise first comment from current user ──────────────────
  useEffect(() => {
    if (hasInitialized.current) return;
    if (thread.length > 0) {
      hasInitialized.current = true;
      return;
    }
    if (!user) return; // still loading

    hasInitialized.current = true;
    const entry: CommentEntry = {
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
      text: "",
      createdAt: new Date().toISOString(),
    };
    updateAttributes({ thread: [entry] });
  }, [thread.length, user, updateAttributes]);

  // ── Sync text back to node on blur ───────────────────────────────────
  const handleBodyBlur = useCallback(() => {
    setIsEditing(false);
    const newText = bodyRef.current?.textContent?.trim() ?? "";
    if (thread.length === 0) return;
    const updated = thread.map((entry, i) =>
      i === 0 ? { ...entry, text: newText } : entry,
    );
    updateAttributes({ thread: updated });
  }, [thread, updateAttributes]);

  const handleBodyFocus = useCallback(() => {
    setIsEditing(true);
    // Clear placeholder text on first focus
    if (bodyRef.current && bodyRef.current.textContent === PLACEHOLDER_TEXT) {
      bodyRef.current.textContent = "";
    }
  }, []);

  // ── Render: empty state while user loads ─────────────────────────────
  if (thread.length === 0) {
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

  const firstComment = thread[0];

  return (
    <NodeViewWrapper
      className="comment-wrapper"
      contentEditable={false}
    >
      <div
        className="rounded-lg border border-hairline bg-panel p-4"
        data-testid="comment-card"
      >
        {/* ── Header: avatar, name, timestamp ────────────────────────── */}
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
        </div>

        {/* ── Body: editable comment text ────────────────────────────── */}
        <div
          ref={bodyRef}
          className={`text-sm leading-relaxed outline-none ${
            isEditing || firstComment.text
              ? "text-foreground"
              : "text-muted-foreground italic"
          }`}
          contentEditable
          suppressContentEditableWarning
          onFocus={handleBodyFocus}
          onBlur={handleBodyBlur}
          role="textbox"
          aria-label="Comment body"
          data-testid="comment-body"
        >
          {firstComment.text || PLACEHOLDER_TEXT}
        </div>

        {/* ── Resolved marker ────────────────────────────────────────── */}
        {resolved && (
          <div className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
            <span aria-label="Resolved">✓</span>
            <span>Resolved</span>
          </div>
        )}
      </div>
    </NodeViewWrapper>
  );
}

export default CommentNodeView;
