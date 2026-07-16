/**
 * Tests for CommentBlockComponent with the comment visibility toggle context.
 *
 * Covers: rendering full card vs ghost icon based on ``showComments``,
 * resolved state unaffected by toggle, and context defaults.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import type { NodeViewProps } from "@tiptap/react";
import type { CommentEntry } from "../blocks/CommentBlockComponent";

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

import { CommentBlockComponent } from "../blocks/CommentBlockComponent";
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

/** A minimal mock of BlockComponentProps sufficient for CommentBlockComponent. */
function makeBlockComponentProps(
  overrides?: Partial<{ resolved: boolean; thread: CommentEntry[] }>,
): any {
  return {
    context: {} as any,
    instance: {
      id: "inst-1",
      blockId: "eln.comment-block",
      slotId: "eln.editor",
      attrs: {
        resolved: overrides?.resolved ?? false,
        thread: overrides?.thread ?? [],
      },
      updateAttrs: vi.fn(),
    },
  };
}

/** Render CommentBlockComponent wrapped in a CommentVisibilityProvider. */
function renderCommentBlockComponent(
  props: any,
  showComments: boolean,
) {
  return render(
    <CommentVisibilityProvider showComments={showComments}>
      <CommentBlockComponent {...props} />
    </CommentVisibilityProvider>,
  );
}

// ── Tests ─────────────────────────────────────────────────────────────────

describe("CommentBlockComponent — visibility toggle", () => {
  beforeEach(() => {
    mockNodeAttrs.resolved = false;
    mockNodeAttrs.thread = [];
  });

  describe("when showComments is true (default)", () => {
    it("renders the full comment card for an active comment", () => {
      const thread = [makeCommentEntry()];
      const props = makeBlockComponentProps({ resolved: false, thread });
      renderCommentBlockComponent(props, true);

      expect(screen.getByTestId("comment-card")).toBeDefined();
    });

    it("does not render ghost icon when comments are shown", () => {
      const thread = [makeCommentEntry()];
      const props = makeBlockComponentProps({ resolved: false, thread });
      renderCommentBlockComponent(props, true);

      expect(screen.queryByTestId("comment-ghost")).toBeNull();
    });

    it("renders resolved state (checkmark) for resolved comments", () => {
      const thread = [makeCommentEntry()];
      const props = makeBlockComponentProps({ resolved: true, thread });
      renderCommentBlockComponent(props, true);

      expect(screen.getByTestId("comment-resolved")).toBeDefined();
    });
  });

  describe("when showComments is false (hidden)", () => {
    it("renders ghost comment icon for an active comment", () => {
      const thread = [makeCommentEntry()];
      const props = makeBlockComponentProps({ resolved: false, thread });
      renderCommentBlockComponent(props, false);

      expect(screen.getByTestId("comment-ghost")).toBeDefined();
    });

    it("does not render full comment card when comments are hidden", () => {
      const thread = [makeCommentEntry()];
      const props = makeBlockComponentProps({ resolved: false, thread });
      renderCommentBlockComponent(props, false);

      expect(screen.queryByTestId("comment-card")).toBeNull();
    });

    it("does not show author name in ghost state", () => {
      const thread = [makeCommentEntry({ authorName: "Alice Smith" })];
      const props = makeBlockComponentProps({ resolved: false, thread });
      renderCommentBlockComponent(props, false);

      expect(screen.queryByText("Comment by Alice Smith")).toBeNull();
      expect(screen.queryByText("Alice Smith")).toBeNull();
    });

    it("renders ghost as a btn-ghost button", () => {
      const thread = [makeCommentEntry()];
      const props = makeBlockComponentProps({ resolved: false, thread });
      renderCommentBlockComponent(props, false);

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
      const props = makeBlockComponentProps({ resolved: true, thread });
      renderCommentBlockComponent(props, true);

      expect(screen.getByTestId("comment-resolved")).toBeDefined();
      expect(screen.queryByTestId("comment-card")).toBeNull();
      expect(screen.queryByTestId("comment-ghost")).toBeNull();
    });

    it("renders nothing for resolved comments when comments are hidden", () => {
      const thread = [makeCommentEntry()];
      const props = makeBlockComponentProps({ resolved: true, thread });
      renderCommentBlockComponent(props, false);

      // Resolved comments are fully hidden — no ghost, no resolved banner, no card
      expect(screen.queryByTestId("comment-ghost")).toBeNull();
      expect(screen.queryByTestId("comment-resolved")).toBeNull();
      expect(screen.queryByTestId("comment-card")).toBeNull();
    });
  });

  describe("toggle state changes", () => {
    it("switches from ghost to full card when toggled back on", () => {
      const thread = [makeCommentEntry()];
      const props = makeBlockComponentProps({ resolved: false, thread });

      // Start with comments hidden
      const { rerender } = render(
        <CommentVisibilityProvider showComments={false}>
          <CommentBlockComponent {...props} />
        </CommentVisibilityProvider>,
      );

      expect(screen.getByTestId("comment-ghost")).toBeDefined();

      // Toggle comments back on
      rerender(
        <CommentVisibilityProvider showComments={true}>
          <CommentBlockComponent {...props} />
        </CommentVisibilityProvider>,
      );

      expect(screen.getByTestId("comment-card")).toBeDefined();
      expect(screen.queryByTestId("comment-ghost")).toBeNull();
    });
  });
});
