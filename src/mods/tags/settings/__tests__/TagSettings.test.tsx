import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import TagSettings from "../TagSettings";
import { ModRegistry } from "../../../../shell/src/mod-system/ModRegistry";

const mockListTags = vi.fn();
const mockCreateTag = vi.fn();
const mockUpdateTag = vi.fn();
const mockDeleteTag = vi.fn();
const mockListColors = vi.fn();
const mockCreateColor = vi.fn();
const mockDeleteColor = vi.fn();
const mockListIcons = vi.fn();
const mockCreateIcon = vi.fn();
const mockDeleteIcon = vi.fn();

vi.mock("../../api", () => ({
  listTags: (...args: unknown[]) => mockListTags(...args),
  createTag: (...args: unknown[]) => mockCreateTag(...args),
  updateTag: (...args: unknown[]) => mockUpdateTag(...args),
  deleteTag: (...args: unknown[]) => mockDeleteTag(...args),
  listColors: (...args: unknown[]) => mockListColors(...args),
  createColor: (...args: unknown[]) => mockCreateColor(...args),
  deleteColor: (...args: unknown[]) => mockDeleteColor(...args),
  listIcons: (...args: unknown[]) => mockListIcons(...args),
  createIcon: (...args: unknown[]) => mockCreateIcon(...args),
  deleteIcon: (...args: unknown[]) => mockDeleteIcon(...args),
}));

vi.mock("../IconLibraryBrowser", () => ({
  IconLibraryBrowser: ({
    open,
    onClose,
    onSelect,
  }: {
    open: boolean;
    onClose: () => void;
    onSelect: (token: string, label: string) => void;
  }) =>
    open ? (
      <div data-testid="lucide-browser-mock">
        <button data-testid="mock-select-beaker" onClick={() => onSelect("beaker", "Beaker")}>
          Beaker
        </button>
        <button data-testid="mock-close-browser" onClick={onClose}>
          Close
        </button>
      </div>
    ) : null,
}));

const TEST_ICONS = [
  { key: "circle", label: "Circle", kind: "lucide", token: "circle", svg: "" },
  { key: "dna", label: "DNA", kind: "lucide", token: "dna", svg: "" },
  { key: "rat", label: "Rat", kind: "lucide", token: "rat", svg: "" },
  { key: "leaf", label: "Leaf", kind: "lucide", token: "leaf", svg: "" },
  { key: "cog", label: "Machine", kind: "lucide", token: "cog", svg: "" },
  { key: "notebook", label: "Entry", kind: "lucide", token: "notebook", svg: "" },
  { key: "user", label: "Person", kind: "lucide", token: "user", svg: "" },
  { key: "folder", label: "Folder", kind: "lucide", token: "folder", svg: "" },
];

const TEST_COLORS = [
  { key: "enzyme", label: "Enzyme", hex: "#d9b3e6" },
  { key: "flask", label: "Flask", hex: "#b3d9e6" },
  { key: "solvent", label: "Solvent", hex: "#b3e6c8" },
  { key: "warn", label: "Warn", hex: "#e6d9b3" },
  { key: "primary", label: "Primary", hex: "#7fb3d9" },
  { key: "success", label: "Success", hex: "#b3e6b3" },
  { key: "destructive", label: "Destructive", hex: "#e6b3b3" },
  { key: "muted", label: "Muted", hex: "#d9d9d9" },
];

function seedRegistry() {
  ModRegistry._reset();
  ModRegistry.getInstance().hydrateFromBackend(
    {
      iconLibrary: TEST_ICONS.map((i) => ({
        key: i.key,
        label: i.label,
        kind: i.kind,
        token: i.token,
        svg: i.svg,
      })),
      colorPalette: TEST_COLORS.map((c) => ({
        key: c.key,
        label: c.label,
        hex: c.hex,
      })),
    },
    new Map(),
  );
}

function makeTag(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    name: "Urgent",
    color: "muted",
    icon: "circle",
    ...overrides,
  };
}

function renderWithRouter(ui: React.ReactElement, initialEntries = ["/settings?section=tags.manage"]) {
  return render(<MemoryRouter initialEntries={initialEntries}>{ui}</MemoryRouter>);
}

