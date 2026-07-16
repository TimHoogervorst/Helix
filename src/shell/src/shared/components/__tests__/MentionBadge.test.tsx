/**
 * Tests for the MentionBadge component.
 *
 * Covers all prop combinations:
 *   clickable/non-clickable × resolved/loading/broken
 */
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import MentionBadge from "../MentionBadge";
import { MentionProvider } from "../../../mentions/MentionProvider";
import type { BadgeResolved } from "../MentionBadge";

// ── Helpers ──────────────────────────────────────────────────────────

const resolvedEntry: BadgeResolved = {
  displayId: "E1",
  title: "PCR Protocol",
  type: "entry",
  id: 1,
  icon: "📄",
  workspaceId: "eln",
};

const resolvedEntity: BadgeResolved = {
  displayId: "BLOOD1",
  title: "Sample #1",
  type: "entity",
  id: 5,
  icon: "🩸",
  workspaceId: "lims",
};

function renderBadge(
  props: React.ComponentProps<typeof MentionBadge>,
) {
  return render(
    <MentionProvider>
      <MentionBadge {...props} />
    </MentionProvider>,
  );
}

// ── Non-clickable ────────────────────────────────────────────────────

describe("non-clickable (gray)", () => {
  it("renders bare displayId when resolved is omitted", () => {
    renderBadge({ displayId: "E1", clickable: false });
    const el = screen.getByText("E1");
    expect(el).toBeInTheDocument();
    expect(el.closest(".reference-badge")).toHaveClass("is-nonclickable");
    expect(el.closest(".reference-badge")).not.toHaveClass("is-resolved");
  });

  it("renders gray pill with icon + title when pre-resolved", () => {
    renderBadge({
      displayId: "E1",
      clickable: false,
      resolved: resolvedEntry,
    });
    expect(screen.getByText("📄")).toBeInTheDocument();
    expect(screen.getByText("E1")).toBeInTheDocument();
    expect(screen.getByText("PCR Protocol")).toBeInTheDocument();
    const badge = screen.getByText("E1").closest(".reference-badge")!;
    expect(badge).toHaveClass("is-nonclickable");
    expect(badge).toHaveClass("is-resolved");
    // No <a> tag — non-clickable
    expect(badge.tagName).toBe("SPAN");
  });

  it("shows entity icon in gray pill", () => {
    renderBadge({
      displayId: "BLOOD1",
      clickable: false,
      resolved: resolvedEntity,
    });
    expect(screen.getByText("🩸")).toBeInTheDocument();
  });
});

// ── Clickable ────────────────────────────────────────────────────────

describe("clickable (blue)", () => {
  it("shows loading text when auto-resolving (no resolved prop)", () => {
    renderBadge({ displayId: "E1", clickable: true });
    // Loading state shows #displayId
    const badge = document.querySelector(".reference-badge.is-clickable");
    expect(badge).toBeInTheDocument();
    expect(badge).not.toHaveClass("is-resolved");
    expect(badge).not.toHaveClass("is-broken");
  });

  it("renders blue pill link when pre-resolved", () => {
    renderBadge({
      displayId: "E1",
      clickable: true,
      resolved: resolvedEntry,
    });
    const badge = screen.getByText("E1").closest(".reference-badge")!;
    expect(badge).toHaveClass("is-clickable");
    expect(badge).toHaveClass("is-resolved");
    expect(badge.tagName).toBe("A");
    expect(badge).toHaveAttribute("href", "/eln/E1");
  });

  it("navigates to /lims/:displayId for entity references", () => {
    renderBadge({
      displayId: "BLOOD1",
      clickable: true,
      resolved: resolvedEntity,
    });
    const badge = screen.getByText("BLOOD1").closest(".reference-badge")!;
    expect(badge.tagName).toBe("A");
    expect(badge).toHaveAttribute("href", "/lims/BLOOD1");
  });

  it("uses workspaceId over type-based URL branching", () => {
    const workspaceResolved: BadgeResolved = {
      displayId: "DNA34",
      title: "Plasmid #34",
      type: "entity",
      id: 42,
      icon: "🧬",
      workspaceId: "molBio",
    };
    renderBadge({
      displayId: "DNA34",
      clickable: true,
      resolved: workspaceResolved,
    });
    const badge = screen.getByText("DNA34").closest(".reference-badge")!;
    expect(badge.tagName).toBe("A");
    expect(badge).toHaveAttribute("href", "/molBio/DNA34");
  });

  it("falls back to type-based /lims/ URL when workspaceId is missing", () => {
    const noWorkspace: BadgeResolved = {
      displayId: "BLOOD1",
      title: "Sample #1",
      type: "entity",
      id: 5,
      icon: "🩸",
      // no workspaceId
    };
    renderBadge({
      displayId: "BLOOD1",
      clickable: true,
      resolved: noWorkspace,
    });
    const badge = screen.getByText("BLOOD1").closest(".reference-badge")!;
    expect(badge).toHaveAttribute("href", "/lims/BLOOD1");
  });

  it("renders red broken pill when resolved is null", () => {
    renderBadge({
      displayId: "NONEXIST",
      clickable: true,
      resolved: null,
    });
    const badge = screen.getByText("NONEXIST").closest(".reference-badge")!;
    expect(badge).toHaveClass("is-clickable");
    expect(badge).toHaveClass("is-broken");
    expect(badge).toHaveAttribute("title", "Reference not found");
    // No icon in broken state
    expect(badge.querySelector(".ref-badge-icon")).toBeNull();
  });
});

