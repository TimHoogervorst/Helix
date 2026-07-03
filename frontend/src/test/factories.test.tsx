/**
 * Tests for the makeMockReferenceBadge factory.
 *
 * Covers all config combinations specified in the factory's contract:
 *   default, resolved, clickable, clickable+resolved, broken,
 *   compact, compact+clickable, testId override, and edge cases.
 */
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { makeMockReferenceBadge } from "./factories";
import type { BadgeResolved } from "../shared/ReferenceBadge";

// ── Shared test data ────────────────────────────────────────────────────

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

// ── Default config ──────────────────────────────────────────────────────

describe("default config {}", () => {
  it("renders a non-clickable span with ref-badge-id child", () => {
    const MockBadge = makeMockReferenceBadge();
    render(<MockBadge displayId="E1" />);

    const badge = screen.getByTestId("ref-badge");
    expect(badge.tagName).toBe("SPAN");
    expect(badge).toHaveClass("reference-badge");
    expect(badge).toHaveClass("is-nonclickable");
    expect(badge).not.toHaveClass("is-clickable");
    expect(badge).not.toHaveClass("is-resolved");
    expect(badge).toHaveAttribute("data-display-id", "E1");

    // Has ref-badge-id child span
    const idSpan = badge.querySelector(".ref-badge-id");
    expect(idSpan).toBeInTheDocument();
    expect(idSpan).toHaveTextContent("E1");

    // No icon or title in bare state
    expect(badge.querySelector(".ref-badge-icon")).toBeNull();
    expect(badge.querySelector(".ref-badge-title")).toBeNull();
  });
});

// ── Resolved config ─────────────────────────────────────────────────────

describe("resolved config", () => {
  it("renders icon, id, and title spans in a non-clickable badge", () => {
    const MockBadge = makeMockReferenceBadge({ resolved: resolvedEntry });
    render(<MockBadge displayId="E1" />);

    const badge = screen.getByTestId("ref-badge");
    expect(badge.tagName).toBe("SPAN");
    expect(badge).toHaveClass("is-nonclickable");
    expect(badge).toHaveClass("is-resolved");

    expect(screen.getByText("📄")).toHaveClass("ref-badge-icon");
    expect(screen.getByText("E1")).toHaveClass("ref-badge-id");
    expect(screen.getByText("PCR Protocol")).toHaveClass("ref-badge-title");
  });
});

// ── Clickable config ────────────────────────────────────────────────────

describe("clickable config", () => {
  it("renders a clickable span with data-clickable in loading state", () => {
    const MockBadge = makeMockReferenceBadge({ clickable: true });
    render(<MockBadge displayId="E1" />);

    const badge = screen.getByTestId("ref-badge");
    expect(badge.tagName).toBe("SPAN");
    expect(badge).toHaveClass("is-clickable");
    expect(badge).not.toHaveClass("is-nonclickable");
    expect(badge).not.toHaveClass("is-resolved");
    expect(badge).toHaveAttribute("data-clickable", "true");

    // Loading state: just text, no child spans
    expect(badge.querySelector(".ref-badge-id")).toBeNull();
    expect(badge.textContent).toBe("E1");
  });
});

// ── Clickable + resolved ────────────────────────────────────────────────

describe("clickable + resolved", () => {
  it("renders an anchor with correct href for entry type", () => {
    const MockBadge = makeMockReferenceBadge({
      clickable: true,
      resolved: resolvedEntry,
    });
    render(<MockBadge displayId="E1" />);

    const badge = screen.getByTestId("ref-badge");
    expect(badge.tagName).toBe("A");
    expect(badge).toHaveClass("is-clickable");
    expect(badge).toHaveClass("is-resolved");
    expect(badge).toHaveAttribute("data-clickable", "true");
    expect(badge).toHaveAttribute("href", "/eln/E1");

    // All three child spans present
    expect(screen.getByText("📄")).toHaveClass("ref-badge-icon");
    expect(screen.getByText("E1")).toHaveClass("ref-badge-id");
    expect(screen.getByText("PCR Protocol")).toHaveClass("ref-badge-title");
  });

  it("renders an anchor with entity href for entity type", () => {
    const MockBadge = makeMockReferenceBadge({
      clickable: true,
      resolved: resolvedEntity,
    });
    render(<MockBadge displayId="BLOOD1" />);

    const badge = screen.getByTestId("ref-badge");
    expect(badge.tagName).toBe("A");
    expect(badge).toHaveAttribute("href", "/lims/BLOOD1");
  });
});

