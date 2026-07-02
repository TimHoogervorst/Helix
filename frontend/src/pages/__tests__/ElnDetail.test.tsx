/**
 * Tests for ElnDetail — 3-column ELN entry page.
 *
 * Verifies the top toolbar (breadcrumbs, editor action buttons, ghost icon
 * buttons, avatars, share/sign & witness), content area, and metadata panel
 * with wired sections: Metadata, Linked Entities, Attachments, Activity.
 *
 * Editor action buttons (Save/Cancel/Edit/Delete) are rendered in the top
 * toolbar via state lifted from ElnEditor through onStateChange + ref.
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import React from "react";

// ── Mocks ──────────────────────────────────────────────────────────────────────

/** ElnEditor mock that fires onStateChange so the top toolbar can render
 *  the correct action buttons. */
vi.mock("../../components/ElnEditor", () => ({
  default: React.forwardRef(
    (
      props: { entryId?: string; onStateChange?: (s: unknown) => void },
      ref: React.Ref<unknown>,
    ) => {
      const isNew = props.entryId === undefined;
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
        <Route path="/eln/:id" element={<ElnDetail />} />
        <Route path="/eln/new" element={<ElnDetail />} />
      </Routes>
    </MemoryRouter>,
  );
}

// Dynamic import after mocks are hoisted
import ElnDetail from "../ElnDetail";

// ── Tests ──────────────────────────────────────────────────────────────────────

describe("ElnDetail — 3-column layout", () => {
  // ── Top toolbar: breadcrumbs ──────────────────────────────────────────

  it("renders breadcrumb with folder icon and path", () => {
    renderAtRoute("/eln/EXP-0284");
    // Without entry data, breadcrumb shows fallback "—"
    // (metadata panel also shows "—" for multiple fields, so getAllByText is needed)
    const dashes = screen.getAllByText("—");
    expect(dashes.length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("EXP-0284")).toBeDefined();
  });

  it("shows 'New' as display ID for new entry route", () => {
    renderAtRoute("/eln/new");
    expect(screen.getByText("New")).toBeDefined();
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
    renderAtRoute("/eln/new");

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

  it("renders three user avatar circles with initials", () => {
    renderAtRoute("/eln/EXP-0284");
    expect(screen.getByText("MK")).toBeDefined();
    expect(screen.getByText("JS")).toBeDefined();
    expect(screen.getByText("AR")).toBeDefined();
  });

  // ── Top toolbar: Share & Sign & Witness ────────────────────────────────

  it("renders Share button with text and tooltip", () => {
    renderAtRoute("/eln/EXP-0284");
    const shareBtn = screen.getByLabelText("Share");
    expect(shareBtn).toBeDefined();
    expect(shareBtn.textContent).toContain("Share");
    expect(shareBtn.getAttribute("title")).toContain("sharing");
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

  it("passes undefined entryId for new entry route", () => {
    renderAtRoute("/eln/new");
    const editor = screen.getByTestId("eln-editor");
    expect(editor.getAttribute("data-entry-id")).toBe("new");
  });

  // ═══════════════════════════════════════════════════════════════════════════════
  // ── Metadata panel ── (PRD #6)
  // ═══════════════════════════════════════════════════════════════════════════════

  describe("Metadata Panel — Section 1: Metadata", () => {
    it("renders the Metadata section header", () => {
      renderAtRoute("/eln/EXP-0284");
      expect(screen.getAllByText("Metadata").length).toBeGreaterThan(0);
    });

    it("renders metadata keys: Owner, Project, Started, Status, Folder", () => {
      renderAtRoute("/eln/EXP-0284");

      expect(screen.getByText("Owner")).toBeDefined();
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

    it("shows fallback '—' for Owner, Project, Started when no entry data", () => {
      renderAtRoute("/eln/EXP-0284");

      // With no entry data, each value should show "—"
      // The breadcrumb also shows "—", so there will be multiple
      const dashes = screen.getAllByText("—");
      expect(dashes.length).toBeGreaterThanOrEqual(3); // breadcrumb + Owner + Project + Started + Folder
    });

    it("renders Status chip as 'In progress' with warn styling in view mode", () => {
      renderAtRoute("/eln/EXP-0284");
      const statusChip = screen.getByTestId("status-chip");
      expect(statusChip.textContent).toBe("In progress");
      expect(statusChip.className).toContain("bg-warn");
      expect(statusChip.className).toContain("text-warn-foreground");
    });

    it("renders Status as dropdown in edit mode for new entries", async () => {
      renderAtRoute("/eln/new");
      const statusSelect = await screen.findByTestId("status-select");
      expect(statusSelect).toBeDefined();
      expect((statusSelect as HTMLSelectElement).value).toBe("in_progress");
    });

    it("renders Folder as dropdown in edit mode for new entries", async () => {
      renderAtRoute("/eln/new");
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

    it("renders four linked entity buttons", () => {
      renderAtRoute("/eln/EXP-0284");
      expect(screen.getByLabelText("View EMX1 gene")).toBeDefined();
      expect(screen.getByLabelText("View HEK293T · WT")).toBeDefined();
      expect(screen.getByLabelText("View Plate P-24-118")).toBeDefined();
      expect(screen.getByLabelText("View Cas9-HF1 stock")).toBeDefined();
    });

    it("renders entity names and display IDs", () => {
      renderAtRoute("/eln/EXP-0284");
      expect(screen.getByText("EMX1 gene")).toBeDefined();
      expect(screen.getByText("GENE-EMX1")).toBeDefined();
      expect(screen.getByText("HEK293T · WT")).toBeDefined();
      expect(screen.getByText("CELL-0012")).toBeDefined();
      expect(screen.getByText("Plate P-24-118")).toBeDefined();
      expect(screen.getByText("PLT-118")).toBeDefined();
      expect(screen.getByText("Cas9-HF1 stock")).toBeDefined();
      expect(screen.getByText("REG-1042")).toBeDefined();
    });

    it("renders linked entities as buttons", () => {
      renderAtRoute("/eln/EXP-0284");
      const button = screen.getByLabelText("View EMX1 gene");
      expect(button.tagName).toBe("BUTTON");
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

    it("renders four activity items with usernames, actions, and timestamps", () => {
      renderAtRoute("/eln/EXP-0284");

      // Activity 1: Mira K. added bar chart FIG-01 · 14 min ago
      expect(screen.getAllByText("Mira K.").length).toBe(2);
      expect(screen.getByText("added bar chart FIG-01")).toBeDefined();
      expect(screen.getByText("· 14 min ago")).toBeDefined();

      // Activity 2: Jordan S. commented on g4 dropout · 2 h ago
      expect(screen.getByText("Jordan S.")).toBeDefined();
      expect(screen.getByText("commented on g4 dropout")).toBeDefined();
      expect(screen.getByText("· 2 h ago")).toBeDefined();

      // Activity 3: Mira K. linked reagent REG-1042 · 5 h ago
      expect(screen.getByText("linked reagent REG-1042")).toBeDefined();
      expect(screen.getByText("· 5 h ago")).toBeDefined();

      // Activity 4: System autosaved v0.4 · just now
      expect(screen.getByText("System")).toBeDefined();
      expect(screen.getByText("autosaved v0.4")).toBeDefined();
      expect(screen.getByText("· just now")).toBeDefined();
    });

    it("renders four activity items", () => {
      renderAtRoute("/eln/EXP-0284");
      // There should be exactly 4 activity dot indicators
      const aside = document.querySelector("aside");
      const dots = aside?.querySelectorAll('[data-testid="activity-dot"]');
      expect(dots?.length).toBe(4);
    });
  });
});
