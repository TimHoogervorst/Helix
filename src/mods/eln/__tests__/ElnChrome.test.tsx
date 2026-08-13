import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import React from "react";

vi.mock("../../tags/hooks/useTagSearch", () => ({
  useTagSearch: () => ({
    query: "",
    setQuery: vi.fn(),
    suggestions: [],
    isSearching: false,
    isCreating: false,
    pendingName: null,
    pendingColor: "muted",
    pendingIcon: "circle",
    startCreate: vi.fn(),
    pickColor: vi.fn(),
    pickIcon: vi.fn(),
    cancelCreate: vi.fn(),
    clearSearch: vi.fn(),
  }),
}));

vi.mock("../../tags/api", () => ({
  listTags: vi.fn().mockResolvedValue([]),
  createTag: vi.fn(),
}));

import ElnChrome from "../workspace/ElnChrome";
import type { ElnChromeProps } from "../workspace/ElnChrome";
import type { EntryDetail, ElnAction, Tag } from "../types";

function makeEntry(overrides: Partial<EntryDetail> = {}): EntryDetail {
  return {
    id: 1,
    display_id: "EXP-0284",
    name: "Test Entry",
    content: { type: "doc", content: [{ type: "paragraph" }] },
    folder: 1,
    folder_name: "Research",
    folder_path: "/Research/CRISPR",
    author: 1,
    author_username: "mirak",
    author_info: null,
    created_at: "2026-01-15T10:00:00.000Z",
    updated_at: "2026-07-30T14:22:00.000Z",
    status: "in_progress",
    status_display: "In Progress",
    tags: [],
    mentions: [],
    ...overrides,
  };
}

function makeTag(overrides: Partial<Tag> = {}): Tag {
  return {
    id: 1,
    name: "crispr",
    color: "blue",
    icon: "circle",
    ...overrides,
  };
}

function makeAction(userId: number, username: string, initials: { first: string; last: string }, createdAt?: string): ElnAction {
  return {
    id: userId,
    action: "eln.entry.edited",
    action_type: "edited",
    target_type: "eln.entry",
    target_id: 1,
    metadata: {},
    created_at: createdAt ?? new Date().toISOString(),
    performed_by: {
      id: userId,
      username,
      first_name: initials.first,
      last_name: initials.last,
      color: "#d9b3e6",
    },
  };
}

function defaultProps(overrides: Partial<ElnChromeProps> = {}): ElnChromeProps {
  return {
    isReady: true,
    error: null,
    isNew: false,
    entryDisplayId: "EXP-0284",
    entry: makeEntry(),
    projectUid: "proj-001",
    folderPath: "/Research/CRISPR",
    title: "CRISPR Knockout Validation",
    onTitleChange: vi.fn(),
    description: "Knockout validation via gel electrophoresis.",
    onDescriptionChange: vi.fn(),
    isLockedByOther: false,
    lockHeldBy: null,
    saveStatus: "idle",
    queueLength: 0,
    onSave: vi.fn(),
    onDelete: vi.fn(),
    tags: [],
    onAddTag: vi.fn(),
    onRemoveTag: vi.fn(),
    recentEditors: [],
    headerActions: null,
    editor: React.createElement("div", { "data-testid": "tiptap-renderer" }),
    sidebar: null,
    ...overrides,
  };
}

