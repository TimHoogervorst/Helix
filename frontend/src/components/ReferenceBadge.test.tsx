/**
 * Tests for the ReferenceBadge component.
 *
 * Covers all prop combinations:
 *   clickable/non-clickable × resolved/loading/broken
 */
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import ReferenceBadge from "./ReferenceBadge";
import { ReferenceProvider } from "./ReferenceProvider";
import type { BadgeResolved } from "./ReferenceBadge";

// ── Helpers ──────────────────────────────────────────────────────────

const resolvedEntry: BadgeResolved = {
  displayId: "E1",
  title: "PCR Protocol",
  type: "entry",
  id: 1,
  icon: "📄",
};

const resolvedEntity: BadgeResolved = {
  displayId: "BLOOD1",
  title: "Sample #1",
  type: "entity",
  id: 5,
  icon: "🩸",
};

function renderBadge(
  props: React.ComponentProps<typeof ReferenceBadge>,
) {
  return render(
    <ReferenceProvider>
      <ReferenceBadge {...props} />
    </ReferenceProvider>,
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
    expect(badge).toHaveAttribute("href", "/eln/1");
  });

  it("navigates to /lims?entity= for entity references", () => {
    renderBadge({
      displayId: "BLOOD1",
      clickable: true,
      resolved: resolvedEntity,
    });
    const badge = screen.getByText("BLOOD1").closest(".reference-badge")!;
    expect(badge.tagName).toBe("A");
    expect(badge).toHaveAttribute("href", "/lims?entity=BLOOD1");
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
