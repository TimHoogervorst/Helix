/**
 * Integration tests for ElnEditor — always-editable workspace with auto-save.
 *
 * Mocks the API client, router, ReferenceProvider, useSaveQueue, and
 * TipTap useEditor/EditorContent so tests focus on the component's
 * orchestration: always-editable controls, save status indicator,
 * and wiring between hooks.
 *
 * PRD #4: Tests for metadata line, serif title, description, tags, divider.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { createRef } from "react";

import ElnEditor from "../editor/ElnEditor";
import type { ElnEditorHandle, ElnEditorState } from "../editor/ElnEditor";

// ── Mocks ──────────────────────────────────────────────────────────────────────

const mockNavigate = vi.fn();
vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
  return { ...actual, useNavigate: () => mockNavigate };
});

const mockGet = vi.fn();
const mockDel = vi.fn();
vi.mock("../../../core/api/client", () => ({
  get: (...args: unknown[]) => mockGet(...args),
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
vi.mock("../../../core/references/ReferenceProvider", () => ({
  useReferenceContext: () => ({
    resolutionMap: new Map(),
    resolveIds: mockResolveIds,
  }),
}));

const mockAcquireLock = vi.fn().mockResolvedValue({});
const mockReleaseLock = vi.fn().mockResolvedValue(undefined);
const mockAttachTags = vi.fn();
const mockDetachTag = vi.fn();
const mockGetLockStatus = vi.fn().mockResolvedValue({ locked: false });
vi.mock("../api", () => ({
  acquireLock: (...args: unknown[]) => mockAcquireLock(...args),
  releaseLock: (...args: unknown[]) => mockReleaseLock(...args),
  attachTags: (...args: unknown[]) => mockAttachTags(...args),
  detachTag: (...args: unknown[]) => mockDetachTag(...args),
  getLockStatus: (...args: unknown[]) => mockGetLockStatus(...args),
}));

vi.mock("../../../core/user/CurrentUserProvider", () => ({
  useCurrentUser: () => ({
    user: { id: 1, username: "alice", first_name: "", last_name: "", color: "#000", is_active: true, date_joined: "2025-01-01" },
    isChecking: false,
    error: null,
    refresh: vi.fn(),
  }),
}));

vi.mock("../hooks/useSaveQueue", () => ({
  useSaveQueue: () => ({
    status: "idle" as const,
    lastSavedAt: null,
    queueLength: 0,
    enqueue: vi.fn().mockResolvedValue({
      id: 1,
      display_id: "E1",
      title: "Saved Entry",
      content: { type: "doc", content: [{ type: "paragraph" }] },
      folder: null,
      folder_name: "",
      folder_path: "",
      author: null,
      author_username: null,
      created_at: "2025-01-01T00:00:00Z",
      updated_at: "2025-06-01T00:00:00Z",
      status: "in_progress",
      status_display: "In Progress",
      tags: [],
      mentions: [],
    }),
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
    /** Initial URL entries for MemoryRouter (e.g. ["/eln/E-NEW?new=true"]). */
    initialEntries?: string[];
  } = {},
) {
  const { entryId, onStateChange, ref, initialEntries } = props;
  return render(
    <MemoryRouter initialEntries={initialEntries}>
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
  mockDel.mockResolvedValue(undefined);
  mockAcquireLock.mockResolvedValue({});
  mockReleaseLock.mockResolvedValue(undefined);
  mockGetLockStatus.mockReset();
  mockGetLockStatus.mockResolvedValue({ locked: false });
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

  // ── Always-editable: title ─────────────────────────────────────────────────

  it("shows 'Untitled' as fallback title", async () => {
    mockGet.mockResolvedValue(makeEntry({ title: "" }));
    renderEditor({ entryId: "E1" });
    await waitFor(() => {
      expect(screen.getByText("Untitled")).toBeDefined();
    });
  });

  it("renders title as always contentEditable H1", async () => {
    renderEditor({ entryId: "E1" });
    await waitFor(() => {
      const title = screen.getByTestId("title-display");
      expect(title.tagName).toBe("H1");
      expect(title.className).toContain("font-serif");
      expect(title.getAttribute("contentEditable")).toBe("true");
    });
  });

  // ── Always-editable: description as textarea ──────────────────────────────

  it("renders description as textarea (always editable)", async () => {
    mockGet.mockResolvedValue(
      makeEntry({
        content: {
          type: "doc",
          content: [
            {
              type: "paragraph",
              content: [{ type: "text", text: "A brief summary." }],
            },
            { type: "paragraph" },
          ],
        },
      }),
    );
    renderEditor({ entryId: "E1" });
    await waitFor(() => {
      const textarea = screen.getByTestId("description-input");
      expect(textarea.tagName).toBe("TEXTAREA");
    });
  });

  // ── Metadata line ──────────────────────────────────────────────────────────

  it("renders metadata line with display_id and dates", async () => {
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
      expect(meta.textContent).toContain("2026-07-01");
    });
  });

  it("renders metadata line with monospace font class", async () => {
    renderEditor({ entryId: "E1" });
    await waitFor(() => {
      const meta = screen.getByTestId("metadata-line");
      expect(meta.className).toContain("font-mono");
    });
  });

  // ── Tags section ───────────────────────────────────────────────────────────

  it("renders tags section", async () => {
    mockGet.mockResolvedValue(makeEntry());
    renderEditor({ entryId: "E1" });
    await waitFor(() => {
      const tags = screen.getByTestId("tags-section");
      expect(tags).toBeDefined();
    });
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

  it("fires onStateChange with isReady and saveStatus", () => {
    const onStateChange = vi.fn();
    renderEditor({ entryId: "E1", onStateChange });
    expect(onStateChange).toHaveBeenCalled();
    const state = onStateChange.mock.calls[0][0] as ElnEditorState;
    expect(typeof state.isReady).toBe("boolean");
    expect(state.saveStatus).toBe("idle");
  });

  it("fires onStateChange with isReady true after load", async () => {
    const onStateChange = vi.fn();
    renderEditor({ entryId: "E1", onStateChange });
    await waitFor(() => {
      const calls = onStateChange.mock.calls;
      const lastCall = calls[calls.length - 1]?.[0] as ElnEditorState | undefined;
      expect(lastCall?.isReady).toBe(true);
    });
  });

  // ── Ref actions ────────────────────────────────────────────────────────────

  it("exposes save via ref", async () => {
    const ref = createRef<ElnEditorHandle>();
    renderEditor({ entryId: "E1", ref });
    await waitFor(() => {
      expect(screen.getByTestId("metadata-line")).toBeDefined();
    });
    expect(ref.current?.save).toBeDefined();
  });

  it("exposes deleteEntry via ref", async () => {
    const ref = createRef<ElnEditorHandle>();
    renderEditor({ entryId: "E1", ref });
    await waitFor(() => {
      expect(screen.getByTestId("metadata-line")).toBeDefined();
    });
    expect(ref.current?.deleteEntry).toBeDefined();
  });

  it("exposes setFolderId via ref", async () => {
    const ref = createRef<ElnEditorHandle>();
    renderEditor({ entryId: "E1", ref });
    await waitFor(() => {
      expect(screen.getByTestId("metadata-line")).toBeDefined();
    });
    expect(ref.current?.setFolderId).toBeDefined();
  });

  it("exposes setStatus via ref", async () => {
    const ref = createRef<ElnEditorHandle>();
    renderEditor({ entryId: "E1", ref });
    await waitFor(() => {
      expect(screen.getByTestId("metadata-line")).toBeDefined();
    });
    expect(ref.current?.setStatus).toBeDefined();
  });

  // ── New entry mode (?new=true) ────────────────────────────────────────────

  it("renders title as contentEditable H1 for ?new=true entries", async () => {
    mockGet.mockResolvedValue(makeEntry({ title: "Untitled" }));
    renderEditor({
      entryId: "E-NEW",
      initialEntries: ["/eln/E-NEW?new=true"],
    });
    await waitFor(() => {
      const title = screen.getByTestId("title-display");
      expect(title.tagName).toBe("H1");
      expect(title.getAttribute("contentEditable")).toBe("true");
    });
  });

  it("shows display_id metadata for ?new=true entries", async () => {
    mockGet.mockResolvedValue(makeEntry({ display_id: "E-NEW" }));
    renderEditor({
      entryId: "E-NEW",
      initialEntries: ["/eln/E-NEW?new=true"],
    });
    await waitFor(() => {
      expect(screen.getByText(/E-NEW/)).toBeDefined();
    });
  });

  // ── Editor content ─────────────────────────────────────────────────────────

  it("renders editor content", async () => {
    mockGet.mockResolvedValue(makeEntry());
    renderEditor({ entryId: "E1" });
    await waitFor(() => {
      expect(screen.getByTestId("editor-content")).toBeDefined();
    });
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
    renderEditor({ entryId: "E1" });
    await waitFor(() => {
      expect(screen.getByTestId("metadata-line")).toBeDefined();
    });
    expect(screen.queryByTestId("bubble-menu")).toBeNull();
  });

  // ── No action buttons in ElnEditor ────────────────────────────────────────

  it("does not render History, Comments, or Star buttons", async () => {
    renderEditor({ entryId: "E1" });
    await waitFor(() => {
      expect(screen.getByTestId("metadata-line")).toBeDefined();
    });
    expect(screen.queryByLabelText("History")).toBeNull();
    expect(screen.queryByLabelText("Comments")).toBeNull();
    expect(screen.queryByLabelText("Star")).toBeNull();
  });

  // ── Locked state: read-only when another user holds the lock ────────────

  it("shows locked banner when locked by another user", async () => {
    mockGetLockStatus.mockResolvedValue({
      locked: true,
      held_by: 99,
      held_by_username: "bob",
    });

    renderEditor({ entryId: "E1" });

    const banner = await screen.findByTestId("locked-banner");
    expect(banner).toBeDefined();
    expect(banner.textContent).toContain("bob");
    expect(banner.textContent).toContain("read-only mode");
  });

  it("does NOT show locked banner when entry is not locked", async () => {
    mockGetLockStatus.mockResolvedValue({ locked: false });

    renderEditor({ entryId: "E1" });

    await waitFor(() => {
      expect(screen.getByTestId("metadata-line")).toBeDefined();
    });

    expect(screen.queryByTestId("locked-banner")).toBeNull();
  });

  it("sets title contentEditable to false when locked", async () => {
    mockGetLockStatus.mockResolvedValue({
      locked: true,
      held_by: 99,
      held_by_username: "bob",
    });

    renderEditor({ entryId: "E1" });

    await screen.findByTestId("locked-banner");

    const title = screen.getByTestId("title-display");
    expect(title.getAttribute("contentEditable")).toBe("false");
  });

  it("sets description textarea to readOnly when locked", async () => {
    mockGetLockStatus.mockResolvedValue({
      locked: true,
      held_by: 99,
      held_by_username: "bob",
    });

    renderEditor({ entryId: "E1" });

    await screen.findByTestId("locked-banner");

    const textarea = screen.getByTestId("description-input");
    expect(textarea.hasAttribute("readonly")).toBe(true);
  });

  it("does NOT show locked banner when locked by self", async () => {
    mockGetLockStatus.mockResolvedValue({
      locked: true,
      held_by: 1, // same as current user
    });

    renderEditor({ entryId: "E1" });

    await waitFor(() => {
      expect(screen.getByTestId("metadata-line")).toBeDefined();
    });

    expect(screen.queryByTestId("locked-banner")).toBeNull();
  });

  it("includes isLockedByOther and lockHeldBy in onStateChange when locked", async () => {
    mockGetLockStatus.mockResolvedValue({
      locked: true,
      held_by: 99,
      held_by_username: "bob",
    });

    const onStateChange = vi.fn();
    renderEditor({ entryId: "E1", onStateChange });

    await screen.findByTestId("locked-banner");

    // Find the last call with isLockedByOther=true
    const lockedCalls = onStateChange.mock.calls.filter(
      (call) => (call[0] as ElnEditorState).isLockedByOther,
    );
    expect(lockedCalls.length).toBeGreaterThan(0);
    expect(lockedCalls[0][0].lockHeldBy).toBe("bob");
  });
});
