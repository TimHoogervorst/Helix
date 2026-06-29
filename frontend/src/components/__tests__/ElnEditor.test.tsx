/**
 * Integration tests for ElnEditor — verifies the composed modules work together.
 *
 * Mocks the API client, router, ReferenceProvider, TipTap useEditor/EditorContent,
 * and EditorBubbleMenu so tests focus on the component's orchestration:
 * mode transitions, UI rendering, and wiring between modules.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

import ElnEditor from "../ElnEditor";

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

/** Mock EditorBubbleMenu to avoid the real BubbleMenu's TipTap plugin dependency. */
vi.mock("../EditorBubbleMenu", () => ({
  default: () => <div data-testid="bubble-menu">BubbleMenu mock</div>,
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
    embedded?: boolean;
    initialFolderId?: number | null;
  } = {},
) {
  return render(
    <MemoryRouter>
      <ElnEditor {...props} />
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

  it("shows Edit and Delete buttons in view mode after fetch", async () => {
    renderEditor({ entryId: "E1" });
    await waitFor(() => {
      expect(screen.getByText("Edit")).toBeDefined();
      expect(screen.getByText("Delete")).toBeDefined();
    });
  });

  it("displays entry title in view mode", async () => {
    mockGet.mockResolvedValue(
      makeEntry({ title: "My ELN Entry", display_id: "E42" }),
    );
    renderEditor({ entryId: "E42" });
    await waitFor(() => {
      const heading = screen.getByRole("heading", { name: "My ELN Entry" });
      expect(heading).toBeDefined();
    });
  });

  it("displays author and timestamps in view mode", async () => {
    mockGet.mockResolvedValue(
      makeEntry({
        author_username: "alice",
        created_at: "2025-01-15T10:30:00Z",
        updated_at: "2025-06-20T14:00:00Z",
      }),
    );
    renderEditor({ entryId: "E1" });
    await waitFor(() => {
      expect(screen.getByText(/alice/)).toBeDefined();
      expect(screen.getByText(/Last updated/)).toBeDefined();
    });
  });

  // ── Edit mode transitions ─────────────────────────────────────────────────

  it("transitions to edit mode when Edit button is clicked", async () => {
    renderEditor({ entryId: "E1" });
    await waitFor(() => {
      expect(screen.getByText("Edit")).toBeDefined();
    });

    fireEvent.click(screen.getByText("Edit"));

    await waitFor(() => {
      expect(screen.getByText("Save")).toBeDefined();
      expect(screen.getByText("Cancel")).toBeDefined();
    });
  });

  it("shows title input in edit mode", async () => {
    mockGet.mockResolvedValue(makeEntry({ title: "Original Title" }));
    renderEditor({ entryId: "E1" });

    await waitFor(() => {
      expect(screen.getByText("Edit")).toBeDefined();
    });
    fireEvent.click(screen.getByText("Edit"));

    await waitFor(() => {
      const input = screen.getByDisplayValue("Original Title");
      expect(input).toBeDefined();
      expect(input.tagName).toBe("INPUT");
    });
  });

  it("shows save indicator in edit mode", async () => {
    renderEditor({ entryId: "E1" });
    await waitFor(() => {
      expect(screen.getByText("Edit")).toBeDefined();
    });
    fireEvent.click(screen.getByText("Edit"));
    await waitFor(() => {
      expect(screen.getByText("Saved")).toBeDefined();
    });
  });

  // ── New entry mode ─────────────────────────────────────────────────────────

  it("starts in edit mode when isNew (no entryId)", () => {
    renderEditor({});
    expect(screen.getByText("Save")).toBeDefined();
    expect(screen.getByText("Cancel")).toBeDefined();
  });

  it("shows 'New entry' metadata for new entries", () => {
    renderEditor({});
    expect(screen.getByText("New entry")).toBeDefined();
  });

  // ── Cancel returns to view mode ────────────────────────────────────────────

  it("returns to view mode on Cancel", async () => {
    renderEditor({ entryId: "E1" });
    await waitFor(() => {
      expect(screen.getByText("Edit")).toBeDefined();
    });

    fireEvent.click(screen.getByText("Edit"));
    await waitFor(() => {
      expect(screen.getByText("Cancel")).toBeDefined();
    });

    fireEvent.click(screen.getByText("Cancel"));
    await waitFor(() => {
      expect(screen.getByText("Edit")).toBeDefined();
      expect(screen.getByText("Delete")).toBeDefined();
    });
  });

  // ── Embedded mode ──────────────────────────────────────────────────────────

  it("renders Edit button in embedded view mode", async () => {
    renderEditor({ entryId: "E1", embedded: true });
    await waitFor(() => {
      expect(screen.getByText("Edit")).toBeDefined();
    });
  });

  // ── Editor content & BubbleMenu ────────────────────────────────────────────

  it("renders editor content", () => {
    renderEditor({});
    expect(screen.getByTestId("editor-content")).toBeDefined();
  });

  it("renders EditorBubbleMenu when editing", async () => {
    renderEditor({ entryId: "E1" });
    await waitFor(() => {
      expect(screen.getByText("Edit")).toBeDefined();
    });

    fireEvent.click(screen.getByText("Edit"));

    await waitFor(() => {
      expect(screen.getByTestId("bubble-menu")).toBeDefined();
    });
  });
});
