/**
 * Tests for CommentNodeView with the comment visibility toggle context.
 *
 * Covers: rendering full card vs ghost icon based on ``showComments``,
 * resolved state unaffected by toggle, and context defaults.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import type { NodeViewProps } from "@tiptap/react";
import type { CommentEntry } from "../blocks/CommentNodeView";

// ── Mocks ─────────────────────────────────────────────────────────────────

const { mockUser, mockNodeAttrs } = vi.hoisted(() => ({
  mockUser: {
    id: 1,
    username: "alice",
    first_name: "Alice",
    last_name: "Smith",
    color: "#4A90D9",
  },
  mockNodeAttrs: {
    resolved: false,
    thread: [] as CommentEntry[],
  },
}));

vi.mock("../../../core/user/CurrentUserProvider", () => ({
  useCurrentUser: () => ({ user: mockUser, isChecking: false, error: null, refresh: vi.fn() }),
}));

// ── Dynamic imports (after mocks) ────────────────────────────────────────

import CommentNodeView from "../blocks/CommentNodeView";
import { CommentVisibilityProvider } from "../context/CommentVisibilityContext";

// ── Helpers ───────────────────────────────────────────────────────────────

function makeCommentEntry(overrides?: Partial<CommentEntry>): CommentEntry {
  return {
    id: "test-001",
    authorId: 1,
    authorName: "Alice Smith",
    authorInitials: "AS",
    authorColor: "#4A90D9",
    text: "This is a test comment.",
    createdAt: "2026-07-10T12:00:00Z",
    ...overrides,
  };
}

/** A minimal mock of NodeViewProps sufficient for CommentNodeView. */
function makeNodeViewProps(
  overrides?: Partial<{ resolved: boolean; thread: CommentEntry[] }>,
): NodeViewProps {
  return {
    node: {
      attrs: {
        resolved: overrides?.resolved ?? false,
        thread: overrides?.thread ?? [],
      },
    },
    getPos: vi.fn(() => 0),
    editor: {} as any,
    extension: {} as any,
    view: {} as any,
    updateAttributes: vi.fn(),
    deleteNode: vi.fn(),
    decorations: [],
    selected: false,
  } as unknown as NodeViewProps;
}

/** Render CommentNodeView wrapped in a CommentVisibilityProvider. */
function renderCommentNodeView(
  props: NodeViewProps,
  showComments: boolean,
) {
  return render(
    <CommentVisibilityProvider showComments={showComments}>
      <CommentNodeView {...props} />
    </CommentVisibilityProvider>,
  );
}

// ── Tests ─────────────────────────────────────────────────────────────────

describe("CommentNodeView — visibility toggle", () => {
  beforeEach(() => {
    mockNodeAttrs.resolved = false;
    mockNodeAttrs.thread = [];
  });

  describe("when showComments is true (default)", () => {
    it("renders the full comment card for an active comment", () => {
      const thread = [makeCommentEntry()];
      const props = makeNodeViewProps({ resolved: false, thread });
      renderCommentNodeView(props, true);

      expect(screen.getByTestId("comment-card")).toBeDefined();
    });

    it("does not render ghost icon when comments are shown", () => {
      const thread = [makeCommentEntry()];
      const props = makeNodeViewProps({ resolved: false, thread });
      renderCommentNodeView(props, true);

      expect(screen.queryByTestId("comment-ghost")).toBeNull();
    });

    it("renders resolved state (checkmark) for resolved comments", () => {
      const thread = [makeCommentEntry()];
      const props = makeNodeViewProps({ resolved: true, thread });
      renderCommentNodeView(props, true);

      expect(screen.getByTestId("comment-resolved")).toBeDefined();
    });
  });

  describe("when showComments is false (hidden)", () => {
    it("renders ghost comment icon for an active comment", () => {
      const thread = [makeCommentEntry()];
      const props = makeNodeViewProps({ resolved: false, thread });
      renderCommentNodeView(props, false);

      expect(screen.getByTestId("comment-ghost")).toBeDefined();
    });

    it("does not render full comment card when comments are hidden", () => {
      const thread = [makeCommentEntry()];
      const props = makeNodeViewProps({ resolved: false, thread });
      renderCommentNodeView(props, false);

      expect(screen.queryByTestId("comment-card")).toBeNull();
    });

    it("does not show author name in ghost state", () => {
      const thread = [makeCommentEntry({ authorName: "Alice Smith" })];
      const props = makeNodeViewProps({ resolved: false, thread });
      renderCommentNodeView(props, false);

      expect(screen.queryByText("Comment by Alice Smith")).toBeNull();
      expect(screen.queryByText("Alice Smith")).toBeNull();
    });

    it("renders ghost as a btn-ghost button", () => {
      const thread = [makeCommentEntry()];
      const props = makeNodeViewProps({ resolved: false, thread });
      renderCommentNodeView(props, false);

      // The ghost is a button element with btn-ghost class
      const ghost = screen.getByTestId("comment-ghost");
      expect(ghost).toBeDefined();
      expect(ghost.tagName).toBe("BUTTON");
      expect(ghost.className).toContain("btn-ghost");
    });
  });

  describe("resolved state with visibility toggle", () => {
    it("renders checkmark icon when showComments is true", () => {
      const thread = [makeCommentEntry()];
      const props = makeNodeViewProps({ resolved: true, thread });
      renderCommentNodeView(props, true);

      expect(screen.getByTestId("comment-resolved")).toBeDefined();
      expect(screen.queryByTestId("comment-card")).toBeNull();
      expect(screen.queryByTestId("comment-ghost")).toBeNull();
    });

    it("renders ghost Check icon when showComments is false", () => {
      const thread = [makeCommentEntry()];
      const props = makeNodeViewProps({ resolved: true, thread });
      renderCommentNodeView(props, false);

      // When hidden, resolved comments also render as ghost icons
      expect(screen.getByTestId("comment-ghost")).toBeDefined();
      expect(screen.queryByTestId("comment-resolved")).toBeNull();
    });
  });

  describe("toggle state changes", () => {
    it("switches from ghost to full card when toggled back on", () => {
      const thread = [makeCommentEntry()];
      const props = makeNodeViewProps({ resolved: false, thread });

      // Start with comments hidden
      const { rerender } = render(
        <CommentVisibilityProvider showComments={false}>
          <CommentNodeView {...props} />
        </CommentVisibilityProvider>,
      );

      expect(screen.getByTestId("comment-ghost")).toBeDefined();

      // Toggle comments back on
      rerender(
        <CommentVisibilityProvider showComments={true}>
          <CommentNodeView {...props} />
        </CommentVisibilityProvider>,
      );

      expect(screen.getByTestId("comment-card")).toBeDefined();
      expect(screen.queryByTestId("comment-ghost")).toBeNull();
    });
  });
});
