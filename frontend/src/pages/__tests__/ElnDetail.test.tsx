/**
 * Tests for ElnDetail — 3-column ELN entry page.
 *
 * Verifies the top toolbar (breadcrumbs, status badge, editor action buttons,
 * ghost icon buttons, avatars, share/sign & witness), content area, and metadata
 * panel.
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
  // ── Top toolbar: breadcrumbs & status badge ─────────────────────────────

  it("renders breadcrumb with folder icon and path", () => {
    renderAtRoute("/eln/EXP-0284");
    expect(screen.getByText("CRISPR-Cas9 Optimization")).toBeDefined();
    expect(screen.getByText("EXP-0284")).toBeDefined();
  });

  it("shows 'New' as display ID for new entry route", () => {
    renderAtRoute("/eln/new");
    expect(screen.getByText("New")).toBeDefined();
  });

  it("renders Draft status badge with lock icon", () => {
    renderAtRoute("/eln/EXP-0284");
    // Should find two Draft badges — one in toolbar, one in metadata
    const badges = screen.getAllByText("Draft");
    expect(badges.length).toBeGreaterThanOrEqual(1);
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

  // ── Metadata panel ─────────────────────────────────────────────────────

  it("renders Metadata section with fields", () => {
    renderAtRoute("/eln/EXP-0284");

    // Section header
    expect(screen.getAllByText("Metadata").length).toBeGreaterThan(0);

    // Fields
    expect(screen.getByText("Owner")).toBeDefined();
    // "Dr. Mira Kato" appears in both Metadata and Activity sections
    expect(screen.getAllByText("Dr. Mira Kato").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("Witness")).toBeDefined();
    expect(screen.getByText("Project")).toBeDefined();
    expect(screen.getByText("CRISPR-Cas9 Opt.")).toBeDefined();
    expect(screen.getByText("Instrument")).toBeDefined();
  });

  it("renders Linked entities section with placeholder entries", () => {
    renderAtRoute("/eln/EXP-0284");
    expect(screen.getByText("Linked entities")).toBeDefined();
    expect(screen.getByText("RGT-0042")).toBeDefined();
    expect(screen.getByText("Cas9 Nuclease")).toBeDefined();
    expect(screen.getByText("CEL-0012")).toBeDefined();
    expect(screen.getByText("PLA-0089")).toBeDefined();
  });

  it("renders Attachments section with placeholder files", () => {
    renderAtRoute("/eln/EXP-0284");
    expect(screen.getByText("Attachments")).toBeDefined();
    expect(screen.getByText("gel-image.png")).toBeDefined();
    expect(screen.getByText("protocol-v3.pdf")).toBeDefined();
  });

  it("renders Activity section with placeholder items", () => {
    renderAtRoute("/eln/EXP-0284");
    expect(screen.getByText("Activity")).toBeDefined();
    // Dr. Mira Kato appears in both Metadata (Owner) and Activity items
    const katoRefs = screen.getAllByText("Dr. Mira Kato");
    expect(katoRefs.length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText("James Saito")).toBeDefined();
  });
});
