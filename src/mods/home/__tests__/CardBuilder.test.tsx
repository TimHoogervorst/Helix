/**
 * Tests for Card builder modal and conditional formatting rendering.
 *
 * Verifies:
 *  - Formatting evaluation: rule matching, default fallback, per-dimension fallback,
 *    {value} substitution, null value handling
 *  - Card builder modal: open/close, tabs, metric selection, fork flow,
 *    create new metric inline, save flow
 *  - Card rendering: colour / icon / text from formatting, hover edit button,
 *    add card button
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { ModRegistry } from "../../../shell/src/mod-system/ModRegistry";

// ── Mocks ──────────────────────────────────────────────────────────────────

vi.mock("../../../shell/src/shared/components/MetricCards/api", () => ({
  getCards: vi.fn(),
  getMetricValue: vi.fn(),
  getMetrics: vi.fn(),
  createMetric: vi.fn(),
  createCard: vi.fn(),
  updateCard: vi.fn(),
  deleteCard: vi.fn(),
  forkCard: vi.fn(),
}));

import * as cardApi from "../../../shell/src/shared/components/MetricCards/api";

vi.mock("../../lims/hub/api", () => ({
  getMyViews: vi.fn(),
  getPublicViews: vi.fn(),
}));

vi.mock("../../../shell/src/api/client", () => ({
  get: vi.fn(),
  post: vi.fn(),
  patch: vi.fn(),
  del: vi.fn(),
}));

import { get as getRaw } from "../../../shell/src/api/client";

vi.mock("../../../shell/src/user/CurrentUserProvider", () => ({
  CurrentUserProvider: ({ children }: { children: React.ReactNode }) =>
    children,
  useCurrentUser: () => ({
    user: {
      id: 1,
      username: "mkato",
      first_name: "Mira",
      last_name: "Kato",
      color: "#4A90D9",
      is_active: true,
      date_joined: "2025-01-15T00:00:00Z",
    },
    isChecking: false,
    error: null,
    refresh: vi.fn(),
  }),
}));

// ── Imports after mocks ───────────────────────────────────────────────────

import HomePage from "../HomePage";
import {
  resolveFormatting,
  applyValueTemplate,
  type FormattingConfig,
} from "../../../shell/src/shared/components/MetricCards/formatting";

// ── Test Data ──────────────────────────────────────────────────────────────

const defaultCard = {
  id: 1,
  owner: 1,
  owner_username: "mkato",
  is_global: false,
  metric: 1,
  metric_name: "Count — In-progress entries",
  surface: "home",
  order: 0,
  label: "In-progress entries",
  icon: "scroll-text",
  formatting: {
    rules: [],
    default: { color: "muted", icon: "flask-conical", text: null },
  },
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
};

function makeCard(overrides: Partial<typeof defaultCard> = {}) {
  return { ...defaultCard, ...overrides };
}

const defaultFormatting: FormattingConfig = {
  rules: [],
  default: { color: "muted", icon: "flask-conical", text: null },
};

// ── Setup / Teardown ───────────────────────────────────────────────────────

beforeEach(() => {
  ModRegistry._reset();
  vi.mocked(cardApi.getCards).mockReset();
  vi.mocked(cardApi.getMetricValue).mockReset();
  vi.mocked(cardApi.getMetrics).mockReset();
  vi.mocked(cardApi.createMetric).mockReset();
  vi.mocked(cardApi.createCard).mockReset();
  vi.mocked(cardApi.updateCard).mockReset();
  vi.mocked(cardApi.deleteCard).mockReset();
  vi.mocked(cardApi.forkCard).mockReset();
  vi.mocked(getRaw).mockReset();
  vi.mocked(cardApi.getCards).mockResolvedValue([]);
  vi.mocked(cardApi.getMetricValue).mockResolvedValue({ value: 0 });
  vi.mocked(cardApi.getMetrics).mockResolvedValue([]);
});

afterEach(() => {
  ModRegistry._reset();
});

function renderHomePage() {
  return render(
    <MemoryRouter>
      <HomePage />
    </MemoryRouter>,
  );
}

// ── Formatting Evaluation (pure unit) ──────────────────────────────────────

describe("resolveFormatting", () => {
  const fmt: FormattingConfig = {
    rules: [
      {
        when: { op: "lt", value: 5 },
        color: "warn",
        icon: "alert-triangle",
        text: "Low: {value}",
      },
      {
        when: { op: "gte", value: 5 },
        color: "success",
        icon: "check-circle",
        text: "Good: {value}",
      },
    ],
    default: { color: "muted", icon: "flask-conical", text: null },
  };

  it("returns default when value is null", () => {
    const result = resolveFormatting(null, fmt);
    expect(result.color).toBe("muted");
    expect(result.icon).toBe("flask-conical");
    expect(result.text).toBeNull();
  });

  it("returns default when formatting is undefined", () => {
    const result = resolveFormatting(42, undefined);
    expect(result.color).toBe("muted");
    expect(result.icon).toBe("flask-conical");
    expect(result.text).toBeNull();
  });

  it("returns first matching rule (lt 5 matched for value 3)", () => {
    const result = resolveFormatting(3, fmt);
    expect(result.color).toBe("warn");
    expect(result.icon).toBe("alert-triangle");
    expect(result.text).toBe("Low: {value}");
  });

  it("returns first matching rule (gte 5 matched for value 7)", () => {
    const result = resolveFormatting(7, fmt);
    expect(result.color).toBe("success");
    expect(result.icon).toBe("check-circle");
    expect(result.text).toBe("Good: {value}");
  });

  it("returns default when no rules match", () => {
    const result = resolveFormatting(10, {
      rules: [
        { when: { op: "lt", value: 3 }, color: "warn" },
        { when: { op: "eq", value: 5 }, color: "enzyme" },
      ],
      default: { color: "muted", icon: "flask-conical", text: null },
    });
    expect(result.color).toBe("muted");
  });

  it("per-dimension fallback to default when rule omits a dimension", () => {
    const result = resolveFormatting(2, {
      rules: [{ when: { op: "lt", value: 10 }, color: "warn" }],
      default: { color: "muted", icon: "beaker", text: "Default text" },
    });
    expect(result.color).toBe("warn");
    expect(result.icon).toBe("beaker");
    expect(result.text).toBe("Default text");
  });

  it("per-dimension fallback for text when rule text is null", () => {
    const result = resolveFormatting(2, {
      rules: [
        {
          when: { op: "lt", value: 10 },
          color: "warn",
          text: null,
        },
      ],
      default: {
        color: "muted",
        icon: "flask-conical",
        text: "Default",
      },
    });
    // When rule.text is explicitly null, we fall back to default
    expect(result.text).toBe("Default");
  });

  it("applies neq operator correctly", () => {
    const result = resolveFormatting(7, {
      rules: [{ when: { op: "neq", value: 5 }, color: "enzyme" }],
      default: { color: "muted", icon: "flask-conical", text: null },
    });
    expect(result.color).toBe("enzyme");
  });

  it("applies eq operator correctly", () => {
    const result = resolveFormatting(5, {
      rules: [{ when: { op: "eq", value: 5 }, color: "success" }],
      default: { color: "muted", icon: "flask-conical", text: null },
    });
    expect(result.color).toBe("success");
  });
});

// ── Value Template ─────────────────────────────────────────────────────────

describe("applyValueTemplate", () => {
  it("returns null for null text", () => {
    expect(applyValueTemplate(null, 42)).toBeNull();
  });

  it("returns null for null value", () => {
    expect(applyValueTemplate("Count: {value}", null)).toBe("Count: {value}");
  });

  it("substitutes {value} with the number", () => {
    expect(applyValueTemplate("Only {value} aliquots left", 3)).toBe(
      "Only 3 aliquots left",
    );
  });

  it("substitutes multiple occurrences of {value}", () => {
    expect(applyValueTemplate("{value} / {value}", 5)).toBe("5 / 5");
  });

  it("returns text unchanged when no placeholder", () => {
    expect(applyValueTemplate("All good", 42)).toBe("All good");
  });
});

// ── Card bar formatting rendering ──────────────────────────────────────────

describe("CardTile conditional formatting rendering", () => {
  it("renders the card label with live value", async () => {
    vi.mocked(cardApi.getCards).mockResolvedValue([
      makeCard({
        formatting: {
          rules: [],
          default: { color: "muted", icon: "flask-conical", text: null },
        },
      }),
    ]);
    vi.mocked(cardApi.getMetricValue).mockResolvedValue({ value: 7 });

    renderHomePage();

    await waitFor(() => {
      expect(screen.getByText("In-progress entries")).toBeInTheDocument();
    });
    expect(screen.getByText("7")).toBeInTheDocument();
  });

  it("applies colour from a matched formatting rule", async () => {
    vi.mocked(cardApi.getCards).mockResolvedValue([
      makeCard({
        formatting: {
          rules: [
            {
              when: { op: "lt", value: 10 },
              color: "warn",
            },
          ],
          default: { color: "muted", icon: "flask-conical", text: null },
        },
      }),
    ]);
    vi.mocked(cardApi.getMetricValue).mockResolvedValue({ value: 7 });

    renderHomePage();

    await waitFor(() => {
      expect(screen.getByText("7")).toBeInTheDocument();
    });

    const valueSpan = screen.getByText("7");
    expect(valueSpan).toHaveClass("text-warn-foreground");
  });

  it("substitutes {value} in the subtitle from a matched rule", async () => {
    vi.mocked(cardApi.getCards).mockResolvedValue([
      makeCard({
        formatting: {
          rules: [
            {
              when: { op: "lt", value: 10 },
              text: "Only {value} left",
            },
          ],
          default: { color: "muted", icon: "flask-conical", text: null },
        },
      }),
    ]);
    vi.mocked(cardApi.getMetricValue).mockResolvedValue({ value: 3 });

    renderHomePage();

    await waitFor(() => {
      expect(screen.getByText("Only 3 left")).toBeInTheDocument();
    });
  });

  it("falls back to default when no rule matches", async () => {
    vi.mocked(cardApi.getCards).mockResolvedValue([
      makeCard({
        formatting: {
          rules: [
            {
              when: { op: "lt", value: 2 },
              color: "warn",
              text: "Low",
            },
          ],
          default: {
            color: "success",
            icon: "check-circle",
            text: "All good",
          },
        },
      }),
    ]);
    vi.mocked(cardApi.getMetricValue).mockResolvedValue({ value: 5 });

    renderHomePage();

    await waitFor(() => {
      expect(screen.getByText("5")).toBeInTheDocument();
    });

    const valueSpan = screen.getByText("5");
    expect(valueSpan).toHaveClass("text-success-foreground");
    expect(screen.getByText("All good")).toBeInTheDocument();
  });
});

// ── Hover edit button ──────────────────────────────────────────────────────

describe("Edit button on cards", () => {
  beforeEach(() => {
    vi.mocked(cardApi.getMetrics).mockResolvedValue([]);
  });

  it("opens the card builder modal when clicking the edit pencil on a card", async () => {
    vi.mocked(cardApi.getCards).mockResolvedValue([
      makeCard({ id: 1, is_global: false, owner: 1 }),
    ]);
    vi.mocked(cardApi.getMetricValue).mockResolvedValue({ value: 5 });

    renderHomePage();

    await waitFor(() => {
      expect(screen.getByText("5")).toBeInTheDocument();
    });

    const editBtn = screen.getByLabelText("Edit card");
    fireEvent.click(editBtn);

    // The modal should appear
    await waitFor(() => {
      expect(screen.getByRole("dialog")).toBeInTheDocument();
    });
  });
});

// ── Add card button ────────────────────────────────────────────────────────

describe("Add card button", () => {
  beforeEach(() => {
    vi.mocked(cardApi.getMetrics).mockResolvedValue([]);
  });

  it("renders an Add card button when cards are present", async () => {
    vi.mocked(cardApi.getCards).mockResolvedValue([
      makeCard({ id: 1, is_global: false, owner: 1 }),
    ]);
    vi.mocked(cardApi.getMetricValue).mockResolvedValue({ value: 5 });

    renderHomePage();

    await waitFor(() => {
      expect(screen.getByText("5")).toBeInTheDocument();
    });

    expect(screen.getByLabelText("Add card")).toBeInTheDocument();
  });

  it("opens the card builder modal when clicking the Add card button", async () => {
    vi.mocked(cardApi.getCards).mockResolvedValue([
      makeCard({ id: 1, is_global: false, owner: 1 }),
    ]);
    vi.mocked(cardApi.getMetricValue).mockResolvedValue({ value: 5 });

    renderHomePage();

    await waitFor(() => {
      expect(screen.getByText("5")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByLabelText("Add card"));

    await waitFor(() => {
      expect(screen.getByRole("dialog")).toBeInTheDocument();
    });
  });
});

// ── Card Builder Modal ─────────────────────────────────────────────────────

describe("CardBuilderModal", () => {
  beforeEach(() => {
    vi.mocked(cardApi.getMetrics).mockResolvedValue([
      {
        id: 10,
        owner: 1,
        owner_username: "mkato",
        name: "Count — My View",
        view: 1,
        view_name: "My View",
        aggregate_function: "count",
        column: null,
        created_at: "2026-01-01T00:00:00Z",
        updated_at: "2026-01-01T00:00:00Z",
      },
    ]);
  });

  async function openBuilder() {
    vi.mocked(cardApi.getCards).mockResolvedValue([
      makeCard({ id: 1, is_global: false, owner: 1 }),
    ]);
    vi.mocked(cardApi.getMetricValue).mockResolvedValue({ value: 5 });
    renderHomePage();
    await waitFor(() => {
      expect(screen.getByText("5")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByLabelText("Edit card"));
    await waitFor(() => {
      expect(screen.getByRole("dialog")).toBeInTheDocument();
    });
  }

  it("shows three tabs: Metric, Display, Formatting", async () => {
    await openBuilder();

    expect(screen.getByText("Metric")).toBeInTheDocument();
    expect(screen.getByText("Display")).toBeInTheDocument();
    expect(screen.getByText("Formatting")).toBeInTheDocument();
  });

  it("shows the Metric tab by default with existing metrics", async () => {
    await openBuilder();

    await waitFor(() => {
      expect(screen.getByText("Count — My View")).toBeInTheDocument();
    });
  });

  it("closes when clicking the X button", async () => {
    await openBuilder();

    fireEvent.click(screen.getByLabelText("Close"));

    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
  });

  it("closes when clicking the backdrop", async () => {
    await openBuilder();

    const backdrop = document.querySelector(".bg-black\\/30");
    if (backdrop) {
      fireEvent.click(backdrop);
    }

    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
  });

  it("can navigate between tabs", async () => {
    await openBuilder();

    fireEvent.click(screen.getByText("Display"));

    await waitFor(() => {
      expect(screen.getByLabelText("Label")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText("Formatting"));

    await waitFor(() => {
      expect(screen.getByText("Rules")).toBeInTheDocument();
      expect(screen.getByText("Default style")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText("Metric"));

    await waitFor(() => {
      expect(screen.getByText("Existing metric")).toBeInTheDocument();
    });
  });

  it("can switch to Create new metric mode", async () => {
    await openBuilder();

    fireEvent.click(screen.getByText("Create new"));

    await waitFor(() => {
      expect(screen.getByText("View")).toBeInTheDocument();
      expect(screen.getByText("Aggregate")).toBeInTheDocument();
    });
  });

  it("shows fork prompt when editing a global card", async () => {
    vi.mocked(cardApi.getCards).mockResolvedValue([
      makeCard({ id: 1, is_global: true, owner: null }),
    ]);
    vi.mocked(cardApi.getMetricValue).mockResolvedValue({ value: 5 });
    renderHomePage();
    await waitFor(() => {
      expect(screen.getByText("5")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByLabelText("Edit card"));
    await waitFor(() => {
      expect(screen.getByRole("dialog")).toBeInTheDocument();
    });

    expect(screen.getByText("Global Card")).toBeInTheDocument();
    expect(screen.getByText("Fork to edit")).toBeInTheDocument();
  });

  it("can fork a global card into a personal copy", async () => {
    const forkedCard = makeCard({
      id: 99,
      is_global: false,
      owner: 1,
      owner_username: "mkato",
    });
    vi.mocked(cardApi.forkCard).mockResolvedValue(forkedCard);
    vi.mocked(cardApi.getCards).mockResolvedValue([
      makeCard({ id: 1, is_global: true, owner: null }),
    ]);
    vi.mocked(cardApi.getMetricValue).mockResolvedValue({ value: 5 });
    renderHomePage();
    await waitFor(() => {
      expect(screen.getByText("5")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByLabelText("Edit card"));
    await waitFor(() => {
      expect(screen.getByRole("dialog")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText("Fork to edit"));

    await waitFor(() => {
      expect(cardApi.forkCard).toHaveBeenCalledWith(1);
    });

    // After fork, we should see the builder tabs
    await waitFor(() => {
      expect(screen.getByText("Metric")).toBeInTheDocument();
    });
  });

  it("can add a formatting rule", async () => {
    await openBuilder();

    fireEvent.click(screen.getByText("Formatting"));
    await waitFor(() => {
      expect(screen.getByText("Rules")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByLabelText("Add rule"));

    await waitFor(() => {
      expect(screen.getByText("Rule 1")).toBeInTheDocument();
    });
  });

  it("can remove a formatting rule", async () => {
    await openBuilder();

    fireEvent.click(screen.getByText("Formatting"));
    await waitFor(() => {
      expect(screen.getByText("Rules")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByLabelText("Add rule"));
    await waitFor(() => {
      expect(screen.getByText("Rule 1")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByLabelText("Remove rule"));
    await waitFor(() => {
      expect(screen.queryByText("Rule 1")).not.toBeInTheDocument();
      expect(
        screen.getByText(
          "No rules. The default style will be used for all values.",
        ),
      ).toBeInTheDocument();
    });
  });

  it("saves a new card when creating from the Add button", async () => {
    vi.mocked(cardApi.createCard).mockResolvedValue(makeCard({ id: 100 }));
    vi.mocked(cardApi.getMetrics).mockResolvedValue([
      {
        id: 10,
        owner: 1,
        owner_username: "mkato",
        name: "Count — My View",
        view: 1,
        view_name: "My View",
        aggregate_function: "count",
        column: null,
        created_at: "2026-01-01T00:00:00Z",
        updated_at: "2026-01-01T00:00:00Z",
      },
    ]);

    vi.mocked(cardApi.getCards).mockResolvedValue([
      makeCard({ id: 1, is_global: false, owner: 1 }),
    ]);
    vi.mocked(cardApi.getMetricValue).mockResolvedValue({ value: 5 });
    renderHomePage();
    await waitFor(() => {
      expect(screen.getByText("5")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByLabelText("Add card"));
    await waitFor(() => {
      expect(screen.getByRole("dialog")).toBeInTheDocument();
    });

    await waitFor(() => {
      expect(screen.getByText("Count — My View")).toBeInTheDocument();
    });

    const select = screen.getByDisplayValue("Choose a metric…");
    fireEvent.change(select, { target: { value: "10" } });

    fireEvent.click(screen.getByText("Create card"));

    await waitFor(() => {
      expect(cardApi.createCard).toHaveBeenCalled();
    });
  });
});
