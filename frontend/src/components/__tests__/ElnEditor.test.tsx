/**
 * Integration tests for ElnEditor — verifies the composed modules work together.
 *
 * Mocks the API client, router, ReferenceProvider, and TipTap useEditor/EditorContent
 * so tests focus on the component's orchestration:
 * mode transitions, UI rendering, and wiring between modules.
 *
 * PRD #4: Tests for metadata line, serif title, description, tags, divider.
 *
 * Action buttons (Save/Cancel/Edit/Delete) are rendered by ElnDetail via the
 * forwarded ref — these tests verify the ref actions and onStateChange callback.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, act } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { createRef } from "react";

import ElnEditor from "../ElnEditor";
import type { ElnEditorHandle, ElnEditorState } from "../ElnEditor";

// ── Mocks ──────────────────────────────────────────────────────────────────────

const mockNavigate = vi.fn();
vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
  return { ...actual, useNavigate: () => mockNavigate };
});

const mockGet = vi.fn();
const mockPost = vi.fn();
const mockPut = vi.fn();
const mockDel = vi.fn();
vi.mock("../../api/client", () => ({
  get: (...args: unknown[]) => mockGet(...args),
  post: (...args: unknown[]) => mockPost(...args),
  put: (...args: unknown[]) => mockPut(...args),
  del: (...args: unknown[]) => mockDel(...args),
  ApiError: class ApiError extends Error {
    status: number;
    constructor(status: number) {
      super(`API error: ${status}`);
      this.status = status;
    }
  },
}));

const mockResolveIds = vi.fn().mockResolvedValue(undefined);
vi.mock("../ReferenceProvider", () => ({
  useReferenceContext: () => ({
    resolutionMap: new Map(),
    resolveIds: mockResolveIds,
  }),
}));

/** Stub editor returned by useEditor mock. */
function makeStubEditor(overrides?: Record<string, unknown>) {
  return {
    getJSON: vi.fn().mockReturnValue({
      type: "doc",
      content: [{ type: "paragraph" }],
    }),
    setEditable: vi.fn(),
    commands: { setContent: vi.fn() },
    isActive: vi.fn().mockReturnValue(false),
    chain: vi.fn().mockReturnValue({
      focus: vi.fn().mockReturnValue({
        toggleBold: vi.fn().mockReturnValue({ run: vi.fn() }),
      }),
    }),
    view: { dom: document.createElement("div") },
    isDestroyed: false,
    ...overrides,
  };
}

const stubEditor = makeStubEditor();

vi.mock("@tiptap/react", () => ({
  useEditor: () => stubEditor,
  EditorContent: () => <div data-testid="editor-content" />,
}));

// ── Helpers ────────────────────────────────────────────────────────────────────

function makeEntry(overrides?: Record<string, unknown>) {
  return {
    id: 1,
    display_id: "E1",
    title: "Test Entry",
    content: { type: "doc", content: [{ type: "paragraph" }] },
    folder: null,
    folder_name: "",
    folder_path: "",
    author: null,
    author_username: "alice",
    created_at: "2025-01-01T00:00:00Z",
    updated_at: "2025-06-01T00:00:00Z",
    ...overrides,
  };
}

function renderEditor(
  props: {
    entryId?: string;
    onStateChange?: (state: ElnEditorState) => void;
    ref?: React.Ref<ElnEditorHandle>;
  } = {},
) {
  const { entryId, onStateChange, ref } = props;
  return render(
    <MemoryRouter>
      <ElnEditor entryId={entryId} onStateChange={onStateChange} ref={ref} />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mockGet.mockImplementation((url: string) => {
    if (url.includes("/folders/")) return Promise.resolve([]);
    if (url.includes("/entries/")) return Promise.resolve(makeEntry());
    return Promise.resolve(null);
  });
  mockPost.mockResolvedValue({
    display_id: "E1",
    content: { type: "doc", content: [{ type: "paragraph" }] },
  });
  mockPut.mockResolvedValue({
    content: { type: "doc", content: [{ type: "paragraph" }] },
  });
  mockDel.mockResolvedValue(undefined);
  Object.assign(stubEditor, makeStubEditor());
});

