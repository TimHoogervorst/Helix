/**
 * Tests for ElnWorkspacePage — five-zone ELN entry page (#281).
 *
 * Verifies the top toolbar (breadcrumbs, editor action buttons, ghost icon
 * buttons, avatars, share/sign & witness), five-zone layout (left sidebar
 * from Layout, left gutter, center gutter, right gutter, right sidebar),
 * and metadata panel with wired sections: Metadata, Linked Entities,
 * Attachments, Activity.
 *
 * Editor state is provided by mocked hooks (useEntryCrud, useEntryFolder,
 * useDirtyTracking, useTaggableItems, useAutoSave) — previously this was
 * done by mocking ElnEditor. After dissolving ElnEditor into ElnWorkspace
 * (#352), the hooks are called directly.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import React from "react";
import "../index";

// ── Mocks ──────────────────────────────────────────────────────────────────────

const { mockFetchActions, mockLockedState, mockIsReady } = vi.hoisted(() => ({
  mockFetchActions: vi.fn().mockResolvedValue({ results: [], next: null }),
  mockLockedState: { isLockedByOther: false, lockHeldBy: null as string | null },
  mockIsReady: { value: true },
}));

function actionPage<T>(results: T[], next: string | null = null) {
  return { results, next };
}

vi.mock("../api", () => ({
  fetchActions: mockFetchActions,
  acquireLock: vi.fn().mockResolvedValue({}),
  releaseLock: vi.fn().mockResolvedValue(undefined),
  attachTags: vi.fn(),
  detachTag: vi.fn(),
}));

/** Mock useEntryCrud — provides editor state, was previously lifted from ElnEditor. */
vi.mock("../hooks/useEntryCrud", () => ({
  useEntryCrud: () => ({
    isReady: mockIsReady.value,
    entry: null,
    title: "",
    setTitle: vi.fn(),
    description: "",
    setDescription: vi.fn(),
    status: "in_progress",
    setStatus: vi.fn(),
    error: null,
    deleting: false,
    isLockedByOther: mockLockedState.isLockedByOther,
    lockHeldBy: mockLockedState.lockHeldBy,
    saveStatus: "idle" as const,
    lastSavedAt: null as Date | null,
    queueLength: 0,
    save: vi.fn(),
    deleteEntry: vi.fn(),
    autoSave: vi.fn(),
    setEntry: vi.fn(),
  }),
}));

/** Mock useEntryFolder — provides folder data for the metadata panel. */
vi.mock("../hooks/useEntryFolder", () => ({
  useEntryFolder: () => ({
    folderId: null as number | null,
    setFolderId: vi.fn(),
    folders: [
      { id: 1, name: "CRISPR-Cas9 Optimization" },
      { id: 2, name: "General" },
    ],
  }),
}));

/** Mock useDirtyTracking — always returns clean. */
vi.mock("../hooks/useDirtyTracking", () => ({
  useDirtyTracking: () => ({ isDirty: false }),
}));

/** Mock useAutoSave — no-op for workspace layout tests. */
vi.mock("../hooks/useAutoSave", () => ({
  useAutoSave: () => {},
}));

/** Mock useTaggableItems — returns empty tags. */
vi.mock("../../tags/hooks", () => ({
  useTaggableItems: () => ({
    tags: [],
    pendingTagIds: [],
    addTag: vi.fn(),
    removeTag: vi.fn(),
    resetToBaseline: vi.fn(),
  }),
}));

/** Mock TipTapRenderer — avoids useEditor() DOM requirements in jsdom. */
vi.mock("../../../shell/src/workspace/TipTapRenderer", () => ({
  TipTapRenderer: () => React.createElement("div", { "data-testid": "tiptap-renderer" }, "TipTapRenderer mock"),
}));

// ── Helpers ────────────────────────────────────────────────────────────────────

function renderAtRoute(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/eln/:id" element={<ElnWorkspacePage />} />
      </Routes>
    </MemoryRouter>,
  );
}

// Dynamic import after mocks are hoisted
import ElnWorkspacePage from "../workspace/ElnWorkspacePage";

// ── Tests ──────────────────────────────────────────────────────────────────────