function renderChrome(props: Partial<ElnChromeProps> = {}) {
  return render(
    <MemoryRouter>
      <ElnChrome {...defaultProps(props)} />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("ElnChrome", () => {
  describe("loading phase", () => {
    it("renders ContentLoadingSkeleton when isReady is false", () => {
      renderChrome({ isReady: false, error: null });
      expect(screen.getByTestId("content-loading-skeleton")).toBeDefined();
    });

    it("does not render the editor or toolbar when loading", () => {
      renderChrome({ isReady: false, error: null });
      expect(screen.queryByTestId("tiptap-renderer")).toBeNull();
      expect(screen.queryByLabelText("Saved")).toBeNull();
    });
  });

  describe("error phase", () => {
    it("renders the shared not-found state for a 404", () => {
      renderChrome({ isReady: false, error: "API error: 404", errorStatus: 404 });

      expect(screen.getByTestId("not-found")).toBeInTheDocument();
      expect(screen.queryByText("API error: 404")).toBeNull();
    });

    it("renders error message and back link", () => {
      renderChrome({ isReady: false, error: "Entry not found" });
      expect(screen.getByText("Entry not found")).toBeDefined();
      const backLink = screen.getByText("← Back to entries");
      expect(backLink).toBeDefined();
      expect(backLink.getAttribute("href")).toBe("/library");
    });

    it("does not render the editor or toolbar on error", () => {
      renderChrome({ isReady: false, error: "Entry not found" });
      expect(screen.queryByTestId("tiptap-renderer")).toBeNull();
      expect(screen.queryByLabelText("Saved")).toBeNull();
    });
  });

  describe("save indicator states", () => {
    it("renders Saved checkmark when idle", () => {
      renderChrome({ saveStatus: "idle", queueLength: 0 });
      expect(screen.getByLabelText("Saved")).toBeDefined();
    });

    it("renders saving spinner when saveStatus is saving", () => {
      renderChrome({ saveStatus: "saving", queueLength: 0 });
      expect(screen.getByLabelText("Saving…")).toBeDefined();
    });

    it("renders saving spinner when queueLength > 0 even if status is idle", () => {
      renderChrome({ saveStatus: "idle", queueLength: 3 });
      expect(screen.getByLabelText("Saving…")).toBeDefined();
    });

    it("renders error state and invokes onSave on retry click", () => {
      const onSave = vi.fn();
      renderChrome({ saveStatus: "error", queueLength: 0, onSave });
      const errorBtn = screen.getByLabelText("Save failed — click to retry");
      expect(errorBtn).toBeDefined();
      fireEvent.click(errorBtn);
      expect(onSave).toHaveBeenCalledTimes(1);
    });

    it("renders lock icon when locked by another user (replaces save indicator)", () => {
      renderChrome({ isLockedByOther: true, lockHeldBy: "bob" });
      expect(screen.getByLabelText("Locked by bob — read-only")).toBeDefined();
      expect(screen.queryByLabelText("Saved")).toBeNull();
      expect(screen.queryByLabelText("Saving…")).toBeNull();
    });
  });

  describe("locked banner", () => {
    it("renders locked banner naming the holder", () => {
      renderChrome({ isLockedByOther: true, lockHeldBy: "alice" });
      const banner = screen.getByTestId("locked-banner");
      expect(banner).toBeDefined();
      expect(banner.textContent).toContain("alice");
    });

    it("shows fallback text when lockHeldBy is null", () => {
      renderChrome({ isLockedByOther: true, lockHeldBy: null });
      const banner = screen.getByTestId("locked-banner");
      expect(banner.textContent).toContain("another user");
    });

    it("does not render locked banner when not locked", () => {
      renderChrome({ isLockedByOther: false });
      expect(screen.queryByTestId("locked-banner")).toBeNull();
    });

    it("disables title editing and description when locked", () => {
      renderChrome({ isLockedByOther: true, lockHeldBy: "bob" });
      const title = screen.getByTestId("title-display");
      expect(title.getAttribute("contentEditable")).toBe("false");
      const textarea = screen.getByTestId("description-input");
      expect(textarea.hasAttribute("readonly")).toBe(true);
    });

    it("hides MoreActions dropdown when locked", () => {
      renderChrome({ isLockedByOther: true, lockHeldBy: "bob" });
      expect(screen.queryByLabelText("More actions")).toBeNull();
    });
  });

  describe("breadcrumb links", () => {
    it("renders breadcrumb segments linking to library paths", () => {
      renderChrome({ folderPath: "/Research/CRISPR/Optimization" });
      expect(screen.getByText("Research")).toBeDefined();
      expect(screen.getByText("CRISPR")).toBeDefined();
      expect(screen.getByText("Optimization")).toBeDefined();

      const researchLink = screen.getByText("Research").closest("a");
      expect(researchLink).not.toBeNull();
      expect(researchLink!.getAttribute("href")).toBe(
        "/library?project=proj-001&path=%2FResearch",
      );

      const crisprLink = screen.getByText("CRISPR").closest("a");
      expect(crisprLink).not.toBeNull();
      expect(crisprLink!.getAttribute("href")).toBe(
        "/library?project=proj-001&path=%2FResearch%2FCRISPR",
      );

      const optSpan = screen.getByText("Optimization").closest("span");
      expect(optSpan).not.toBeNull();
      const lastSegmentAnchor = screen.getByText("Optimization").closest("a");
      expect(lastSegmentAnchor).toBeNull();
    });

    it("renders entry display ID as last segment in breadcrumb", () => {
      renderChrome({ entryDisplayId: "EXP-0284" });
      expect(screen.getByText("EXP-0284")).toBeDefined();
    });

    it("renders the entry at the Project root when folderPath is empty", () => {
      renderChrome({ folderPath: "" });
      expect(screen.getByText("EXP-0284")).toBeInTheDocument();
      expect(screen.queryByText("—")).toBeNull();
    });
  });

  describe("title callbacks", () => {
    it("fires onTitleChange on input", () => {
      const onTitleChange = vi.fn();
      renderChrome({ title: "Old Title", onTitleChange });
      const title = screen.getByTestId("title-display");
      fireEvent.input(title, { target: { textContent: "New Title" } });
      expect(onTitleChange).toHaveBeenCalledWith("New Title");
    });

    it("suppresses onTitleChange when locked", () => {
      const onTitleChange = vi.fn();
      renderChrome({
        isLockedByOther: true,
        lockHeldBy: "bob",
        title: "Locked Title",
        onTitleChange,
      });
      const title = screen.getByTestId("title-display");
      fireEvent.input(title, { target: { textContent: "Hacked" } });
      expect(onTitleChange).not.toHaveBeenCalled();
    });

    it("trims title on blur when not locked", () => {
      const onTitleChange = vi.fn();
      renderChrome({
        title: "  Padded Title  ",
        onTitleChange,
      });
      const title = screen.getByTestId("title-display");
      fireEvent.blur(title);
      expect(onTitleChange).toHaveBeenCalledWith("Padded Title");
    });

    it("does not trim title on blur when locked", () => {
      const onTitleChange = vi.fn();
      renderChrome({
        isLockedByOther: true,
        lockHeldBy: "bob",
        title: "  Padded Title  ",
        onTitleChange,
      });
      const title = screen.getByTestId("title-display");
      fireEvent.blur(title);
      expect(onTitleChange).not.toHaveBeenCalled();
    });
  });

  describe("description callbacks", () => {
    it("fires onDescriptionChange on input", () => {
      const onDescriptionChange = vi.fn();
      renderChrome({
        description: "Old description",
        onDescriptionChange,
      });
      const textarea = screen.getByTestId("description-input");
      fireEvent.change(textarea, { target: { value: "New description" } });
      expect(onDescriptionChange).toHaveBeenCalledWith("New description");
    });

    it("suppresses onDescriptionChange when locked", () => {
      const onDescriptionChange = vi.fn();
      renderChrome({
        isLockedByOther: true,
        lockHeldBy: "bob",
        description: "Locked description",
        onDescriptionChange,
      });
      const textarea = screen.getByTestId("description-input");
      fireEvent.change(textarea, { target: { value: "Hacked" } });
      expect(onDescriptionChange).not.toHaveBeenCalled();
    });
  });

  describe("tags lock behavior", () => {
    it("renders TagAutocomplete when not locked", () => {
      renderChrome({ isLockedByOther: false, tags: [] });
      expect(screen.getByPlaceholderText("Search tags…")).toBeDefined();
    });

    it("hides TagAutocomplete when locked", () => {
      renderChrome({
        isLockedByOther: true,
        lockHeldBy: "bob",
        tags: [],
      });
      expect(screen.queryByPlaceholderText("Search tags…")).toBeNull();
    });

    it("renders tag pills without remove button when locked", () => {
      const tag = makeTag();
      renderChrome({
        isLockedByOther: true,
        lockHeldBy: "bob",
        tags: [tag],
        onRemoveTag: vi.fn(),
      });
      const pill = screen.getByTestId("tag-pill");
      expect(pill).toBeDefined();
      const removeBtn = pill.querySelector("button");
      expect(removeBtn).toBeNull();
    });
  });

  describe("share URL copy", () => {
    beforeEach(() => {
      Object.defineProperty(navigator, "clipboard", {
        value: {
          writeText: vi.fn().mockResolvedValue(undefined),
        },
        writable: true,
      });
    });

    it("copies canonical workspace URL on share click", async () => {
      renderChrome({ entryDisplayId: "EXP-0284" });
      const shareBtn = screen.getByLabelText("Share");
      fireEvent.click(shareBtn);
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
        `${window.location.origin}/eln/EXP-0284`,
      );
    });

    it("shows Copied! feedback after share click", async () => {
      renderChrome({ entryDisplayId: "EXP-0284" });
      const shareBtn = screen.getByLabelText("Share");
      fireEvent.click(shareBtn);
      await waitFor(() => {
        expect(screen.getByLabelText("Copied!")).toBeDefined();
      });
    });
  });

  describe("comment toggle", () => {
    it("starts with comments shown (Hide comments aria-label)", () => {
      renderChrome();
      expect(screen.getByLabelText("Hide comments")).toBeDefined();
      expect(screen.getByLabelText("Hide comments").getAttribute("aria-pressed")).toBe("true");
    });

    it("toggles to Hide comments label when clicked", () => {
      renderChrome();
      const btn = screen.getByLabelText("Hide comments");
      fireEvent.click(btn);
      expect(screen.getByLabelText("Show comments")).toBeDefined();
      expect(screen.getByLabelText("Show comments").getAttribute("aria-pressed")).toBe("false");
    });
  });

  describe("five-zone layout", () => {
    it("renders center gutter main element", () => {
      renderChrome();
      const main = document.querySelector("main");
      expect(main).not.toBeNull();
      expect(main!.querySelector('[data-testid="tiptap-renderer"]')).toBeDefined();
    });

    it("renders right gutter comments aside", () => {
      renderChrome();
      const aside = screen.getByLabelText("Comments");
      expect(aside).toBeDefined();
      expect(aside.tagName).toBe("ASIDE");
      expect(aside.className).toContain("w-64");
      expect(aside.className).toContain("hidden");
      expect(aside.className).toContain("xl:block");
    });

    it("renders injected sidebar node", () => {
      renderChrome({
        sidebar: React.createElement("div", { "data-testid": "slot-sidebar" }, "Sidebar"),
      });
      expect(screen.getByTestId("slot-sidebar")).toBeDefined();
      expect(screen.getByText("Sidebar")).toBeDefined();
    });

    it("renders injected header actions node", () => {
      renderChrome({
        headerActions: React.createElement("div", { "data-testid": "header-actions" }, "Actions"),
      });
      expect(screen.getByTestId("header-actions")).toBeDefined();
      expect(screen.getByText("Actions")).toBeDefined();
    });
  });

  describe("metadata line", () => {
    it("renders entry display_id, created, updated when entry exists", () => {
      const entry = makeEntry({
        display_id: "EXP-0284",
        created_at: "2026-01-15T10:00:00.000Z",
        updated_at: "2026-07-30T14:22:00.000Z",
      });
      renderChrome({ entry });
      const meta = screen.getByTestId("metadata-line");
      expect(meta.textContent).toContain("EXP-0284");
      expect(meta.textContent).toContain("2026-01-15");
      expect(meta.textContent).toContain("2026-07-30");
    });

    it("renders New entry when entry is null", () => {
      renderChrome({ entry: null });
      const meta = screen.getByTestId("metadata-line");
      expect(meta.textContent).toBe("New entry");
    });
  });

  describe("edge cases", () => {
    it("renders new entry with autofocus-ready title (isNew=true)", () => {
      renderChrome({ isNew: true, entry: null, title: "" });
      const title = screen.getByTestId("title-display");
      expect(title).toBeDefined();
      expect(title.getAttribute("contentEditable")).toBe("true");
    });

    it("shows Sign & Witness placeholder button", () => {
      renderChrome();
      expect(screen.getByLabelText("Sign & Witness")).toBeDefined();
    });

    it("hides MoreActions when isReady is false", () => {
      renderChrome({ isReady: false, error: null });
      expect(screen.queryByLabelText("More actions")).toBeNull();
    });

    it("renders the tools placeholder buttons (History, Star)", () => {
      renderChrome();
      expect(screen.getByLabelText("History")).toBeDefined();
      expect(screen.getByLabelText("Star")).toBeDefined();
    });
  });
});