// ── Compact mode ─────────────────────────────────────────────────────

describe("compact mode", () => {
  it("renders icon + id but no title span when compact + resolved (non-clickable)", () => {
    renderBadge({
      displayId: "E1",
      clickable: false,
      resolved: resolvedEntry,
      compact: true,
    });
    expect(screen.getByText("📄")).toBeInTheDocument();
    expect(screen.getByText("E1")).toBeInTheDocument();
    expect(screen.queryByText("PCR Protocol")).toBeNull();
    // Badge is still resolved-styled
    const badge = screen.getByText("E1").closest(".reference-badge")!;
    expect(badge).toHaveClass("is-nonclickable");
    expect(badge).toHaveClass("is-resolved");
  });

  it("renders <a> with icon + id but no title when compact + clickable + resolved", () => {
    renderBadge({
      displayId: "E1",
      clickable: true,
      resolved: resolvedEntry,
      compact: true,
    });
    expect(screen.getByText("📄")).toBeInTheDocument();
    expect(screen.getByText("E1")).toBeInTheDocument();
    expect(screen.queryByText("PCR Protocol")).toBeNull();
    const badge = screen.getByText("E1").closest(".reference-badge")!;
    expect(badge).toHaveClass("is-clickable");
    expect(badge).toHaveClass("is-resolved");
    expect(badge.tagName).toBe("A");
    expect(badge).toHaveAttribute("href", "/eln/E1");
  });

  it("silently ignores compact when resolved is null (non-clickable fallback)", () => {
    renderBadge({
      displayId: "E1",
      clickable: false,
      resolved: null,
      compact: true,
    });
    // Bare displayId fallback, no error
    const el = screen.getByText("E1");
    expect(el).toBeInTheDocument();
    expect(el.closest(".reference-badge")).toHaveClass("is-nonclickable");
    expect(el.closest(".reference-badge")).not.toHaveClass("is-resolved");
  });

  it("silently ignores compact when resolved is omitted (loading state)", () => {
    renderBadge({
      displayId: "E1",
      clickable: true,
      compact: true,
    });
    // Loading state — still shows bare displayId
    const badge = document.querySelector(".reference-badge.is-clickable");
    expect(badge).toBeInTheDocument();
    expect(badge).not.toHaveClass("is-resolved");
    expect(badge).not.toHaveClass("is-broken");
  });

  it("silently ignores compact in broken state", () => {
    renderBadge({
      displayId: "NONEXIST",
      clickable: true,
      resolved: null,
      compact: true,
    });
    const badge = screen.getByText("NONEXIST").closest(".reference-badge")!;
    expect(badge).toHaveClass("is-broken");
    expect(badge).toHaveAttribute("title", "Reference not found");
  });

  it("defaults compact to false — title still renders when resolved", () => {
    renderBadge({
      displayId: "E1",
      clickable: false,
      resolved: resolvedEntry,
    });
    // compact defaults to false, so title should be present
    expect(screen.getByText("PCR Protocol")).toBeInTheDocument();
  });
});

// ── Layout / utility ─────────────────────────────────────────────────

describe("utility", () => {
  it("applies monospace font to display ID", () => {
    renderBadge({
      displayId: "E1",
      clickable: false,
      resolved: resolvedEntry,
    });
    const id = screen.getByText("E1");
    expect(id).toHaveClass("ref-badge-id");
  });

  it("truncates long titles with ellipsis", () => {
    renderBadge({
      displayId: "E1",
      clickable: false,
      resolved: {
        ...resolvedEntry,
        title: "A very long title that should be truncated in the badge display",
      },
    });
    const title = screen.getByText(
      "A very long title that should be truncated in the badge display",
    );
    expect(title).toHaveClass("ref-badge-title");
  });

  it("handles non-clickable with null resolved (bare text fallback)", () => {
    renderBadge({
      displayId: "E1",
      clickable: false,
      resolved: null,
    });
    const el = screen.getByText("E1");
    expect(el).toBeInTheDocument();
    const badge = el.closest(".reference-badge")!;
    expect(badge).toHaveClass("is-nonclickable");
    expect(badge).not.toHaveClass("is-resolved");
  });
});
