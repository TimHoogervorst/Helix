/**
 * Tests for ElnWorkspacePage — 3-column ELN entry page.
 *
 * Verifies the top toolbar (breadcrumbs, editor action buttons, ghost icon
 * buttons, avatars, share/sign & witness), content area, and metadata panel
 * with wired sections: Metadata, Linked Entities, Attachments, Activity.
 *
 * Editor action buttons (Save/Cancel/Edit/Delete) are rendered in the top
 * toolbar via state lifted from ElnEditor through onStateChange + ref.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useSearchParams } from "react-router-dom";
import React from "react";

// ── Mocks ──────────────────────────────────────────────────────────────────────

const { mockFetchActions } = vi.hoisted(() => ({
  mockFetchActions: vi.fn().mockResolvedValue([]),
}));

vi.mock("../api", () => ({
  fetchActions: mockFetchActions,
  acquireLock: vi.fn().mockResolvedValue({}),
  releaseLock: vi.fn().mockResolvedValue(undefined),
  attachTags: vi.fn(),
  detachTag: vi.fn(),
}));

/** ElnEditor mock that fires onStateChange so the top toolbar can render
 *  the correct action buttons. */
vi.mock("../editor/ElnEditor", () => ({
  default: React.forwardRef(
    (
      props: { entryId?: string; onStateChange?: (s: unknown) => void },
      ref: React.Ref<unknown>,
    ) => {
      // Detect ?new=true from the URL search params to mirror the real component.
      const [searchParams] = useSearchParams();
      const isNew =
        searchParams.get("new") === "true" || props.entryId === undefined;
      React.useEffect(() => {
        // Simulate the editor loading and entering its initial mode.
        // New entries start in edit mode; existing entries start in view mode
        // after a brief "loading" frame.
        const t = setTimeout(() => {
          props.onStateChange?.({
            mode: isNew ? "edit-new" : "view",
            isEdit: isNew,
            isSaving: false,
            isDirty: false,
            deleting: false,
            entry: null,
            folders: [
              { id: 1, name: "CRISPR-Cas9 Optimization" },
              { id: 2, name: "General" },
            ],
            folderId: null,
            status: "in_progress",
            tags: [],
            description: "",
          });
        }, 0);
        return () => clearTimeout(t);
        // eslint-disable-next-line react-hooks/exhaustive-deps
      }, []);

      // Expose stub actions via the ref
      React.useImperativeHandle(ref, () => ({
        save: vi.fn(),
        cancel: vi.fn(),
        deleteEntry: vi.fn(),
        enterEditMode: vi.fn(),
        setFolderId: vi.fn(),
        setStatus: vi.fn(),
      }));

      return (
        <div data-testid="eln-editor" data-entry-id={props.entryId ?? "new"}>
          ElnEditor mock (id: {props.entryId ?? "new"})
        </div>
      );
    },
  ),
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

describe("ElnWorkspacePage — 3-column layout", () => {
  beforeEach(() => {
    mockFetchActions.mockReset();
    mockFetchActions.mockResolvedValue([]);
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

  // ── Top toolbar: ghost icon buttons (History, Comments, Star) ───────────

  it("renders History, Comments, and Star icon buttons with tooltips", async () => {
    renderAtRoute("/eln/EXP-0284");

    const historyBtn = screen.getByLabelText("History");
    expect(historyBtn).toBeDefined();
    expect(historyBtn.getAttribute("title")).toContain("version history");

    const commentsBtn = screen.getByLabelText("Comments");
    expect(commentsBtn).toBeDefined();
    expect(commentsBtn.getAttribute("title")).toContain("comments");

    const starBtn = screen.getByLabelText("Star");
    expect(starBtn).toBeDefined();
    expect(starBtn.getAttribute("title")).toContain("bookmark");
  });

  it("renders ghost icon buttons with .btn-icon class", () => {
    renderAtRoute("/eln/EXP-0284");
    const historyBtn = screen.getByLabelText("History");
    expect(historyBtn.className).toContain("btn-icon");
  });

  // ── Top toolbar: editor action buttons ──────────────────────────────────

  it("renders Edit and Delete icon buttons for an existing entry in view mode", async () => {
    renderAtRoute("/eln/EXP-0284");

    // The mock fires onStateChange with view mode after a tick
    const editBtn = await screen.findByLabelText("Edit");
    expect(editBtn).toBeDefined();
    expect(editBtn.className).toContain("btn-icon");

    const deleteBtn = screen.getByLabelText("Delete");
    expect(deleteBtn).toBeDefined();
    expect(deleteBtn.className).toContain("btn-icon");
  });

  it("renders Save and Cancel icon buttons for a new entry in edit mode", async () => {
    renderAtRoute("/eln/E-NEW?new=true");

    const saveBtn = await screen.findByLabelText("Save");
    expect(saveBtn).toBeDefined();
    expect(saveBtn.className).toContain("btn-icon");

    const cancelBtn = screen.getByLabelText("Cancel");
    expect(cancelBtn).toBeDefined();
    expect(cancelBtn.className).toContain("btn-icon");
  });

  it("does not render editor action buttons while loading", () => {
    // We render without waiting for onStateChange to fire —
    // the initial state is "loading" so buttons should be absent.
    renderAtRoute("/eln/EXP-0284");
    // Save/Edit/Delete/Cancel should not exist yet
    expect(screen.queryByLabelText("Save")).toBeNull();
    expect(screen.queryByLabelText("Edit")).toBeNull();
    expect(screen.queryByLabelText("Delete")).toBeNull();
    expect(screen.queryByLabelText("Cancel")).toBeNull();
  });

  // ── Top toolbar: user avatars ──────────────────────────────────────────

  it("does not render avatar row when no recent editors exist", async () => {
    mockFetchActions.mockResolvedValueOnce([]);
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
    mockFetchActions.mockResolvedValueOnce([
      {
        id: 1,
        action_type: "edited",
        target_type: "eln.entry",
        target_id: 1,
        metadata: {},
        created_at: new Date().toISOString(),
        performed_by: mockUser,
      },
    ]);
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
      action_type: "edited" as const,
      target_type: "eln.entry",
      target_id: 1,
      metadata: {},
      created_at: now,
      performed_by: makeUser(userId),
    });
    mockFetchActions.mockResolvedValueOnce([
      makeAction(1),
      makeAction(2),
      makeAction(3),
      makeAction(4),
    ]);
    renderAtRoute("/eln/EXP-0284");
    const dots = await screen.findByText("…");
    expect(dots).toBeDefined();
  });

  // ── Top toolbar: Share & Sign & Witness ────────────────────────────────

  it("renders Share button as icon-only with green bg and tooltip", () => {
    renderAtRoute("/eln/EXP-0284");
    const shareBtn = screen.getByLabelText("Share");
    expect(shareBtn).toBeDefined();
    // Should be icon-only (no "Share" text)
    expect(shareBtn.textContent).toBe("");
    expect(shareBtn.getAttribute("title")).toContain("Copy link");
    // Should have the same green bg as Sign & Witness
    expect(shareBtn.className).toContain("bg-primary");
  });

  it("renders Sign & Witness button with text and tooltip", () => {
    renderAtRoute("/eln/EXP-0284");
    const signBtn = screen.getByLabelText("Sign & Witness");
    expect(signBtn).toBeDefined();
    expect(signBtn.textContent).toContain("Sign");
    expect(signBtn.getAttribute("title")).toContain("sign & witness");
  });

  // ── Content area ───────────────────────────────────────────────────────

  it("renders ElnEditor in the content area", () => {
    renderAtRoute("/eln/EXP-0284");
    const editor = screen.getByTestId("eln-editor");
    expect(editor).toBeDefined();
    expect(editor.getAttribute("data-entry-id")).toBe("EXP-0284");
  });

  it("passes entryId from route param for new entry with ?new=true", () => {
    renderAtRoute("/eln/E-NEW?new=true");
    const editor = screen.getByTestId("eln-editor");
    expect(editor.getAttribute("data-entry-id")).toBe("E-NEW");
  });

  // ═══════════════════════════════════════════════════════════════════════════════
  // ── Metadata panel ── (PRD #6)
  // ═══════════════════════════════════════════════════════════════════════════════

  describe("Metadata Panel — Section 1: Metadata", () => {
    it("renders the Metadata section header", () => {
      renderAtRoute("/eln/EXP-0284");
      expect(screen.getAllByText("Metadata").length).toBeGreaterThan(0);
    });

    it("renders metadata keys: Author, Last editor, Project, Started, Status, Folder", () => {
      renderAtRoute("/eln/EXP-0284");

      expect(screen.getByText("Author")).toBeDefined();
      expect(screen.getByText("Last editor")).toBeDefined();
      expect(screen.getByText("Project")).toBeDefined();
      expect(screen.getByText("Started")).toBeDefined();
      expect(screen.getByText("Status")).toBeDefined();
      expect(screen.getByText("Folder")).toBeDefined();
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
      expect(dashes.length).toBeGreaterThanOrEqual(4); // breadcrumb + Author + Last editor + Project + Started + Folder
    });

    it("renders Status chip as 'In progress' with warn styling in view mode", () => {
      renderAtRoute("/eln/EXP-0284");
      const statusChip = screen.getByTestId("status-chip");
      expect(statusChip.textContent).toBe("In progress");
      expect(statusChip.className).toContain("bg-warn");
      expect(statusChip.className).toContain("text-warn-foreground");
    });

    it("renders Status as dropdown in edit mode for new entries", async () => {
      renderAtRoute("/eln/E-NEW?new=true");
      const statusSelect = await screen.findByTestId("status-select");
      expect(statusSelect).toBeDefined();
      expect((statusSelect as HTMLSelectElement).value).toBe("in_progress");
    });

    it("renders Folder as dropdown in edit mode for new entries", async () => {
      renderAtRoute("/eln/E-NEW?new=true");
      const folderSelect = await screen.findByTestId("folder-select");
      expect(folderSelect).toBeDefined();
    });

    it("renders Folder name in view mode", () => {
      renderAtRoute("/eln/EXP-0284");
      // Folder is in view mode and shows "—" (no entry data)
      const dashes = screen.getAllByText("—");
      // At least one dash is from the Folder row
      expect(dashes.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe("Metadata Panel — Section 2: Linked Entities", () => {
    it("renders the Linked entities section header", () => {
      renderAtRoute("/eln/EXP-0284");
      expect(screen.getByText("Linked entities")).toBeDefined();
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
      expect(filename.className).toContain("font-mono");
    });
  });

  describe("Metadata Panel — Section 4: Activity", () => {
    it("renders the Activity section header", () => {
      renderAtRoute("/eln/EXP-0284");
      expect(screen.getByText("Activity")).toBeDefined();
    });

    it("shows empty state when there are no actions", async () => {
      mockFetchActions.mockResolvedValueOnce([]);
      renderAtRoute("/eln/EXP-0284");
      const empty = await screen.findByTestId("activity-empty");
      expect(empty.textContent).toBe("No activity yet");
    });

    it("renders activity items from fetched actions", async () => {
      const now = new Date().toISOString();
      mockFetchActions.mockResolvedValueOnce([
        {
          id: 1,
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
      ]);
      renderAtRoute("/eln/EXP-0284");

      const items = await screen.findAllByTestId("activity-item");
      expect(items.length).toBe(2);

      // First item should be the most recent (created action)
      expect(screen.getByText("Mira Keller")).toBeDefined();
      expect(screen.getByText("Created this entry")).toBeDefined();

      // Second item
      expect(screen.getByText("Jordan")).toBeDefined();
      expect(screen.getByText("Edited this entry")).toBeDefined();
    });

    it("shows Show all toggle when there are more than 10 items", async () => {
      const now = new Date().toISOString();
      const actions = Array.from({ length: 12 }, (_, i) => ({
        id: i + 1,
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
      mockFetchActions.mockResolvedValueOnce(actions);
      renderAtRoute("/eln/EXP-0284");

      const toggle = await screen.findByTestId("activity-show-all");
      expect(toggle.textContent).toBe("Show all (12)");
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
});