describe("TagSettings", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    seedRegistry();
    mockListTags.mockResolvedValue([]);
    mockListColors.mockResolvedValue([]);
    mockListIcons.mockResolvedValue([]);
  });

  // ── Tab bar ─────────────────────────────────────────────────────────

  it("renders three tabs", async () => {
    renderWithRouter(<TagSettings />);
    await waitFor(() => {
      expect(screen.getByTestId("tab-tags")).toBeInTheDocument();
    });
    expect(screen.getByTestId("tab-colours")).toBeInTheDocument();
    expect(screen.getByTestId("tab-icons")).toBeInTheDocument();
  });

  it("renders Tags tab as active by default", async () => {
    renderWithRouter(<TagSettings />);
    await waitFor(() => {
      expect(screen.getByTestId("tab-tags").className).toContain("is-active");
    });
  });

  it("switches to Colours tab and shows appropriate title", async () => {
    renderWithRouter(<TagSettings />);
    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "Tags" })).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId("tab-colours"));
    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "Colours" })).toBeInTheDocument();
      expect(screen.getByText(/Manage the colour palette/)).toBeInTheDocument();
    });
  });

  it("switches to Icons tab and shows appropriate title", async () => {
    renderWithRouter(<TagSettings />);
    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "Tags" })).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId("tab-icons"));
    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "Icons" })).toBeInTheDocument();
      expect(screen.getByText(/Manage the icon library/)).toBeInTheDocument();
    });
  });

  it("renders active tab as deep-linked via ?tab= query param", async () => {
    renderWithRouter(<TagSettings />, ["/settings?section=tags.manage&tab=colours"]);
    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "Colours" })).toBeInTheDocument();
      expect(screen.getByTestId("tab-colours").className).toContain("is-active");
    });
  });

  it("preserves tab content when switching tabs (state preservation)", async () => {
    mockListTags.mockResolvedValue([makeTag({ id: 1, name: "Urgent" })]);
    mockListColors.mockResolvedValue([{ id: 1, key: "enzyme", label: "Enzyme", hex: "#d9b3e6" }]);
    renderWithRouter(<TagSettings />);

    await waitFor(() => {
      expect(screen.getByText("Urgent")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId("tab-colours"));
    await waitFor(() => {
      expect(screen.getByText("Enzyme")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId("tab-tags"));
    expect(screen.getByText("Urgent")).toBeInTheDocument();
  });

  // ── Tags tab — loading & empty states ───────────────────────────────

  it("shows loading state initially", async () => {
    mockListTags.mockReturnValue(new Promise(() => {}));
    renderWithRouter(<TagSettings />);
    await waitFor(() => {
      expect(screen.getByText("Loading tags…")).toBeInTheDocument();
    });
  });

  it("renders empty state in master list when no tags exist", async () => {
    renderWithRouter(<TagSettings />);
    await waitFor(() => {
      expect(screen.getByText("No tags found.")).toBeInTheDocument();
    });
  });

  it("shows error state on API failure", async () => {
    mockListTags.mockRejectedValue(new Error("Network error"));
    renderWithRouter(<TagSettings />);
    await waitFor(() => {
      expect(screen.getByText("Network error")).toBeInTheDocument();
    });
  });

  // ── Tags tab — hero header ──────────────────────────────────────────

  it("renders hero header with eyebrow and title", async () => {
    renderWithRouter(<TagSettings />);
    await waitFor(() => {
      expect(screen.getByText("labelling")).toBeInTheDocument();
    });
    expect(screen.getByRole("heading", { name: "Tags" })).toBeInTheDocument();
    expect(screen.getByText(/Create and manage tags/)).toBeInTheDocument();
  });

  it("renders '+ New Tag' button in header actions", async () => {
    renderWithRouter(<TagSettings />);
    await waitFor(() => {
      expect(screen.getByTestId("new-tag-button")).toBeInTheDocument();
    });
  });

  it("toggles new tag create form when '+ New Tag' is clicked", async () => {
    renderWithRouter(<TagSettings />);
    await waitFor(() => {
      expect(screen.getByTestId("new-tag-button")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId("new-tag-button"));
    expect(screen.getByPlaceholderText("e.g., Urgent")).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("new-tag-button"));
    expect(screen.queryByPlaceholderText("e.g., Urgent")).not.toBeInTheDocument();
  });

  it("uses IconPickerPopover in create form", async () => {
    renderWithRouter(<TagSettings />);
    await waitFor(() => {
      expect(screen.getByTestId("new-tag-button")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId("new-tag-button"));
    expect(screen.getByTestId("icon-badge")).toBeInTheDocument();
  });

  // ── Tags tab — master list ──────────────────────────────────────────

  it("renders tags in the master list", async () => {
    mockListTags.mockResolvedValue([
      makeTag({ id: 1, name: "Urgent", color: "enzyme", icon: "dna" }),
      makeTag({ id: 2, name: "Review", color: "flask", icon: "leaf" }),
    ]);
    renderWithRouter(<TagSettings />);
    await waitFor(() => {
      expect(screen.getByText("Urgent")).toBeInTheDocument();
    });
    expect(screen.getByText("Review")).toBeInTheDocument();
  });

  it("filters tags by name in master list", async () => {
    mockListTags.mockResolvedValue([
      makeTag({ id: 1, name: "Urgent" }),
      makeTag({ id: 2, name: "Review" }),
    ]);
    renderWithRouter(<TagSettings />);
    await waitFor(() => {
      expect(screen.getByText("Urgent")).toBeInTheDocument();
    });
    fireEvent.change(screen.getByPlaceholderText("Filter tags"), {
      target: { value: "Urg" },
    });
    expect(screen.getByText("Urgent")).toBeInTheDocument();
    expect(screen.queryByText("Review")).not.toBeInTheDocument();
  });

  it("selects a tag and shows its detail pane", async () => {
    mockListTags.mockResolvedValue([
      makeTag({ id: 1, name: "Urgent", color: "warn", icon: "rat" }),
    ]);
    renderWithRouter(<TagSettings />);
    await waitFor(() => {
      expect(screen.getByText("Urgent")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText("Urgent"));
    expect(screen.getByText("Tag identity")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Tag name")).toBeInTheDocument();
  });

  it("deselects tag when clicking the same row", async () => {
    mockListTags.mockResolvedValue([makeTag({ id: 1, name: "Urgent" })]);
    renderWithRouter(<TagSettings />);
    await waitFor(() => {
      expect(screen.getByText("Urgent")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText("Urgent"));
    expect(screen.getByText("Tag identity")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Urgent"));
    expect(screen.queryByText("Tag identity")).not.toBeInTheDocument();
  });

  // ── Tags tab — detail pane ──────────────────────────────────────────

  it("shows prompt to select a tag when none is selected", async () => {
    mockListTags.mockResolvedValue([makeTag({ id: 1, name: "Urgent" })]);
    renderWithRouter(<TagSettings />);
    await waitFor(() => {
      expect(screen.getByText("Urgent")).toBeInTheDocument();
    });
    expect(
      screen.getByText("Select a tag from the list to view or edit its details."),
    ).toBeInTheDocument();
  });

  it("shows tag properties in detail pane with IconPickerPopover", async () => {
    mockListTags.mockResolvedValue([
      makeTag({ id: 1, name: "Urgent", color: "warn", icon: "rat" }),
    ]);
    renderWithRouter(<TagSettings />);
    await waitFor(() => {
      expect(screen.getByText("Urgent")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText("Urgent"));
    expect(screen.getByText("Tag identity")).toBeInTheDocument();
    expect(screen.getByText("#1")).toBeInTheDocument();
    expect(screen.getAllByTestId("icon-badge").length).toBeGreaterThanOrEqual(1);
  });

  it("edits tag name via detail pane and shows save bar", async () => {
    mockListTags.mockResolvedValue([makeTag({ id: 1, name: "Urgent" })]);
    renderWithRouter(<TagSettings />);
    await waitFor(() => {
      expect(screen.getByText("Urgent")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText("Urgent"));
    const nameInput = screen.getByPlaceholderText("Tag name");
    fireEvent.change(nameInput, { target: { value: "Updated" } });
    expect(nameInput).toHaveValue("Updated");
    await waitFor(() => {
      expect(screen.getByText(/1 tag with unsaved changes/)).toBeInTheDocument();
    });
  });

  it("saves all dirty edits when save is clicked", async () => {
    mockListTags.mockResolvedValue([
      makeTag({ id: 1, name: "Urgent", color: "warn", icon: "rat" }),
    ]);
    mockUpdateTag.mockResolvedValue({});
    renderWithRouter(<TagSettings />);
    await waitFor(() => {
      expect(screen.getByText("Urgent")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText("Urgent"));
    const nameInput = screen.getByPlaceholderText("Tag name");
    fireEvent.change(nameInput, { target: { value: "Updated" } });
    await waitFor(() => {
      expect(screen.getByText(/Save Changes/)).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText(/Save Changes/));
    await waitFor(() => {
      expect(mockUpdateTag).toHaveBeenCalledWith(1, {
        color: "warn",
        icon: "rat",
      });
    });
  });

  it("discards all edits when discard is clicked", async () => {
    mockListTags.mockResolvedValue([makeTag({ id: 1, name: "Urgent" })]);
    renderWithRouter(<TagSettings />);
    await waitFor(() => {
      expect(screen.getByText("Urgent")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText("Urgent"));
    const nameInput = screen.getByPlaceholderText("Tag name");
    fireEvent.change(nameInput, { target: { value: "Updated" } });
    await waitFor(() => {
      expect(screen.getByText(/1 tag with unsaved changes/)).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText("Discard Changes"));
    expect(screen.queryByText(/unsaved changes/)).not.toBeInTheDocument();
  });

  it("closes detail pane via close button", async () => {
    mockListTags.mockResolvedValue([makeTag({ id: 1, name: "Urgent" })]);
    renderWithRouter(<TagSettings />);
    await waitFor(() => {
      expect(screen.getByText("Urgent")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText("Urgent"));
    expect(screen.getByText("Tag identity")).toBeInTheDocument();
    fireEvent.click(screen.getByTitle("Close detail"));
    expect(screen.queryByText("Tag identity")).not.toBeInTheDocument();
  });

  // ── Tags tab — create tag ───────────────────────────────────────────

  it("creates a tag via the new tag form", async () => {
    mockListTags.mockResolvedValue([]);
    mockCreateTag.mockResolvedValue({});
    renderWithRouter(<TagSettings />);
    await waitFor(() => {
      expect(screen.getByTestId("new-tag-button")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId("new-tag-button"));
    fireEvent.change(screen.getByPlaceholderText("e.g., Urgent"), {
      target: { value: "Urgent" },
    });
    fireEvent.click(screen.getByText("Create"));
    await waitFor(() => {
      expect(mockCreateTag).toHaveBeenCalledWith("Urgent", "muted", "circle");
    });
  });

  it("does not allow creating a tag with empty name", async () => {
    mockListTags.mockResolvedValue([]);
    renderWithRouter(<TagSettings />);
    await waitFor(() => {
      expect(screen.getByTestId("new-tag-button")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId("new-tag-button"));
    const createButton = screen.getByText("Create");
    expect(createButton).toBeDisabled();
  });

  it("shows error when tag creation fails", async () => {
    mockListTags.mockResolvedValue([]);
    mockCreateTag.mockRejectedValue(new Error("Duplicate name"));
    renderWithRouter(<TagSettings />);
    await waitFor(() => {
      expect(screen.getByTestId("new-tag-button")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId("new-tag-button"));
    fireEvent.change(screen.getByPlaceholderText("e.g., Urgent"), {
      target: { value: "Urgent" },
    });
    fireEvent.click(screen.getByText("Create"));
    await waitFor(() => {
      expect(screen.getByText("Duplicate name")).toBeInTheDocument();
    });
  });

  // ── Tags tab — delete tag ───────────────────────────────────────────

  it("deletes a tag after confirmation via detail pane", async () => {
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    mockListTags.mockResolvedValue([makeTag({ id: 1, name: "Urgent" })]);
    mockDeleteTag.mockResolvedValue(undefined);
    renderWithRouter(<TagSettings />);
    await waitFor(() => {
      expect(screen.getByText("Urgent")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText("Urgent"));
    fireEvent.click(screen.getByTitle("Delete tag"));
    expect(confirmSpy).toHaveBeenCalled();
    await waitFor(() => {
      expect(mockDeleteTag).toHaveBeenCalledWith(1);
    });
    confirmSpy.mockRestore();
  });

  it("does not delete tag when confirmation is cancelled", async () => {
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);
    mockListTags.mockResolvedValue([makeTag({ id: 1, name: "Urgent" })]);
    renderWithRouter(<TagSettings />);
    await waitFor(() => {
      expect(screen.getByText("Urgent")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText("Urgent"));
    fireEvent.click(screen.getByTitle("Delete tag"));
    expect(confirmSpy).toHaveBeenCalled();
    expect(mockDeleteTag).not.toHaveBeenCalled();
    confirmSpy.mockRestore();
  });

  // ── Colours tab ─────────────────────────────────────────────────────

  it("renders colours in Colours tab master list", async () => {
    mockListColors.mockResolvedValue([
      { id: 1, key: "enzyme", label: "Enzyme", hex: "#d9b3e6" },
      { id: 2, key: "flask", label: "Flask", hex: "#b3d9e6" },
    ]);
    renderWithRouter(<TagSettings />, ["/settings?section=tags.manage&tab=colours"]);
    await waitFor(() => {
      expect(screen.getByText("Enzyme")).toBeInTheDocument();
    });
    expect(screen.getByText("Flask")).toBeInTheDocument();
  });

  it("shows '+ New Colour' button in Colours tab", async () => {
    renderWithRouter(<TagSettings />, ["/settings?section=tags.manage&tab=colours"]);
    await waitFor(() => {
      expect(screen.getByTestId("new-colour-button")).toBeInTheDocument();
    });
  });

  it("shows colour create form with live hex preview", async () => {
    renderWithRouter(<TagSettings />, ["/settings?section=tags.manage&tab=colours"]);
    await waitFor(() => {
      expect(screen.getByTestId("new-colour-button")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId("new-colour-button"));
    expect(screen.getByPlaceholderText("e.g., Crimson")).toBeInTheDocument();
    fireEvent.change(screen.getByPlaceholderText("#FF0000"), {
      target: { value: "#FF0000" },
    });
    await waitFor(() => {
      expect(screen.getByTestId("hex-preview")).toBeInTheDocument();
    });
  });

  it("creates a colour", async () => {
    mockListColors.mockResolvedValue([]);
    mockCreateColor.mockResolvedValue({});
    renderWithRouter(<TagSettings />, ["/settings?section=tags.manage&tab=colours"]);
    await waitFor(() => {
      expect(screen.getByTestId("new-colour-button")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId("new-colour-button"));
    fireEvent.change(screen.getByPlaceholderText("e.g., crimson"), {
      target: { value: "crimson" },
    });
    fireEvent.change(screen.getByPlaceholderText("e.g., Crimson"), {
      target: { value: "Crimson" },
    });
    fireEvent.change(screen.getByPlaceholderText("#FF0000"), {
      target: { value: "#FF0000" },
    });
    fireEvent.click(screen.getByText("Create"));
    await waitFor(() => {
      expect(mockCreateColor).toHaveBeenCalledWith({
        key: "crimson",
        label: "Crimson",
        hex: "#FF0000",
      });
    });
  });

  it("shows colour information in card grid", async () => {
    mockListColors.mockResolvedValue([
      { id: 1, key: "enzyme", label: "Enzyme", hex: "#d9b3e6" },
    ]);
    renderWithRouter(<TagSettings />, ["/settings?section=tags.manage&tab=colours"]);
    await waitFor(() => {
      expect(screen.getByText("Enzyme")).toBeInTheDocument();
    });
    expect(screen.getByText("#d9b3e6")).toBeInTheDocument();
  });

  it("deletes a colour with confirmation and shows usage count after", async () => {
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    mockListColors.mockResolvedValue([
      { id: 1, key: "enzyme", label: "Enzyme", hex: "#d9b3e6" },
    ]);
    mockDeleteColor.mockResolvedValue({ detail: "Deleted", usage_count: 2 });
    renderWithRouter(<TagSettings />, ["/settings?section=tags.manage&tab=colours"]);
    await waitFor(() => {
      expect(screen.getByText("Enzyme")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTitle('Delete colour "Enzyme"'));
    expect(confirmSpy).toHaveBeenCalledWith('Delete colour "Enzyme"?');
    await waitFor(() => {
      expect(mockDeleteColor).toHaveBeenCalledWith(1);
      expect(screen.getByText(/referenced by 2 tags/)).toBeInTheDocument();
    });
    confirmSpy.mockRestore();
  });

  // ── Icons tab ───────────────────────────────────────────────────────

  it("renders icons in Icons tab master list", async () => {
    mockListIcons.mockResolvedValue([
      { id: 1, key: "dna", label: "DNA", kind: "lucide", token: "dna", svg: "" },
      { id: 2, key: "leaf", label: "Leaf", kind: "lucide", token: "leaf", svg: "" },
    ]);
    renderWithRouter(<TagSettings />, ["/settings?section=tags.manage&tab=icons"]);
    await waitFor(() => {
      expect(screen.getByText("DNA")).toBeInTheDocument();
    });
    expect(screen.getByText("Leaf")).toBeInTheDocument();
  });

  it("shows 'Add from Lucide' and 'Upload SVG' buttons in Icons tab", async () => {
    renderWithRouter(<TagSettings />, ["/settings?section=tags.manage&tab=icons"]);
    await waitFor(() => {
      expect(screen.getByTestId("add-from-lucide-button")).toBeInTheDocument();
      expect(screen.getByTestId("upload-svg-button")).toBeInTheDocument();
    });
  });

  it("opens Lucide browser and adds icon", async () => {
    mockListIcons.mockResolvedValue([]);
    mockCreateIcon.mockResolvedValue({});
    renderWithRouter(<TagSettings />, ["/settings?section=tags.manage&tab=icons"]);
    await waitFor(() => {
      expect(screen.getByTestId("add-from-lucide-button")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId("add-from-lucide-button"));
    await waitFor(() => {
      expect(screen.getByTestId("lucide-browser-mock")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId("mock-select-beaker"));
    await waitFor(() => {
      expect(mockCreateIcon).toHaveBeenCalledWith({
        key: "beaker",
        label: "Beaker",
        kind: "lucide",
        token: "beaker",
      });
    });
  });

  it("shows SVG upload form", async () => {
    renderWithRouter(<TagSettings />, ["/settings?section=tags.manage&tab=icons"]);
    await waitFor(() => {
      expect(screen.getByTestId("upload-svg-button")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId("upload-svg-button"));
    expect(screen.getByPlaceholderText("e.g., petri-dish")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("e.g., Petri Dish")).toBeInTheDocument();
  });

  it("shows icon information in card grid", async () => {
    mockListIcons.mockResolvedValue([
      { id: 1, key: "dna", label: "DNA", kind: "lucide", token: "dna", svg: "" },
    ]);
    renderWithRouter(<TagSettings />, ["/settings?section=tags.manage&tab=icons"]);
    await waitFor(() => {
      expect(screen.getByText("DNA")).toBeInTheDocument();
    });
    expect(screen.getByText("Lucide · dna")).toBeInTheDocument();
  });

  it("shows custom SVG icon in card grid", async () => {
    mockListIcons.mockResolvedValue([
      {
        id: 1,
        key: "petri-dish",
        label: "Petri Dish",
        kind: "custom",
        token: "",
        svg: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/></svg>',
      },
    ]);
    renderWithRouter(<TagSettings />, ["/settings?section=tags.manage&tab=icons"]);
    await waitFor(() => {
      expect(screen.getByText("Petri Dish")).toBeInTheDocument();
    });
    expect(screen.getByText("Custom SVG")).toBeInTheDocument();
  });

  it("deletes an icon with confirmation and shows usage count after", async () => {
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    mockListIcons.mockResolvedValue([
      { id: 1, key: "dna", label: "DNA", kind: "lucide", token: "dna", svg: "" },
    ]);
    mockDeleteIcon.mockResolvedValue({ detail: "Deleted icon 'DNA'.", usage_count: 3 });
    renderWithRouter(<TagSettings />, ["/settings?section=tags.manage&tab=icons"]);
    await waitFor(() => {
      expect(screen.getByText("DNA")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTitle('Delete icon "DNA"'));
    expect(confirmSpy).toHaveBeenCalledWith('Delete icon "DNA"?');
    await waitFor(() => {
      expect(mockDeleteIcon).toHaveBeenCalledWith(1);
      expect(screen.getByText(/referenced by 3 objects/)).toBeInTheDocument();
    });
    confirmSpy.mockRestore();
  });
});