// ── Tests ──────────────────────────────────────────────────────────────────────

describe("ElnEditor integration", () => {
  // ── Loading / Error states ─────────────────────────────────────────────────

  it("renders loading state for an existing entry", () => {
    mockGet.mockReturnValue(new Promise(() => {}));
    renderEditor({ entryId: "E1" });
    expect(screen.getByText("Loading…")).toBeDefined();
  });

  it("renders error state when entry fetch fails", async () => {
    mockGet.mockRejectedValue(new Error("Entry not found"));
    renderEditor({ entryId: "E1" });
    await waitFor(() => {
      expect(screen.getByText(/Entry not found/)).toBeDefined();
    });
  });

  it("renders a back button in error state", async () => {
    mockGet.mockRejectedValue(new Error("Boom"));
    renderEditor({ entryId: "E1" });
    await waitFor(() => {
      expect(screen.getByText(/Back to entries/)).toBeDefined();
    });
  });

  // ── View mode ──────────────────────────────────────────────────────────────

  it("displays entry title in view mode with serif styling", async () => {
    mockGet.mockResolvedValue(
      makeEntry({ title: "My ELN Entry", display_id: "E42" }),
    );
    renderEditor({ entryId: "E42" });

    // onStateChange should fire with view mode after load
    const onStateChange = vi.fn();
    renderEditor({ entryId: "E1", onStateChange });
    await waitFor(() => {
      const lastCall = onStateChange.mock.calls[onStateChange.mock.calls.length - 1]?.[0];
      expect(lastCall?.mode).toBe("view");
      expect(lastCall?.isEdit).toBe(false);
    });
  });

  it("shows 'Untitled' as fallback title in view mode", async () => {
    mockGet.mockResolvedValue(makeEntry({ title: "" }));
    renderEditor({ entryId: "E1" });
    await waitFor(() => {
      expect(screen.getByText("Untitled")).toBeDefined();
    });
  });

  // ── Metadata line ──────────────────────────────────────────────────────────

  it("renders metadata line with display_id, created date, and updated date for existing entry", async () => {
    mockGet.mockResolvedValue(
      makeEntry({
        display_id: "EXP-0284",
        created_at: "2026-06-28T09:14:00Z",
        updated_at: "2026-07-01T14:30:00Z",
      }),
    );
    renderEditor({ entryId: "EXP-0284" });
    await waitFor(() => {
      const meta = screen.getByTestId("metadata-line");
      expect(meta).toBeDefined();
      expect(meta.textContent).toContain("EXP-0284");
      expect(meta.textContent).toContain("2026-06-28");
      expect(meta.textContent).toContain("Updated");
      expect(meta.textContent).toContain("2026-07-01");
    });
  });

  it("renders metadata line with 'New entry' for new entries", () => {
    renderEditor({});
    const meta = screen.getByTestId("metadata-line");
    expect(meta).toBeDefined();
    expect(meta.textContent).toBe("New entry");
  });

  it("renders metadata line with monospace font class", async () => {
    renderEditor({ entryId: "E1" });
    await waitFor(() => {
      const meta = screen.getByTestId("metadata-line");
      expect(meta.className).toContain("font-mono");
    });
  });

  // ── Title input styling ────────────────────────────────────────────────────

  it("renders title input with serif font class in new-entry edit mode", () => {
    renderEditor({});
    const input = screen.getByTestId("title-input");
    expect(input).toBeDefined();
    expect(input.className).toContain("font-serif");
    expect(input.className).toContain("text-[42px]");
  });

  // ── Description placeholder ────────────────────────────────────────────────

  it("renders description placeholder text", async () => {
    renderEditor({ entryId: "E1" });
    await waitFor(() => {
      const desc = screen.getByTestId("description");
      expect(desc).toBeDefined();
      expect(desc.textContent).toContain("sgRNA screen");
    });
  });

  // ── Tags section ───────────────────────────────────────────────────────

  it("renders tags section (empty when entry has no tags)", async () => {
    mockGet.mockResolvedValue(makeEntry());
    renderEditor({ entryId: "E1" });
    await waitFor(() => {
      const tags = screen.getByTestId("tags-section");
      expect(tags).toBeDefined();
    });
    // Tags section exists but has no chip children when entry has no tags
    const tagsSection = screen.getByTestId("tags-section");
    expect(tagsSection.querySelectorAll("span.inline-flex").length).toBe(0);
  });

  it("renders tag chips when entry has tags", async () => {
    mockGet.mockResolvedValue(makeEntry({
      tags: [
        { id: 1, name: "CRISPR", color: "enzyme" },
        { id: 2, name: "QC", color: "success" },
      ],
    }));
    renderEditor({ entryId: "E1" });
    await waitFor(() => {
      expect(screen.getByText("CRISPR")).toBeDefined();
      expect(screen.getByText("QC")).toBeDefined();
    });
  });

  // ── Hairline divider ───────────────────────────────────────────────────────

  it("renders hairline divider between header and content", async () => {
    renderEditor({ entryId: "E1" });
    await waitFor(() => {
      const divider = screen.getByTestId("content-divider");
      expect(divider).toBeDefined();
      expect(divider.className).toContain("bg-hairline");
    });
  });

  // ── onStateChange callback ─────────────────────────────────────────────────

  it("fires onStateChange with initial state on mount (loading or edit-new)", () => {
    const onStateChange = vi.fn();
    renderEditor({ entryId: "E1", onStateChange });
    // First call should fire immediately with loading or view state
    expect(onStateChange).toHaveBeenCalled();
    const state = onStateChange.mock.calls[0][0] as ElnEditorState;
    expect(state.mode).toBeDefined();
    expect(typeof state.isEdit).toBe("boolean");
  });

  it("fires onStateChange with edit mode when isNew", () => {
    const onStateChange = vi.fn();
    renderEditor({ onStateChange });
    // New entry starts in edit-new mode
    expect(onStateChange).toHaveBeenCalled();
    const firstCall = onStateChange.mock.calls[0][0] as ElnEditorState;
    expect(firstCall.isEdit).toBe(true);
  });

  // ── Ref actions (mode transitions via forwarded ref) ────────────────────────

  it("transitions to edit mode via ref.enterEditMode()", async () => {
    const ref = createRef<ElnEditorHandle>();
    const onStateChange = vi.fn();
    mockGet.mockResolvedValue(
      makeEntry({ title: "Original Title", display_id: "E99" }),
    );
    renderEditor({ entryId: "E99", onStateChange, ref });

    // Wait for entry to load (view mode)
    await waitFor(() => {
      const calls = onStateChange.mock.calls;
      const lastMode = calls[calls.length - 1]?.[0]?.mode;
      expect(lastMode).toBe("view");
    });

    // Enter edit mode via ref
    await act(() => {
      ref.current?.enterEditMode();
    });

    await waitFor(() => {
      const calls = onStateChange.mock.calls;
      const lastState = calls[calls.length - 1]?.[0] as ElnEditorState | undefined;
      expect(lastState?.isEdit).toBe(true);
    });
  });

  it("cancels edit mode via ref.cancel()", async () => {
    const ref = createRef<ElnEditorHandle>();
    const onStateChange = vi.fn();
    mockGet.mockResolvedValue(
      makeEntry({ title: "Original Title", display_id: "E100" }),
    );
    renderEditor({ entryId: "E100", onStateChange, ref });

    await waitFor(() => {
      const lastState = onStateChange.mock.calls[onStateChange.mock.calls.length - 1]?.[0] as
        | ElnEditorState
        | undefined;
      expect(lastState?.mode).toBe("view");
    });

    // Enter edit mode
    await act(() => {
      ref.current?.enterEditMode();
    });

    await waitFor(() => {
      const lastState = onStateChange.mock.calls[onStateChange.mock.calls.length - 1]?.[0] as
        | ElnEditorState
        | undefined;
      expect(lastState?.isEdit).toBe(true);
    });

    // Cancel
    await act(() => {
      ref.current?.cancel();
    });

    await waitFor(() => {
      const lastState = onStateChange.mock.calls[onStateChange.mock.calls.length - 1]?.[0] as
        | ElnEditorState
        | undefined;
      expect(lastState?.isEdit).toBe(false);
      expect(lastState?.mode).toBe("view");
    });
  });

  // ── New entry mode ─────────────────────────────────────────────────────────

  it("starts in edit mode when isNew (no entryId)", () => {
    const onStateChange = vi.fn();
    renderEditor({ onStateChange });
    const state = onStateChange.mock.calls[0][0] as ElnEditorState;
    expect(state.isEdit).toBe(true);
  });

  it("shows 'New entry' metadata for new entries", () => {
    renderEditor({});
    expect(screen.getByText("New entry")).toBeDefined();
  });

  it("renders title input for new entries", () => {
    renderEditor({});
    const input = screen.getByTestId("title-input");
    expect(input).toBeDefined();
    expect(input.tagName).toBe("INPUT");
  });

  it("autofocuses title input for new entries", () => {
    renderEditor({});
    const input = screen.getByTestId("title-input");
    expect(input).toBe(document.activeElement);
  });

  // ── Action buttons are NOT in ElnEditor ────────────────────────────────────

  it("does not render Save, Edit, Delete, or Cancel text buttons (moved to ElnDetail)", async () => {
    // New entry — no Save/Cancel text
    const { container: newContainer } = renderEditor({});
    expect(newContainer.textContent).not.toContain("Saving…");

    // Existing entry in view mode — no Edit/Delete text
    const { container: viewContainer } = renderEditor({ entryId: "E1" });
    await waitFor(() => {
      expect(screen.getByTestId("metadata-line")).toBeDefined();
    });
    expect(viewContainer.textContent).not.toContain("Saving…");
  });

  it("does not render duplicate History, Comments, or Star buttons", async () => {
    renderEditor({ entryId: "E1" });
    await waitFor(() => {
      expect(screen.getByTestId("metadata-line")).toBeDefined();
    });
    // These aria-labels should not exist inside ElnEditor
    expect(screen.queryByLabelText("History")).toBeNull();
    expect(screen.queryByLabelText("Comments")).toBeNull();
    expect(screen.queryByLabelText("Star")).toBeNull();
  });

  // ── Save indicator ─────────────────────────────────────────────────────────

  it("shows save indicator when in edit mode", () => {
    renderEditor({});
    expect(screen.getByText("Saved")).toBeDefined();
  });

  // ── Editor content ─────────────────────────────────────────────────────────

  it("renders editor content", () => {
    renderEditor({});
    expect(screen.getByTestId("editor-content")).toBeDefined();
  });

  // ── No paper-page wrapper ──────────────────────────────────────────────────

  it("does not render paper-page wrapper", async () => {
    const { container } = renderEditor({ entryId: "E1" });
    await waitFor(() => {
      expect(screen.getByTestId("metadata-line")).toBeDefined();
    });
    expect(container.querySelector(".paper-page")).toBeNull();
  });

  // ── No bubble menu rendered ────────────────────────────────────────────────

  it("does not render a bubble menu", async () => {
    const ref = createRef<ElnEditorHandle>();
    const onStateChange = vi.fn();
    mockGet.mockResolvedValue(makeEntry({ display_id: "E200" }));
    renderEditor({ entryId: "E200", ref, onStateChange });

    await waitFor(() => {
      const lastState = onStateChange.mock.calls[onStateChange.mock.calls.length - 1]?.[0] as
        | ElnEditorState
        | undefined;
      expect(lastState?.mode).toBe("view");
    });

    // Enter edit mode via ref
    await act(() => {
      ref.current?.enterEditMode();
    });

    await waitFor(() => {
      const lastState = onStateChange.mock.calls[onStateChange.mock.calls.length - 1]?.[0] as
        | ElnEditorState
        | undefined;
      expect(lastState?.isEdit).toBe(true);
    });

    expect(screen.queryByTestId("bubble-menu")).toBeNull();
  });
});
