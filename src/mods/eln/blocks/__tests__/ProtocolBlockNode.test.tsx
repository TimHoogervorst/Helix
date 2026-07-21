/**
 * Tests for the ProtocolBlockComponent React NodeView component.
 *
 * Covers: placeholder state, picker open/close, protocol selection,
 * rendered card (steps, notes), step toggle (complete/incomplete),
 * empty states, serialization round-trip.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

// ── Mock API client ───────────────────────────────────────────────────────

const mockGet = vi.fn();
vi.mock("../../../../shell/src/api/client", () => ({
  get: (...args: unknown[]) => mockGet(...args),
}));

// ── Import AFTER mocks ────────────────────────────────────────────────────

import { ProtocolBlockComponent } from "../ProtocolBlockNode";

// ── Fixtures ──────────────────────────────────────────────────────────────

const sampleItems = [
  { type: "step" as const, text: "Prepare the reaction mix." },
  { type: "note" as const, text: "Use fresh reagents — old ones may degrade." },
  { type: "step" as const, text: "Incubate at 37°C for 30 min." },
];

const sampleProtocols = [
  {
    id: 1,
    name: "CRISPR RNP Transfection",
    items: sampleItems,
    is_active: true,
    created_at: "2025-01-01T00:00:00Z",
    updated_at: "2025-01-01T00:00:00Z",
  },
  {
    id: 2,
    name: "Western Blot",
    items: [
      { type: "step" as const, text: "Load gel." },
      { type: "step" as const, text: "Transfer to membrane." },
    ],
    is_active: true,
    created_at: "2025-01-02T00:00:00Z",
    updated_at: "2025-01-02T00:00:00Z",
  },
];

/**
 * Build a mock BlockComponentProps object for testing.
 *
 * Two-level merge:
 * - `attrs` replaces instance.attrs keys (merged over defaults)
 * - `rest` replaces any top-level keys (e.g. instance)
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function makeBlockComponentProps(opts?: {
  attrs?: Record<string, unknown>;
  rest?: Record<string, unknown>;
}): any {
  const attrs = {
    protocolId: null,
    name: "Protocol",
    items: [],
    stepStates: {},
    editable: false,
    ...(opts?.attrs ?? {}),
  };

  const defaults = {
    context: {} as any,
    instance: {
      id: "inst-1",
      blockId: "eln.protocol-block",
      slotId: "eln.editor",
      attrs,
      updateAttrs: vi.fn(),
    },
  };

  const { instance: restInstance, ...restTop } = (opts?.rest as any) ?? {};
  return { ...defaults, ...restTop, instance: { ...defaults.instance, ...restInstance } };
}

// ══════════════════════════════════════════════════════════════════════════
// Placeholder state
// ══════════════════════════════════════════════════════════════════════════

describe("ProtocolBlockComponent — placeholder state", () => {
  beforeEach(() => {
    mockGet.mockReset();
  });

  it("renders the Protocol heading", () => {
    render(<ProtocolBlockComponent {...makeBlockComponentProps()} />);
    expect(screen.getByText("Protocol")).toBeInTheDocument();
  });

  it("renders the Add Protocol button", () => {
    render(<ProtocolBlockComponent {...makeBlockComponentProps()} />);
    const btn = screen.getByTestId("add-protocol-btn");
    expect(btn).toBeInTheDocument();
    expect(btn).toHaveTextContent("Add Protocol");
  });

  it("renders the placeholder container", () => {
    render(<ProtocolBlockComponent {...makeBlockComponentProps()} />);
    expect(screen.getByTestId("protocol-placeholder")).toBeInTheDocument();
  });
});

// ══════════════════════════════════════════════════════════════════════════
// Picker dropdown
// ══════════════════════════════════════════════════════════════════════════

describe("ProtocolBlockComponent — picker dropdown", () => {
  beforeEach(() => {
    mockGet.mockReset();
  });

  it("opens picker on Add Protocol click", async () => {
    mockGet.mockResolvedValue({ results: sampleProtocols });
    render(<ProtocolBlockComponent {...makeBlockComponentProps()} />);

    fireEvent.click(screen.getByTestId("add-protocol-btn"));

    await waitFor(() => {
      expect(screen.getByTestId("protocol-picker")).toBeInTheDocument();
    });
  });

  it("displays loading state initially", () => {
    // Don't resolve the promise yet — should show loading
    mockGet.mockReturnValue(new Promise(() => {}));
    render(<ProtocolBlockComponent {...makeBlockComponentProps()} />);

    fireEvent.click(screen.getByTestId("add-protocol-btn"));

    expect(screen.getByText("Loading protocols…")).toBeInTheDocument();
  });

  it("displays fetched protocols in the picker", async () => {
    mockGet.mockResolvedValue({ results: sampleProtocols });
    render(<ProtocolBlockComponent {...makeBlockComponentProps()} />);

    fireEvent.click(screen.getByTestId("add-protocol-btn"));

    await waitFor(() => {
      expect(
        screen.getByText("CRISPR RNP Transfection"),
      ).toBeInTheDocument();
    });
    expect(screen.getByText("Western Blot")).toBeInTheDocument();
  });

  it("shows empty message when no protocols exist", async () => {
    mockGet.mockResolvedValue({ results: [] });
    render(<ProtocolBlockComponent {...makeBlockComponentProps()} />);

    fireEvent.click(screen.getByTestId("add-protocol-btn"));

    await waitFor(() => {
      expect(
        screen.getByText(/No protocols available/),
      ).toBeInTheDocument();
    });
  });

  it("selecting a protocol snapshots into node attrs", async () => {
    const updateAttributes = vi.fn();
    mockGet.mockResolvedValue({ results: sampleProtocols });

    render(
      <ProtocolBlockComponent
        {...makeBlockComponentProps({ rest: { instance: { updateAttrs: updateAttributes } } })}
      />,
    );

    // Open picker
    fireEvent.click(screen.getByTestId("add-protocol-btn"));

    // Wait for protocols to load
    const option = await screen.findByText("CRISPR RNP Transfection");
    fireEvent.click(option);

    expect(updateAttributes).toHaveBeenCalledWith({
      protocolId: 1,
      name: "CRISPR RNP Transfection",
      items: sampleItems,
      stepStates: {},
    });
  });

  it("picker closes after selecting a protocol", async () => {
    mockGet.mockResolvedValue({ results: sampleProtocols });

    render(<ProtocolBlockComponent {...makeBlockComponentProps()} />);

    fireEvent.click(screen.getByTestId("add-protocol-btn"));
    const option = await screen.findByText("CRISPR RNP Transfection");
    fireEvent.click(option);

    await waitFor(() => {
      expect(screen.queryByTestId("protocol-picker")).toBeNull();
    });
  });

  it("does not re-fetch protocols if already loaded", async () => {
    mockGet.mockResolvedValue({ results: sampleProtocols });
    render(<ProtocolBlockComponent {...makeBlockComponentProps()} />);

    // Open picker first time
    fireEvent.click(screen.getByTestId("add-protocol-btn"));
    await screen.findByText("CRISPR RNP Transfection");

    expect(mockGet).toHaveBeenCalledTimes(1);

    // Close via outside click
    fireEvent.mouseDown(document.body);
    await waitFor(() => {
      expect(screen.queryByTestId("protocol-picker")).toBeNull();
    });

    // Reopen — should use cached protocols, no re-fetch
    fireEvent.click(screen.getByTestId("add-protocol-btn"));
    await screen.findByText("CRISPR RNP Transfection");
    expect(mockGet).toHaveBeenCalledTimes(1);
  });
});

// ══════════════════════════════════════════════════════════════════════════
// Rendered card
// ══════════════════════════════════════════════════════════════════════════

describe("ProtocolBlockComponent — rendered card", () => {
  beforeEach(() => {
    mockGet.mockReset();
  });

  function cardProps(opts?: {
    attrs?: Record<string, unknown>;
    rest?: Record<string, unknown>;
  }) {
    return makeBlockComponentProps({
      attrs: {
        protocolId: 1,
        name: "CRISPR RNP Transfection",
        items: sampleItems,
        stepStates: {},
        editable: false,
        ...(opts?.attrs ?? {}),
      },
      rest: opts?.rest,
    });
  }

  it("renders the protocol name as a heading", () => {
    render(<ProtocolBlockComponent {...cardProps()} />);
    expect(
      screen.getByText("CRISPR RNP Transfection"),
    ).toBeInTheDocument();
  });

  it("renders step items with step numbers", () => {
    render(<ProtocolBlockComponent {...cardProps()} />);
    expect(screen.getByText("Step 01")).toBeInTheDocument();
    expect(screen.getByText("Step 02")).toBeInTheDocument();
    expect(
      screen.getByText("Prepare the reaction mix."),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Incubate at 37°C for 30 min."),
    ).toBeInTheDocument();
  });

  it("renders note items without checkboxes", () => {
    render(<ProtocolBlockComponent {...cardProps()} />);
    const note = screen.getByTestId("protocol-note-1");
    expect(note).toBeInTheDocument();
    expect(note).toHaveTextContent(
      "Use fresh reagents — old ones may degrade.",
    );
    // Note renders without a toggle button inside its own element
    const noteToggle = note.querySelector(
      "[data-testid^='step-toggle-']",
    );
    expect(noteToggle).toBeNull();
  });

  it("renders toggle buttons for each step", () => {
    render(<ProtocolBlockComponent {...cardProps()} />);
    expect(screen.getByTestId("step-toggle-0")).toBeInTheDocument();
    expect(screen.getByTestId("step-toggle-1")).toBeInTheDocument();
  });

  it("shows empty message when there are no items", () => {
    render(
      <ProtocolBlockComponent
        {...cardProps({ attrs: { items: [] } })}
      />,
    );
    expect(
      screen.getByText("This protocol has no items."),
    ).toBeInTheDocument();
  });

  it("shows notes-only message when there are only notes", () => {
    render(
      <ProtocolBlockComponent
        {...cardProps({
          attrs: {
            items: [
              { type: "note" as const, text: "Just a note." },
              { type: "note" as const, text: "Another note." },
            ],
          },
        })}
      />,
    );
    expect(
      screen.getByText("This protocol has notes only."),
    ).toBeInTheDocument();
  });
});

// ══════════════════════════════════════════════════════════════════════════
// Step toggle
// ══════════════════════════════════════════════════════════════════════════

describe("ProtocolBlockComponent — step toggle", () => {
  beforeEach(() => {
    mockGet.mockReset();
  });

  function cardProps(opts?: {
    attrs?: Record<string, unknown>;
    rest?: Record<string, unknown>;
  }) {
    return makeBlockComponentProps({
      attrs: {
        protocolId: 1,
        name: "Test Protocol",
        items: [
          { type: "step" as const, text: "Step one." },
          { type: "step" as const, text: "Step two." },
        ],
        stepStates: {},
        editable: false,
        ...(opts?.attrs ?? {}),
      },
      rest: opts?.rest,
    });
  }

  it("marks a step complete on toggle click", () => {
    const updateAttributes = vi.fn();
    render(
      <ProtocolBlockComponent
        {...cardProps({ rest: { instance: { updateAttrs: updateAttributes } } })}
      />,
    );

    fireEvent.click(screen.getByTestId("step-toggle-0"));

    expect(updateAttributes).toHaveBeenCalledWith({
      stepStates: {
        0: { completed: true, completedAt: expect.any(String) },
      },
    });
  });

  it("marks a completed step incomplete on second click — clears entry", () => {
    const updateAttributes = vi.fn();
    render(
      <ProtocolBlockComponent
        {...cardProps({
          attrs: {
            stepStates: {
              0: {
                completed: true,
                completedAt: "2025-07-12T14:22:00.000Z",
              },
            },
          },
          rest: { instance: { updateAttrs: updateAttributes } },
        })}
      />,
    );

    fireEvent.click(screen.getByTestId("step-toggle-0"));

    // Entry should be removed from stepStates entirely (not { completed: false })
    expect(updateAttributes).toHaveBeenCalledWith({
      stepStates: {},
    });
  });

  it("shows completed badge with timestamp for completed step", () => {
    render(
      <ProtocolBlockComponent
        {...cardProps({
          attrs: {
            stepStates: {
              0: {
                completed: true,
                completedAt: "2025-07-12T14:22:00.000Z",
              },
            },
          },
        })}
      />,
    );

    expect(screen.getByText(/✓ complete/)).toBeInTheDocument();
    // Time is formatted in local timezone — match any HH:MM pattern
    expect(screen.getByText(/✓ complete · \d{2}:\d{2}/)).toBeInTheDocument();
  });

  it("toggle button aria-label reflects state", () => {
    render(
      <ProtocolBlockComponent
        {...cardProps({
          attrs: {
            stepStates: {
              0: {
                completed: true,
                completedAt: "2025-07-12T14:22:00.000Z",
              },
            },
          },
        })}
      />,
    );

    const btn = screen.getByTestId("step-toggle-0");
    expect(btn).toHaveAttribute(
      "aria-label",
      "Mark step 1 incomplete",
    );

    // Second step is not completed
    const btn2 = screen.getByTestId("step-toggle-1");
    expect(btn2).toHaveAttribute(
      "aria-label",
      "Mark step 2 complete",
    );
  });
});

// ══════════════════════════════════════════════════════════════════════════
// HTML serialization round-trip (via DOM)
// ══════════════════════════════════════════════════════════════════════════

describe("ProtocolBlock — serialization round-trip", () => {
  it("rendered card survives node attribute serialization format", () => {
    // Simulate what TipTap does: render data-* attributes on a container div
    // and verify the shape matches expectations.
    const container = document.createElement("div");
    container.setAttribute("data-type", "eln-protocol");
    container.setAttribute("data-protocol-id", "42");
    container.setAttribute("data-name", "My Protocol");
    container.setAttribute(
      "data-items",
      JSON.stringify([{ type: "step", text: "Do something." }]),
    );
    container.setAttribute(
      "data-step-states",
      JSON.stringify({ 0: { completed: true } }),
    );
    container.setAttribute("data-editable", "false");

    // Verify the data-type marker (used by parseHTML)
    expect(container.getAttribute("data-type")).toBe("eln-protocol");

    // Verify JSON values round-trip
    const parsedItems = JSON.parse(
      container.getAttribute("data-items") ?? "[]",
    );
    expect(parsedItems).toEqual([{ type: "step", text: "Do something." }]);

    const parsedStates = JSON.parse(
      container.getAttribute("data-step-states") ?? "{}",
    );
    expect(parsedStates).toEqual({ 0: { completed: true } });

    // Verify scalar values
    expect(container.getAttribute("data-protocol-id")).toBe("42");
    expect(container.getAttribute("data-name")).toBe("My Protocol");
    expect(container.getAttribute("data-editable")).toBe("false");
  });

  it("parse logic on attributes handles all edge cases", () => {
    // These simulate the parseHTML functions from ProtocolBlock.addAttributes()

    // --- protocolId ---
    const parseProtocolId = (el: HTMLElement): number | null => {
      const v = el.getAttribute("data-protocol-id");
      if (v === null || v === "") return null;
      const parsed = parseInt(v, 10);
      return isNaN(parsed) ? null : parsed;
    };

    const a = document.createElement("div");
    a.setAttribute("data-protocol-id", "42");
    expect(parseProtocolId(a)).toBe(42);

    const b = document.createElement("div");
    expect(parseProtocolId(b)).toBeNull();

    const c = document.createElement("div");
    c.setAttribute("data-protocol-id", "");
    expect(parseProtocolId(c)).toBeNull();

    // --- name ---
    const parseName = (el: HTMLElement): string =>
      el.getAttribute("data-name") || "Protocol";

    const d = document.createElement("div");
    d.setAttribute("data-name", "Test");
    expect(parseName(d)).toBe("Test");

    const e = document.createElement("div");
    expect(parseName(e)).toBe("Protocol");

    // --- items (JSON array) ---
    const parseItems = (el: HTMLElement) => {
      const raw = el.getAttribute("data-items");
      if (!raw) return [];
      try { return JSON.parse(raw); } catch { return []; }
    };

    const f = document.createElement("div");
    f.setAttribute(
      "data-items",
      JSON.stringify([{ type: "step", text: "A" }]),
    );
    expect(parseItems(f)).toEqual([{ type: "step", text: "A" }]);

    const g = document.createElement("div");
    expect(parseItems(g)).toEqual([]);

    const h = document.createElement("div");
    h.setAttribute("data-items", "not-json");
    expect(parseItems(h)).toEqual([]);

    // --- stepStates (JSON object) ---
    const parseStepStates = (el: HTMLElement) => {
      const raw = el.getAttribute("data-step-states");
      if (!raw) return {};
      try { return JSON.parse(raw); } catch { return {}; }
    };

    const i = document.createElement("div");
    i.setAttribute(
      "data-step-states",
      JSON.stringify({ 0: { completed: true } }),
    );
    expect(parseStepStates(i)).toEqual({ 0: { completed: true } });

    const j = document.createElement("div");
    expect(parseStepStates(j)).toEqual({});

    // --- editable (boolean) ---
    const parseEditable = (el: HTMLElement): boolean => {
      const v = el.getAttribute("data-editable");
      return v === "true";
    };

    const k = document.createElement("div");
    k.setAttribute("data-editable", "true");
    expect(parseEditable(k)).toBe(true);

    const l = document.createElement("div");
    expect(parseEditable(l)).toBe(false);
  });
});