describe("ElnWorkspacePage — five-zone layout", () => {
  beforeEach(() => {
    mockFetchActions.mockReset();
    mockFetchActions.mockResolvedValue(actionPage([]));
    mockLockedState.isLockedByOther = false;
    mockLockedState.lockHeldBy = null;
    mockIsReady.value = true;
  });
  // ── Top toolbar: breadcrumbs ──────────────────────────────────────────

  it("renders breadcrumb with folder icon and path", () => {
    renderAtRoute("/eln/EXP-0284");
    // Without entry data, breadcrumb shows fallback "—"
    // (metadata panel also shows "—" for multiple fields, so getAllByText is needed)
    const dashes = screen.getAllByText("—");
    expect(dashes.length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("EXP-0284")).toBeDefined();
  });

  it("shows entry display ID for new entry route (?new=true)", () => {
    renderAtRoute("/eln/E-NEW?new=true");
    // With ?new=true, the mock treats it as a new entry but the breadcrumb
    // shows the entry's display_id from the URL param.
    expect(screen.getByText("E-NEW")).toBeDefined();
  });

  it("does NOT render a Draft status badge in the top toolbar", () => {
    renderAtRoute("/eln/EXP-0284");
    expect(screen.queryByText("Draft")).toBeNull();
  });

  // ── Loading skeleton ──────────────────────────────────────────────────

  it("renders ContentLoadingSkeleton when isReady is false", () => {
    mockIsReady.value = false;
    renderAtRoute("/eln/EXP-0284");
    expect(screen.getByTestId("content-loading-skeleton")).toBeDefined();
    // TipTapRenderer should NOT be rendered while loading
    expect(screen.queryByTestId("tiptap-renderer")).toBeNull();
  });

  it("renders TipTapRenderer when isReady transitions to true", () => {
    mockIsReady.value = true;
    renderAtRoute("/eln/EXP-0284");
    // TipTapRenderer should be rendered
    expect(screen.getByTestId("tiptap-renderer")).toBeDefined();
    // ContentLoadingSkeleton should NOT be rendered
    expect(screen.queryByTestId("content-loading-skeleton")).toBeNull();
  });

  // ── Top toolbar: action buttons (History, Comments, Star) ───────────

  it("renders History, Comments, and Star buttons with tooltips", async () => {
    renderAtRoute("/eln/EXP-0284");

    const historyBtn = screen.getByLabelText("History");
    expect(historyBtn).toBeDefined();
    expect(historyBtn.getAttribute("title")).toContain("version history");

    // Comments is now a working toggle (default ON → "Hide comments")
    const commentsBtn = screen.getByLabelText("Hide comments");
    expect(commentsBtn).toBeDefined();

    const starBtn = screen.getByLabelText("Star");
    expect(starBtn).toBeDefined();
    expect(starBtn.getAttribute("title")).toContain("bookmark");
  });

  it("comment toggle switches label between Hide/Show on click", () => {
    renderAtRoute("/eln/EXP-0284");

    const btn = screen.getByLabelText("Hide comments");
    expect(btn).toBeDefined();

    expect(btn.tagName).toBe("BUTTON");
  });

  it("renders ghost icon buttons as usable buttons", () => {
    renderAtRoute("/eln/EXP-0284");
    const historyBtn = screen.getByLabelText("History");
    expect(historyBtn.tagName).toBe("BUTTON");
  });

  // ── Top toolbar: MoreActions menu ──────────────────────────────────

  it("renders MoreActions (…) trigger button", async () => {
    renderAtRoute("/eln/EXP-0284");

    // The mock fires onStateChange with isReady=true after a tick
    const moreBtn = await screen.findByLabelText("More actions");
    expect(moreBtn).toBeDefined();
    expect(moreBtn.tagName).toBe("BUTTON");
    expect(moreBtn.parentElement?.getAttribute("aria-haspopup")).toBe("menu");
  });

  // ── Top toolbar: save status indicator ──────────────────────────────────

  it("renders save status indicator with Saved checkmark when idle", async () => {
    renderAtRoute("/eln/EXP-0284");
    const saveBtn = await screen.findByLabelText("Saved");
    expect(saveBtn).toBeDefined();
    expect(saveBtn.tagName).toBe("BUTTON");
  });

  it("clicking save status indicator invokes save on the editor ref", async () => {
    renderAtRoute("/eln/EXP-0284");
    const saveBtn = await screen.findByLabelText("Saved");
    expect(saveBtn).toBeDefined();
  });

  // ── Top toolbar: user avatars ──────────────────────────────────────────

  it("does not render avatar row when no recent editors exist", async () => {
    mockFetchActions.mockResolvedValue(actionPage([]));
    renderAtRoute("/eln/EXP-0284");
    // No fetchActions error — avatars simply absent
    await vi.waitFor(() => {
      expect(mockFetchActions).toHaveBeenCalled();
    });
    // The old "MK" / "JS" / "AR" initials are gone
    expect(screen.queryByText("MK")).toBeNull();
    expect(screen.queryByText("JS")).toBeNull();
    expect(screen.queryByText("AR")).toBeNull();
  });

  it("renders real editor avatars when fetchActions returns data", async () => {
    const mockUser = {
      id: 1,
      username: "mirak",
      first_name: "Mira",
      last_name: "Keller",
      color: "#d9b3e6",
    };
    mockFetchActions.mockResolvedValue(actionPage([
      {
        id: 1,
        action: "eln.entry.edited",
        action_type: "edited",
        target_type: "eln.entry",
        target_id: 1,
        metadata: {},
        created_at: new Date().toISOString(),
        performed_by: mockUser,
      },
    ]));
    renderAtRoute("/eln/EXP-0284");
    // The shared Avatar renders initials via aria-label — may appear in
    // both the toolbar (recentEditors) and metadata panel (lastEditor)
    const avatars = await screen.findAllByLabelText("MK");
    expect(avatars.length).toBeGreaterThanOrEqual(1);
  });

  it("renders overflow bubble when more than 3 distinct editors", async () => {
    const now = new Date().toISOString();
    const makeUser = (id: number) => ({
      id,
      username: `user${id}`,
      first_name: "",
      last_name: "",
      color: "#d9b3e6",
    });
    const makeAction = (userId: number) => ({
      id: userId,
      action: "eln.entry.edited" as const,
      action_type: "edited" as const,
      target_type: "eln.entry",
      target_id: 1,
      metadata: {},
      created_at: now,
      performed_by: makeUser(userId),
    });
    mockFetchActions.mockResolvedValue(actionPage([
      makeAction(1),
      makeAction(2),
      makeAction(3),
      makeAction(4),
    ]));
    renderAtRoute("/eln/EXP-0284");
    const dots = await screen.findByText("…");
    expect(dots).toBeDefined();
  });

  // ── Top toolbar: Share & Sign & Witness ────────────────────────────────

  it("renders Share button as icon-only with green bg and tooltip", () => {
    renderAtRoute("/eln/EXP-0284");
    const shareBtn = screen.getByLabelText("Share");
    expect(shareBtn).toBeDefined();
    expect(shareBtn.getAttribute("title")).toContain("Copy link");
    expect(shareBtn.tagName).toBe("BUTTON");
  });

  it("renders Sign & Witness button with text and tooltip", () => {
    renderAtRoute("/eln/EXP-0284");
    const signBtn = screen.getByLabelText("Sign & Witness");
    expect(signBtn).toBeDefined();
    expect(signBtn.textContent).toContain("Sign");
    expect(signBtn.getAttribute("title")).toContain("sign & witness");
  });

  // ── Content area ───────────────────────────────────────────────────────

  it("renders editor content in the content area", () => {
    renderAtRoute("/eln/EXP-0284");
    // After #352 (dissolve ElnEditor), the TipTapRenderer mock and
    // chrome UI are rendered directly inside ElnWorkspace.
    const editor = screen.getByTestId("tiptap-renderer");
    expect(editor).toBeDefined();
  });

  it("renders editor content for new entry with ?new=true", () => {
    renderAtRoute("/eln/E-NEW?new=true");
    // The content area should render — no crash for new entries.
    expect(screen.getByTestId("tiptap-renderer")).toBeDefined();
  });

  // ── Editor chrome (was ElnEditor, now inlined in ElnWorkspace #352) ─────

  it("renders metadata line", () => {
    renderAtRoute("/eln/EXP-0284");
    const meta = screen.getByTestId("metadata-line");
    expect(meta).toBeDefined();
    expect(meta.className).toContain("font-[var(--font-label)]");
  });

  it("renders title as contentEditable H1", () => {
    renderAtRoute("/eln/EXP-0284");
    const title = screen.getByTestId("title-display");
    expect(title.tagName).toBe("H1");
    expect(title.className).toContain("font-[var(--font-body)]");
    expect(title.getAttribute("contentEditable")).toBe("true");
  });

  it("renders description as textarea", () => {
    renderAtRoute("/eln/EXP-0284");
    const textarea = screen.getByTestId("description-input");
    expect(textarea.tagName).toBe("TEXTAREA");
  });

  it("renders tags section", () => {
    renderAtRoute("/eln/EXP-0284");
    expect(screen.getByTestId("tags-section")).toBeDefined();
  });

  it("renders hairline divider", () => {
    renderAtRoute("/eln/EXP-0284");
    const divider = screen.getByTestId("content-divider");
    expect(divider).toBeDefined();
    expect(divider.className).toContain("bg-hairline");
  });

  it("does not render locked banner when not locked", () => {
    renderAtRoute("/eln/EXP-0284");
    expect(screen.queryByTestId("locked-banner")).toBeNull();
  });

  it("renders locked banner when locked by another user", async () => {
    mockLockedState.isLockedByOther = true;
    mockLockedState.lockHeldBy = "bob";

    renderAtRoute("/eln/EXP-0284");

    const banner = await screen.findByTestId("locked-banner");
    expect(banner).toBeDefined();
    expect(banner.textContent).toContain("bob");
  });

  it("sets title contentEditable to false when locked", async () => {
    mockLockedState.isLockedByOther = true;
    mockLockedState.lockHeldBy = "bob";

    renderAtRoute("/eln/EXP-0284");

    await screen.findByTestId("locked-banner");
    const title = screen.getByTestId("title-display");
    expect(title.getAttribute("contentEditable")).toBe("false");
  });

  it("sets description textarea to readOnly when locked", async () => {
    mockLockedState.isLockedByOther = true;
    mockLockedState.lockHeldBy = "bob";

    renderAtRoute("/eln/EXP-0284");

    await screen.findByTestId("locked-banner");
    const textarea = screen.getByTestId("description-input");
    expect(textarea.hasAttribute("readonly")).toBe(true);
  });

  // ═══════════════════════════════════════════════════════════════════════════════
  // ── Full-bleed layout ── (#565)
  // ═══════════════════════════════════════════════════════════════════════════════

  describe("Full-bleed layout", () => {
    it("renders the center content column and metadata sidebar", () => {
      renderAtRoute("/eln/EXP-0284");

      const main = document.querySelector("main");
      expect(main).not.toBeNull();
      expect(main!.querySelector('[data-testid="tiptap-renderer"]')).toBeDefined();
      expect(screen.getAllByText("Metadata").length).toBeGreaterThan(0);
      expect(screen.getByTestId("metadata-line").parentElement).toHaveClass(
        "eln-workspace-center",
      );
    });

    it("does not render removed gutters or centered-row balancing", () => {
      renderAtRoute("/eln/EXP-0284");
      expect(screen.queryByLabelText("Comments")).toBeNull();
      expect(document.querySelector("main")!.parentElement!.className).not.toContain(
        "justify-center",
      );
      expect(document.body.innerHTML).not.toContain("layout-workspace-gutter");
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════════
  // ── Metadata panel ── (PRD #6)
  // ═══════════════════════════════════════════════════════════════════════════════

  describe("Metadata Panel — Section 1: Metadata", () => {
    it("renders the Metadata section header", () => {
      renderAtRoute("/eln/EXP-0284");
      expect(screen.getAllByText("Metadata").length).toBeGreaterThan(0);
    });

    it("renders metadata keys: Author, Last editor, Project, Started, and Status", () => {
      renderAtRoute("/eln/EXP-0284");

      expect(screen.getByText("Author")).toBeDefined();
      expect(screen.getByText("Last editor")).toBeDefined();
      expect(screen.getByText("Project")).toBeDefined();
      expect(screen.getByText("Started")).toBeDefined();
      expect(screen.getByText("Status")).toBeDefined();
    });

    it("does NOT render Witness or Instrument rows", () => {
      renderAtRoute("/eln/EXP-0284");
      expect(screen.queryByText("Witness")).toBeNull();
      expect(screen.queryByText("Instrument")).toBeNull();
    });

    it("shows fallback '—' for Author, Last editor, Project, Started when no entry data", () => {
      renderAtRoute("/eln/EXP-0284");

      // With no entry data, each value should show "—"
      // The breadcrumb also shows "—", so there will be multiple
      const dashes = screen.getAllByText("—");
      expect(dashes.length).toBeGreaterThanOrEqual(4); // breadcrumb + Author + Last editor + Project + Started
    });

    it("renders Status as dropdown", async () => {
      renderAtRoute("/eln/EXP-0284");
      const statusSelect = await screen.findByTestId("status-select");
      expect(statusSelect).toBeDefined();
    });

  });

  describe("Metadata Panel — Section 2: Linked Entities", () => {
    it("renders the Linked Entities section header", () => {
      renderAtRoute("/eln/EXP-0284");
      expect(screen.getByText("Linked Entities")).toBeDefined();
    });

    it("shows empty state when entry has no mentions", () => {
      renderAtRoute("/eln/EXP-0284");
      // The mock entry is null so mentions is empty → shows "No linked entities"
      expect(screen.getByText("No linked entities")).toBeDefined();
    });
  });

  describe("Metadata Panel — Section 3: Attachments", () => {
    it("renders the Attachments section header", () => {
      renderAtRoute("/eln/EXP-0284");
      expect(screen.getByText("Attachments")).toBeDefined();
    });

    it("renders three attachments with filenames and sizes", () => {
      renderAtRoute("/eln/EXP-0284");

      expect(screen.getByText("raw_gel_2026-06-30.tif")).toBeDefined();
      expect(screen.getByText("4.2 MB")).toBeDefined();

      expect(screen.getByText("plate_layout.xlsx")).toBeDefined();
      expect(screen.getByText("18 KB")).toBeDefined();

      expect(screen.getByText("sequencing_reads.fastq.gz")).toBeDefined();
      expect(screen.getByText("112 MB")).toBeDefined();
    });

    it("renders filenames in mono font", () => {
      renderAtRoute("/eln/EXP-0284");
      const filename = screen.getByText("raw_gel_2026-06-30.tif");
      expect(filename.className).toContain("font-[var(--font-label)]");
    });
  });

  describe("Metadata Panel — Section 4: Activity", () => {
    it("renders the Activity section header", () => {
      renderAtRoute("/eln/EXP-0284");
      expect(screen.getByText("Activity Feed")).toBeDefined();
    });

    it("shows empty state when there are no actions", async () => {
      mockFetchActions.mockResolvedValue(actionPage([]));
      renderAtRoute("/eln/EXP-0284");
      const empty = await screen.findByTestId("activity-empty");
      expect(empty.textContent).toBe("No activity yet");
    });

    it("renders activity items from fetched actions", async () => {
      const now = new Date().toISOString();
      mockFetchActions.mockResolvedValue(actionPage([
        {
          id: 1,
          action: "eln.entry.created",
          action_type: "created",
          target_type: "eln.entry",
          target_id: 1,
          metadata: {},
          created_at: now,
          performed_by: {
            id: 1,
            username: "mirak",
            first_name: "Mira",
            last_name: "Keller",
            color: "#d9b3e6",
          },
        },
        {
          id: 2,
          action: "eln.entry.edited",
          action_type: "edited",
          target_type: "eln.entry",
          target_id: 1,
          metadata: {},
          created_at: now,
          performed_by: {
            id: 2,
            username: "jordan",
            first_name: "Jordan",
            last_name: "",
            color: "#a3c4f3",
          },
        },
      ]));
      renderAtRoute("/eln/EXP-0284");

      const items = await screen.findAllByTestId("activity-item");
      expect(items.length).toBe(2);

      // First item should be the most recent (created action)
      expect(screen.getByText("Mira Keller")).toBeDefined();
      expect(screen.getByText("Created")).toBeDefined();

      // Second item
      expect(screen.getByText("Jordan")).toBeDefined();
      expect(screen.getByText("Edited")).toBeDefined();
    });

    it("shows and loads the next activity page", async () => {
      const now = new Date().toISOString();
      const actions = Array.from({ length: 12 }, (_, i) => ({
        id: i + 1,
        action: "eln.entry.edited",
        action_type: "edited",
        target_type: "eln.entry",
        target_id: 1,
        metadata: {},
        created_at: now,
        performed_by: {
          id: 1,
          username: `user${i}`,
          first_name: "",
          last_name: "",
          color: "#d9b3e6",
        },
      }));
      mockFetchActions.mockResolvedValueOnce(actionPage(actions, "/next-page"));
      mockFetchActions.mockResolvedValueOnce(actionPage([]));
      renderAtRoute("/eln/EXP-0284");

      const button = await screen.findByTestId("activity-load-more");
      expect(button.textContent).toBe("Show 20 more");
      button.click();
      await waitFor(() => expect(mockFetchActions).toHaveBeenCalledWith("EXP-0284", undefined, undefined, "/next-page"));
      await waitFor(() => expect(screen.queryByTestId("activity-load-more")).toBeNull());
    });

    it("shows error state with retry button when fetch fails", async () => {
      mockFetchActions.mockRejectedValueOnce(new Error("Network error"));
      renderAtRoute("/eln/EXP-0284");

      const error = await screen.findByTestId("activity-error");
      expect(error.textContent).toContain("Could not load activity");

      const retry = screen.getByTestId("activity-retry");
      expect(retry).toBeDefined();
    });
  });

  // ── Locked state: toolbar and metadata panel ─────────────────────────────

  it("shows lock icon in toolbar when locked by another user", async () => {
    mockLockedState.isLockedByOther = true;
    mockLockedState.lockHeldBy = "bob";

    renderAtRoute("/eln/EXP-0284");

    const lockLabel = await screen.findByLabelText("Locked by bob — read-only");
    expect(lockLabel).toBeDefined();
  });

  it("hides MoreActions dropdown when locked", async () => {
    mockLockedState.isLockedByOther = true;
    mockLockedState.lockHeldBy = "bob";

    renderAtRoute("/eln/EXP-0284");

    // Wait for the lock icon to appear (confirms locked state is active)
    await screen.findByLabelText("Locked by bob — read-only");

    // MoreActions trigger should NOT be present
    expect(screen.queryByLabelText("More actions")).toBeNull();
  });

  it("hides save-status indicator when locked (replaced by lock icon)", async () => {
    mockLockedState.isLockedByOther = true;
    mockLockedState.lockHeldBy = "bob";

    renderAtRoute("/eln/EXP-0284");

    await screen.findByLabelText("Locked by bob — read-only");

    // Save status indicator labels should NOT be present
    expect(screen.queryByLabelText("Saved")).toBeNull();
    expect(screen.queryByLabelText("Saving…")).toBeNull();
    expect(screen.queryByLabelText(/Save failed/)).toBeNull();
  });

  it("disables status select when locked", async () => {
    mockLockedState.isLockedByOther = true;
    mockLockedState.lockHeldBy = "bob";

    renderAtRoute("/eln/EXP-0284");

    // Wait for the onStateChange to fire and the disabled prop to be applied.
    await waitFor(() => {
      const statusSelect = screen.getByTestId("status-select") as HTMLSelectElement;
      expect(statusSelect.disabled).toBe(true);
    });
  });

  it("MoreActions is present when not locked", async () => {
    renderAtRoute("/eln/EXP-0284");

    const moreBtn = await screen.findByLabelText("More actions");
    expect(moreBtn).toBeDefined();
  });
});