// ── Clickable + broken ──────────────────────────────────────────────────

describe("clickable + broken (resolved: null)", () => {
  it("renders a broken red pill with no icon and no title", () => {
    const MockBadge = makeMockReferenceBadge({
      clickable: true,
      resolved: null,
    });
    render(<MockBadge displayId="NONEXIST" />);

    const badge = screen.getByTestId("ref-badge");
    expect(badge.tagName).toBe("SPAN");
    expect(badge).toHaveClass("is-clickable");
    expect(badge).toHaveClass("is-broken");
    expect(badge).toHaveAttribute("data-clickable", "true");
    expect(badge).toHaveAttribute("title", "Reference not found");

    // Broken: has ref-badge-id but no icon or title
    expect(badge.querySelector(".ref-badge-id")).toBeInTheDocument();
    expect(badge.querySelector(".ref-badge-icon")).toBeNull();
    expect(badge.querySelector(".ref-badge-title")).toBeNull();
  });
});

// ── Compact config ──────────────────────────────────────────────────────

describe("compact mode", () => {
  it("omits the title span when compact + resolved", () => {
    const MockBadge = makeMockReferenceBadge({
      compact: true,
      resolved: resolvedEntry,
    });
    render(<MockBadge displayId="E1" />);

    const badge = screen.getByTestId("ref-badge");
    expect(badge.tagName).toBe("SPAN");
    expect(badge).toHaveClass("is-resolved");

    // Icon and ID present, title omitted
    expect(screen.getByText("📄")).toHaveClass("ref-badge-icon");
    expect(screen.getByText("E1")).toHaveClass("ref-badge-id");
    expect(badge.querySelector(".ref-badge-title")).toBeNull();
  });

  it("omits the title span when compact + clickable + resolved (anchor)", () => {
    const MockBadge = makeMockReferenceBadge({
      compact: true,
      clickable: true,
      resolved: resolvedEntry,
    });
    render(<MockBadge displayId="E1" />);

    const badge = screen.getByTestId("ref-badge");
    expect(badge.tagName).toBe("A");
    expect(badge).toHaveClass("is-clickable");
    expect(badge).toHaveClass("is-resolved");
    expect(badge).toHaveAttribute("href", "/eln/E1");

    // Icon and ID present, title omitted
    expect(screen.getByText("📄")).toHaveClass("ref-badge-icon");
    expect(screen.getByText("E1")).toHaveClass("ref-badge-id");
    expect(badge.querySelector(".ref-badge-title")).toBeNull();
  });

  it("is silently ignored in loading state (no title to hide)", () => {
    const MockBadge = makeMockReferenceBadge({
      compact: true,
      clickable: true,
    });
    render(<MockBadge displayId="E1" />);

    const badge = screen.getByTestId("ref-badge");
    expect(badge).toHaveClass("is-clickable");
    // Loading state: just text, no spans — compact is a no-op
    expect(badge.textContent).toBe("E1");
  });

  it("is silently ignored in broken state (no title to hide)", () => {
    const MockBadge = makeMockReferenceBadge({
      compact: true,
      clickable: true,
      resolved: null,
    });
    render(<MockBadge displayId="NONEXIST" />);

    const badge = screen.getByTestId("ref-badge");
    expect(badge).toHaveClass("is-broken");
    expect(badge.querySelector(".ref-badge-id")).toBeInTheDocument();
    // Compact doesn't affect broken state — no title to hide
    expect(badge.querySelector(".ref-badge-title")).toBeNull();
  });
});

// ── testId override ─────────────────────────────────────────────────────

describe("testId override", () => {
  it("overrides the default data-testid attribute", () => {
    const MockBadge = makeMockReferenceBadge({ testId: "custom-badge" });
    render(<MockBadge displayId="E1" />);

    // The custom testId is used
    expect(screen.getByTestId("custom-badge")).toBeInTheDocument();
    // The default testId is not present
    expect(screen.queryByTestId("ref-badge")).toBeNull();
  });
});

// ── Mock function tracking ──────────────────────────────────────────────

describe("mock function calls", () => {
  it("is a vi.fn() that tracks calls", () => {
    const MockBadge = makeMockReferenceBadge();
    render(<MockBadge displayId="E1" />);

    expect(MockBadge).toHaveBeenCalledTimes(1);
    // React passes (props, refOrContext) — check the first argument
    const [firstCall] = MockBadge.mock.calls;
    expect(firstCall[0]).toEqual(
      expect.objectContaining({ displayId: "E1" }),
    );
  });
});
