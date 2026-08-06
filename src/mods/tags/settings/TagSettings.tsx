import { useState, useEffect, useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import { Trash2, X, Upload } from "lucide-react";
import {
  listTags,
  createTag,
  updateTag,
  deleteTag,
  listColors,
  createColor,
  deleteColor,
  listIcons,
  createIcon,
  deleteIcon,
} from "../api";
import type { Tag } from "../types";
import type { ColorToken, IconLibraryEntry, DeleteResponse } from "../api";
import { Button } from "../../../shell/src/shared/primitives/Button";
import { IconButton } from "../../../shell/src/shared/primitives/IconButton";
import { Input } from "../../../shell/src/shared/primitives/Input";
import { TabBar } from "../../../shell/src/shared/primitives/TabBar";
import { IconBadge } from "../../../shell/src/shared/components/IconBadge";
import { IconPickerPopover } from "../../../shell/src/shared/components/IconPickerPopover";
import { SettingsPageLayout } from "../../../shell/src/shared/components/SettingsPageLayout";
import { SettingsHeroHeader } from "../../../shell/src/shared/components/SettingsHeroHeader";
import { SettingsSectionCard } from "../../../shell/src/shared/components/SettingsSectionCard";
import {
  SettingsMasterList,
  type MasterListRow,
} from "../../../shell/src/shared/components/SettingsMasterList";
import { SettingsCardGrid } from "../../../shell/src/shared/components/SettingsCardGrid";
import { IconLibraryBrowser } from "./IconLibraryBrowser";

type TabKind = "tags" | "colours" | "icons";

type TagMutator = (tag: Tag) => Tag;

// ── Tags tab hook ───────────────────────────────────────────────────────────

interface TagsTabState {
  tags: Tag[];
  loading: boolean;
  error: string | null;
  selectedId: number | null;
  dirtyEdits: Map<number, Tag>;
  saving: boolean;
  showNew: boolean;
  newName: string;
  newColor: string;
  newIcon: string;
  filterValue: string;
  dirtyCount: number;
  selectedTag: Tag | null;
  editingTag: Tag | undefined;
  masterRows: MasterListRow[];
  fetchTags: () => Promise<void>;
  handleSelect: (id: string | number) => void;
  handleNameChange: (name: string) => void;
  handleIconColorChange: (iconKey: string, colorKey: string) => void;
  handleDelete: () => Promise<void>;
  saveAllChanges: () => Promise<void>;
  discardAllEdits: () => void;
  handleCreate: () => Promise<void>;
  setShowNew: (v: boolean) => void;
  setNewName: (v: string) => void;
  setNewColor: (v: string) => void;
  setNewIcon: (v: string) => void;
  setFilterValue: (v: string) => void;
  setSelectedId: (id: number | null) => void;
}

function useTagsTabState(): TagsTabState {
  const [tags, setTags] = useState<Tag[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [dirtyEdits, setDirtyEdits] = useState<Map<number, Tag>>(new Map());
  const [saving, setSaving] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [newName, setNewName] = useState("");
  const [newColor, setNewColor] = useState("muted");
  const [newIcon, setNewIcon] = useState("circle");
  const [filterValue, setFilterValue] = useState("");

  const fetchTags = useCallback(async () => {
    try {
      const data = await listTags();
      setTags(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load tags");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTags();
  }, [fetchTags]);

  const updateEditingTag = (fn: TagMutator) => {
    if (selectedId === null) return;
    setDirtyEdits((prev) => {
      const next = new Map(prev);
      const t = next.get(selectedId);
      if (!t) return prev;
      next.set(selectedId, fn({ ...t }));
      return next;
    });
  };

  const handleCreate = async () => {
    if (!newName.trim()) return;
    setSaving(true);
    setError(null);
    try {
      await createTag(newName.trim(), newColor, newIcon);
      setShowNew(false);
      setNewName("");
      setNewColor("muted");
      setNewIcon("circle");
      await fetchTags();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create tag");
    } finally {
      setSaving(false);
    }
  };

  const handleSelect = (id: string | number) => {
    const tagId = Number(id);
    if (selectedId === tagId) {
      setSelectedId(null);
    } else {
      setSelectedId(tagId);
      setDirtyEdits((prev) => {
        if (prev.has(tagId)) return prev;
        const tag = tags.find((t) => t.id === tagId);
        if (!tag) return prev;
        const next = new Map(prev);
        next.set(tagId, { ...tag });
        return next;
      });
    }
  };

  const handleNameChange = (name: string) => {
    updateEditingTag((t) => ({ ...t, name }));
  };

  const handleIconColorChange = (iconKey: string, colorKey: string) => {
    updateEditingTag((t) => ({ ...t, icon: iconKey, color: colorKey }));
  };

  const handleDelete = async () => {
    if (selectedId === null) return;
    const tag = tags.find((t) => t.id === selectedId);
    if (!tag) return;
    if (!window.confirm(`Delete tag "${tag.name}"? It will be removed from all entries.`)) return;
    try {
      await deleteTag(selectedId);
      setDirtyEdits((prev) => {
        const next = new Map(prev);
        next.delete(selectedId);
        return next;
      });
      setSelectedId(null);
      await fetchTags();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete tag");
    }
  };

  const saveAllChanges = async () => {
    if (dirtyEdits.size === 0) return;
    setSaving(true);
    setError(null);
    let failed = 0;
    for (const [, t] of dirtyEdits) {
      try {
        await updateTag(t.id, { color: t.color, icon: t.icon });
      } catch {
        failed++;
      }
    }
    setDirtyEdits(new Map());
    await fetchTags();
    if (failed > 0) {
      setError(`Failed to save ${failed} tag${failed > 1 ? "s" : ""}`);
    }
    setSaving(false);
  };

  const discardAllEdits = () => {
    setDirtyEdits(new Map());
  };

  const filteredTags = filterValue
    ? tags.filter((t) =>
        t.name.toLowerCase().includes(filterValue.toLowerCase()),
      )
    : tags;

  const masterRows: MasterListRow[] = filteredTags.map((t) => ({
    id: t.id,
    label: t.name,
    secondary: t.color,
    dirty: dirtyEdits.has(t.id),
    icon: <IconBadge iconKey={t.icon} colorKey={t.color} size="sm" />,
  }));

  const selectedTag = selectedId
    ? tags.find((t) => t.id === selectedId) ?? null
    : null;
  const editingTag = selectedId ? dirtyEdits.get(selectedId) : undefined;
  const dirtyCount = dirtyEdits.size;

  return {
    tags,
    loading,
    error,
    selectedId,
    dirtyEdits,
    saving,
    showNew,
    newName,
    newColor,
    newIcon,
    filterValue,
    dirtyCount,
    selectedTag,
    editingTag,
    masterRows,
    fetchTags,
    handleSelect,
    handleNameChange,
    handleIconColorChange,
    handleDelete,
    saveAllChanges,
    discardAllEdits,
    handleCreate,
    setShowNew,
    setNewName,
    setNewColor,
    setNewIcon,
    setFilterValue,
    setSelectedId,
  };
}

// ── Colours tab hook ────────────────────────────────────────────────────────

interface ColoursTabState {
  colours: ColorToken[];
  loading: boolean;
  error: string | null;
  selectedId: number | null;
  saving: boolean;
  showNew: boolean;
  newKey: string;
  newLabel: string;
  newHex: string;
  filterValue: string;
  selectedColour: ColorToken | null;
  masterRows: MasterListRow[];
  fetchColours: () => Promise<void>;
  handleSelect: (id: string | number) => void;
  handleDelete: () => Promise<void>;
  handleDeleteItem: (id: number) => Promise<void>;
  handleCreate: () => Promise<void>;
  setShowNew: (v: boolean) => void;
  setNewKey: (v: string) => void;
  setNewLabel: (v: string) => void;
  setNewHex: (v: string) => void;
  setFilterValue: (v: string) => void;
  setSelectedId: (id: number | null) => void;
}

function useColoursTabState(): ColoursTabState {
  const [colours, setColours] = useState<ColorToken[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [newKey, setNewKey] = useState("");
  const [newLabel, setNewLabel] = useState("");
  const [newHex, setNewHex] = useState("");
  const [filterValue, setFilterValue] = useState("");

  const fetchColours = useCallback(async () => {
    try {
      const data = await listColors();
      setColours(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load colours");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchColours();
  }, [fetchColours]);

  const handleCreate = async () => {
    if (!newKey.trim() || !newLabel.trim() || !newHex.trim()) return;
    setSaving(true);
    setError(null);
    try {
      await createColor({
        key: newKey.trim(),
        label: newLabel.trim(),
        hex: newHex.trim(),
      });
      setShowNew(false);
      setNewKey("");
      setNewLabel("");
      setNewHex("");
      await fetchColours();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create colour");
    } finally {
      setSaving(false);
    }
  };

  const handleSelect = (id: string | number) => {
    const colourId = Number(id);
    setSelectedId((prev) => (prev === colourId ? null : colourId));
  };

  const handleDelete = async () => {
    if (selectedId === null) return;
    const colour = colours.find((c) => c.id === selectedId);
    if (!colour) return;
    if (!window.confirm(`Delete colour "${colour.label}"?`)) return;
    try {
      const result: DeleteResponse = await deleteColor(selectedId);
      const usageMsg =
        result.usage_count > 0
          ? ` It was referenced by ${result.usage_count} tag${result.usage_count !== 1 ? "s" : ""}.`
          : "";
      setError(`Deleted colour "${colour.label}".${usageMsg}`);
      setSelectedId(null);
      await fetchColours();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete colour");
    }
  };

  const handleDeleteItem = async (id: number) => {
    const colour = colours.find((c) => c.id === id);
    if (!colour) return;
    if (!window.confirm(`Delete colour "${colour.label}"?`)) return;
    try {
      const result: DeleteResponse = await deleteColor(id);
      const usageMsg =
        result.usage_count > 0
          ? ` It was referenced by ${result.usage_count} tag${result.usage_count !== 1 ? "s" : ""}.`
          : "";
      setError(`Deleted colour "${colour.label}".${usageMsg}`);
      await fetchColours();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete colour");
    }
  };

  const filteredColours = filterValue
    ? colours.filter(
        (c) =>
          c.label.toLowerCase().includes(filterValue.toLowerCase()) ||
          c.key.toLowerCase().includes(filterValue.toLowerCase()),
      )
    : colours;

  const masterRows: MasterListRow[] = filteredColours.map((c) => ({
    id: c.id,
    label: c.label,
    secondary: c.key,
    icon: (
      <div
        className="h-3 w-3 shrink-0 rounded-full border border-hairline"
        style={{ backgroundColor: c.hex }}
      />
    ),
  }));

  const selectedColour = selectedId
    ? colours.find((c) => c.id === selectedId) ?? null
    : null;

  return {
    colours,
    loading,
    error,
    selectedId,
    saving,
    showNew,
    newKey,
    newLabel,
    newHex,
    filterValue,
    selectedColour,
    masterRows,
    fetchColours,
    handleSelect,
    handleDelete,
    handleDeleteItem,
    handleCreate,
    setShowNew,
    setNewKey,
    setNewLabel,
    setNewHex,
    setFilterValue,
    setSelectedId,
  };
}

// ── Icons tab hook ──────────────────────────────────────────────────────────

interface IconsTabState {
  icons: IconLibraryEntry[];
  loading: boolean;
  error: string | null;
  selectedId: number | null;
  saving: boolean;
  showLucideBrowser: boolean;
  showSvgUpload: boolean;
  newKey: string;
  newLabel: string;
  newSvgContent: string;
  svgFileName: string;
  filterValue: string;
  selectedIcon: IconLibraryEntry | null;
  masterRows: MasterListRow[];
  fetchIcons: () => Promise<void>;
  handleSelect: (id: string | number) => void;
  handleDelete: () => Promise<void>;
  handleDeleteItem: (id: number) => Promise<void>;
  handleCreateFromLucide: (token: string, label: string) => Promise<void>;
  handleUploadSvg: () => Promise<void>;
  setShowLucideBrowser: (v: boolean) => void;
  setShowSvgUpload: (v: boolean) => void;
  setNewKey: (v: string) => void;
  setNewLabel: (v: string) => void;
  setNewSvgContent: (v: string) => void;
  setSvgFileName: (v: string) => void;
  setFilterValue: (v: string) => void;
  setSelectedId: (id: number | null) => void;
}

function useIconsTabState(): IconsTabState {
  const [icons, setIcons] = useState<IconLibraryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [showLucideBrowser, setShowLucideBrowser] = useState(false);
  const [showSvgUpload, setShowSvgUpload] = useState(false);
  const [newKey, setNewKey] = useState("");
  const [newLabel, setNewLabel] = useState("");
  const [newSvgContent, setNewSvgContent] = useState("");
  const [svgFileName, setSvgFileName] = useState("");
  const [filterValue, setFilterValue] = useState("");

  const fetchIcons = useCallback(async () => {
    try {
      const data = await listIcons();
      setIcons(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load icons");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchIcons();
  }, [fetchIcons]);

  const handleCreateFromLucide = useCallback(
    async (token: string, label: string) => {
      setSaving(true);
      setError(null);
      try {
        await createIcon({
          key: token,
          label,
          kind: "lucide",
          token,
        });
        setShowLucideBrowser(false);
        await fetchIcons();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to add icon");
      } finally {
        setSaving(false);
      }
    },
    [fetchIcons],
  );

  const handleUploadSvg = async () => {
    if (!newKey.trim() || !newLabel.trim() || !newSvgContent) return;
    setSaving(true);
    setError(null);
    try {
      await createIcon({
        key: newKey.trim(),
        label: newLabel.trim(),
        kind: "custom",
        svg: newSvgContent,
      });
      setShowSvgUpload(false);
      setNewKey("");
      setNewLabel("");
      setNewSvgContent("");
      setSvgFileName("");
      await fetchIcons();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to upload icon");
    } finally {
      setSaving(false);
    }
  };

  const handleSelect = (id: string | number) => {
    const iconId = Number(id);
    setSelectedId((prev) => (prev === iconId ? null : iconId));
  };

  const handleDelete = async () => {
    if (selectedId === null) return;
    const icon = icons.find((i) => i.id === selectedId);
    if (!icon) return;
    if (!window.confirm(`Delete icon "${icon.label}"?`)) return;
    try {
      const result: DeleteResponse = await deleteIcon(selectedId);
      const usageMsg =
        result.usage_count > 0
          ? ` It was referenced by ${result.usage_count} object${result.usage_count !== 1 ? "s" : ""}.`
          : "";
      setError(`Deleted icon "${icon.label}".${usageMsg}`);
      setSelectedId(null);
      await fetchIcons();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete icon");
    }
  };

  const handleDeleteItem = async (id: number) => {
    const icon = icons.find((i) => i.id === id);
    if (!icon) return;
    if (!window.confirm(`Delete icon "${icon.label}"?`)) return;
    try {
      const result: DeleteResponse = await deleteIcon(id);
      const usageMsg =
        result.usage_count > 0
          ? ` It was referenced by ${result.usage_count} object${result.usage_count !== 1 ? "s" : ""}.`
          : "";
      setError(`Deleted icon "${icon.label}".${usageMsg}`);
      await fetchIcons();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete icon");
    }
  };

  const filteredIcons = filterValue
    ? icons.filter(
        (i) =>
          i.label.toLowerCase().includes(filterValue.toLowerCase()) ||
          i.key.toLowerCase().includes(filterValue.toLowerCase()),
      )
    : icons;

  const masterRows: MasterListRow[] = filteredIcons.map((i) => ({
    id: i.id,
    label: i.label,
    secondary: i.key,
    icon: <IconBadge iconKey={i.key} colorKey="muted" size="sm" />,
  }));

  const selectedIcon = selectedId
    ? icons.find((i) => i.id === selectedId) ?? null
    : null;

  return {
    icons,
    loading,
    error,
    selectedId,
    saving,
    showLucideBrowser,
    showSvgUpload,
    newKey,
    newLabel,
    newSvgContent,
    svgFileName,
    filterValue,
    selectedIcon,
    masterRows,
    fetchIcons,
    handleSelect,
    handleDelete,
    handleDeleteItem,
    handleCreateFromLucide,
    handleUploadSvg,
    setShowLucideBrowser,
    setShowSvgUpload,
    setNewKey,
    setNewLabel,
    setNewSvgContent,
    setSvgFileName,
    setFilterValue,
    setSelectedId,
  };
}

// ── Tab configuration ───────────────────────────────────────────────────────

const TAB_CONFIG: Record<TabKind, { title: string; description: string }> = {
  tags: {
    title: "Tags",
    description: "Create and manage tags to label and organize your entries.",
  },
  colours: {
    title: "Colours",
    description: "Manage the colour palette used across the platform.",
  },
  icons: {
    title: "Icons",
    description: "Manage the icon library — browse Lucide or upload custom SVGs.",
  },
};

// ── Main component ──────────────────────────────────────────────────────────

function TagSettings() {
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab: TabKind =
    (searchParams.get("tab") as TabKind) ?? "tags";

  const tags = useTagsTabState();
  const colours = useColoursTabState();
  const icons = useIconsTabState();

  const setActiveTab = (tab: TabKind) => {
    const params = new URLSearchParams(searchParams);
    params.set("tab", tab);
    setSearchParams(params, { replace: true });
  };

  const config = TAB_CONFIG[activeTab];

  // ── Hero create panel ────────────────────────────────────────────────

  const heroCreatePanel = () => {
    if (activeTab === "tags" && tags.showNew) {
      return (
        <div className="mb-6 rounded-lg border border-[var(--color-ink-hairline)] bg-[var(--color-surface)] p-4">
          <div className="flex flex-wrap items-end gap-4">
            <label className="flex flex-col gap-1">
              <span className="text-[11px] text-[var(--color-ink-muted-foreground)]">Name</span>
              <Input
                value={tags.newName}
                onChange={(e) => tags.setNewName(e.target.value)}
                placeholder="e.g., Urgent"
                onKeyDown={(e) => {
                  if (e.key === "Enter") tags.handleCreate();
                }}
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[11px] text-[var(--color-ink-muted-foreground)]">Icon &amp; Colour</span>
              <IconPickerPopover
                iconKey={tags.newIcon}
                colorKey={tags.newColor}
                size="sm"
                onChange={(iconKey, colorKey) => {
                  tags.setNewIcon(iconKey);
                  tags.setNewColor(colorKey);
                }}
              />
            </label>
            <div className="flex gap-2">
              <Button
                size="sm"
                onClick={tags.handleCreate}
                disabled={tags.saving || !tags.newName.trim()}
              >
                {tags.saving ? "Creating…" : "Create"}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  tags.setShowNew(false);
                  tags.setNewName("");
                  tags.setNewColor("muted");
                  tags.setNewIcon("circle");
                }}
              >
                Cancel
              </Button>
            </div>
          </div>
        </div>
      );
    }

    if (activeTab === "colours" && colours.showNew) {
      const hexValid = /^#[0-9A-Fa-f]{3,6}$/.test(colours.newHex.trim());
      return (
        <div className="mb-6 rounded-lg border border-[var(--color-ink-hairline)] bg-[var(--color-surface)] p-4">
          <div className="flex flex-wrap items-end gap-4">
            <label className="flex flex-col gap-1">
              <span className="text-[11px] text-[var(--color-ink-muted-foreground)]">Key</span>
              <Input
                className="font-[var(--font-label)]"
                value={colours.newKey}
                onChange={(e) => colours.setNewKey(e.target.value)}
                placeholder="e.g., crimson"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[11px] text-[var(--color-ink-muted-foreground)]">Label</span>
              <Input
                value={colours.newLabel}
                onChange={(e) => colours.setNewLabel(e.target.value)}
                placeholder="e.g., Crimson"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[11px] text-[var(--color-ink-muted-foreground)]">Hex</span>
              <div className="flex items-center gap-2">
                <Input
                  className="w-24 font-[var(--font-label)]"
                  value={colours.newHex}
                  onChange={(e) => colours.setNewHex(e.target.value)}
                  placeholder="#FF0000"
                />
                {hexValid && (
                  <div
                    className="h-7 w-7 shrink-0 rounded border border-[var(--color-ink-hairline)]"
                    style={{ backgroundColor: colours.newHex.trim() }}
                    data-testid="hex-preview"
                  />
                )}
              </div>
            </label>
            <div className="flex gap-2">
              <Button
                size="sm"
                onClick={colours.handleCreate}
                disabled={
                  colours.saving ||
                  !colours.newKey.trim() ||
                  !colours.newLabel.trim() ||
                  !hexValid
                }
              >
                {colours.saving ? "Creating…" : "Create"}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  colours.setShowNew(false);
                  colours.setNewKey("");
                  colours.setNewLabel("");
                  colours.setNewHex("");
                }}
              >
                Cancel
              </Button>
            </div>
          </div>
        </div>
      );
    }

    if (activeTab === "icons" && icons.showSvgUpload) {
      return (
        <div className="mb-6 rounded-lg border border-[var(--color-ink-hairline)] bg-[var(--color-surface)] p-4">
          <div className="flex flex-wrap items-end gap-4">
            <label className="flex flex-col gap-1">
              <span className="text-[11px] text-[var(--color-ink-muted-foreground)]">Key</span>
              <Input
                className="font-[var(--font-label)]"
                value={icons.newKey}
                onChange={(e) => icons.setNewKey(e.target.value)}
                placeholder="e.g., petri-dish"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[11px] text-[var(--color-ink-muted-foreground)]">Label</span>
              <Input
                value={icons.newLabel}
                onChange={(e) => icons.setNewLabel(e.target.value)}
                placeholder="e.g., Petri Dish"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[11px] text-[var(--color-ink-muted-foreground)]">SVG File</span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  className="rounded-md border border-[var(--color-ink-hairline)] bg-[var(--color-surface)] px-3 py-1.5 text-xs text-[var(--color-ink-muted-foreground)] transition-colors hover:bg-[var(--color-surface-hover)]"
                  onClick={() => {
                    const input = document.createElement("input");
                    input.type = "file";
                    input.accept = ".svg";
                    input.onchange = (ev) => {
                      const file = (ev.target as HTMLInputElement).files?.[0];
                      if (!file) return;
                      icons.setSvgFileName(file.name);
                      const reader = new FileReader();
                      reader.onload = () => {
                        icons.setNewSvgContent(reader.result as string);
                      };
                      reader.readAsText(file);
                    };
                    input.click();
                  }}
                >
                  {icons.svgFileName || "Choose SVG…"}
                </button>
                {icons.newSvgContent && (
                  <div
                    className="h-6 w-6 shrink-0"
                    dangerouslySetInnerHTML={{ __html: icons.newSvgContent }}
                  />
                )}
              </div>
            </label>
            <div className="flex gap-2">
              <Button
                size="sm"
                onClick={icons.handleUploadSvg}
                disabled={
                  icons.saving ||
                  !icons.newKey.trim() ||
                  !icons.newLabel.trim() ||
                  !icons.newSvgContent
                }
              >
                {icons.saving ? "Uploading…" : "Upload"}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  icons.setShowSvgUpload(false);
                  icons.setNewKey("");
                  icons.setNewLabel("");
                  icons.setNewSvgContent("");
                  icons.setSvgFileName("");
                }}
              >
                Cancel
              </Button>
            </div>
          </div>
        </div>
      );
    }

    return null;
  };

  // ── Hero actions ─────────────────────────────────────────────────────

  const heroActions = () => {
    if (activeTab === "tags") {
      return (
        <Button
          data-testid="new-tag-button"
          size="sm"
          onClick={() => tags.setShowNew(!tags.showNew)}
        >
          {tags.showNew ? "Cancel" : "+ New Tag"}
        </Button>
      );
    }

    if (activeTab === "colours") {
      return (
        <Button
          data-testid="new-colour-button"
          size="sm"
          onClick={() => colours.setShowNew(!colours.showNew)}
        >
          {colours.showNew ? "Cancel" : "+ New Colour"}
        </Button>
      );
    }

    if (activeTab === "icons") {
      return (
        <div className="flex items-center gap-2">
          <Button
            data-testid="add-from-lucide-button"
            size="sm"
            onClick={() => icons.setShowLucideBrowser(true)}
          >
            + Add from Lucide
          </Button>
          <Button
            variant="ghost"
            size="sm"
            data-testid="upload-svg-button"
            onClick={() => icons.setShowSvgUpload(!icons.showSvgUpload)}
          >
            <Upload size={12} className="mr-1" />
            {icons.showSvgUpload ? "Cancel" : "Upload SVG"}
          </Button>
        </div>
      );
    }

    return null;
  };

  // ── Bottom save bar ──────────────────────────────────────────────────

  const bottomBar = () => {
    if (activeTab === "tags" && tags.dirtyCount > 0) {
      return (
        <div className="flex items-center justify-between">
          <span className="text-xs text-[var(--color-ink-muted-foreground)]">
            {tags.dirtyCount} tag{tags.dirtyCount !== 1 ? "s" : ""} with
            unsaved changes
          </span>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={tags.discardAllEdits}>
              Discard Changes
            </Button>
            <Button
              size="sm"
              onClick={tags.saveAllChanges}
              disabled={tags.saving}
            >
              {tags.saving
                ? "Saving…"
                : `Save Changes (${tags.dirtyCount})`}
            </Button>
          </div>
        </div>
      );
    }

    return undefined;
  };

  // ── Loading state ────────────────────────────────────────────────────

  const activeLoading =
    activeTab === "tags"
      ? tags.loading
      : activeTab === "colours"
        ? colours.loading
        : icons.loading;

  const activeError =
    activeTab === "tags"
      ? tags.error
      : activeTab === "colours"
        ? colours.error
        : icons.error;

  if (activeLoading) {
    return (
      <p className="empty">
        Loading {activeTab}…
      </p>
    );
  }

  // ── Tab-specific content ─────────────────────────────────────────────

  const renderTagsContent = () => (
    <div className={activeTab === "tags" ? "" : "hidden"}>
      {tags.error && (
        <div className="mb-4 rounded-md border border-[var(--color-warning)]/30 bg-[var(--color-warning)]/10 px-4 py-2.5 text-sm text-[var(--color-warning)]">
          {tags.error}
        </div>
      )}

      <div className="flex min-h-0 gap-0">
        <div className="w-64 shrink-0">
          <SettingsMasterList
            rows={tags.masterRows}
            selectedId={tags.selectedId}
            filterValue={tags.filterValue}
            onFilterChange={tags.setFilterValue}
            onSelect={tags.handleSelect}
            filterPlaceholder="Filter tags"
          />
          {tags.masterRows.length === 0 && (
            <p className="px-3 py-2 text-xs text-[var(--color-ink-muted-foreground)]">
              No tags found.
            </p>
          )}
        </div>

        <div className="flex-1 space-y-4 p-6">
          {tags.selectedTag && tags.editingTag ? (
            <SettingsSectionCard
              title="Tag identity"
              subtitle={`#${tags.selectedTag.id}`}
              actions={
                <div className="flex items-center gap-1">
                  <IconButton
                    aria-label="Delete tag"
                    title="Delete tag"
                    onClick={tags.handleDelete}
                    className="text-[var(--color-ink-muted-foreground)] hover:text-[var(--color-warning)]"
                  >
                    <Trash2 size={14} />
                  </IconButton>
                  <IconButton
                    aria-label="Close detail"
                    title="Close detail"
                    onClick={() => tags.setSelectedId(null)}
                  >
                    <X size={14} />
                  </IconButton>
                </div>
              }
            >
              <div className="space-y-3">
                <label className="block">
                  <span className="text-[11px] font-medium text-[var(--color-ink-muted-foreground)]">
                    Name
                  </span>
                  <Input
                    value={tags.editingTag.name}
                    onChange={(e) => tags.handleNameChange(e.target.value)}
                    placeholder="Tag name"
                  />
                </label>
                <div className="flex flex-col gap-2">
                  <span className="text-[11px] font-medium text-[var(--color-ink-muted-foreground)]">
                    Icon &amp; Colour
                  </span>
                  <IconPickerPopover
                    iconKey={tags.editingTag.icon}
                    colorKey={tags.editingTag.color}
                    size="md"
                    onChange={tags.handleIconColorChange}
                  />
                </div>
              </div>
            </SettingsSectionCard>
          ) : (
            <div className="flex h-full items-center justify-center text-sm text-[var(--color-ink-muted-foreground)]">
              Select a tag from the list to view or edit its details.
            </div>
          )}
        </div>
      </div>
    </div>
  );

  const renderColoursContent = () => (
    <div className={activeTab === "colours" ? "" : "hidden"}>
      {colours.error && (
        <div className="mb-4 rounded-md border border-[var(--color-warning)]/30 bg-[var(--color-warning)]/10 px-4 py-2.5 text-sm text-[var(--color-warning)]">
          {colours.error}
        </div>
      )}

      <SettingsCardGrid
        filterValue={colours.filterValue}
        onFilterChange={colours.setFilterValue}
        filterPlaceholder="Filter colours"
        emptyMessage="No colours found."
      >
        {colours.colours
          .filter(
            (c) =>
              !colours.filterValue ||
              c.label
                .toLowerCase()
                .includes(colours.filterValue.toLowerCase()) ||
              c.key.toLowerCase().includes(colours.filterValue.toLowerCase()),
          )
          .map((c) => (
            <div
              key={c.id}
              className="group relative rounded-lg border border-[var(--color-ink-hairline)] bg-[var(--color-surface)] p-4 transition-shadow hover:shadow-sm"
            >
              <button
                type="button"
                className="absolute right-2 top-2 flex items-center gap-1.5 rounded px-2 py-1 text-xs opacity-0 transition-opacity hover:text-[var(--color-warning)] group-hover:opacity-100 border-0 bg-transparent text-[var(--color-ink)]"
                onClick={() => colours.handleDeleteItem(c.id)}
                title={`Delete colour "${c.label}"`}
              >
                <Trash2 size={12} />
                Delete
              </button>
              <div className="flex flex-col items-center gap-2 text-center">
                <div
                  className="h-12 w-12 shrink-0 rounded border border-[var(--color-ink-hairline)]"
                  style={{ backgroundColor: c.hex }}
                />
                <div>
                  <div className="text-[13px] font-medium text-[var(--color-ink)]">
                    {c.label}
                  </div>
                  <div className="font-[var(--font-label)] text-[11px] text-[var(--color-ink-muted-foreground)]">
                    {c.hex}
                  </div>
                </div>
              </div>
            </div>
          ))}
      </SettingsCardGrid>
    </div>
  );

  const renderIconsContent = () => (
    <div className={activeTab === "icons" ? "" : "hidden"}>
      {icons.error && (
        <div className="mb-4 rounded-md border border-[var(--color-warning)]/30 bg-[var(--color-warning)]/10 px-4 py-2.5 text-sm text-[var(--color-warning)]">
          {icons.error}
        </div>
      )}

      <SettingsCardGrid
        filterValue={icons.filterValue}
        onFilterChange={icons.setFilterValue}
        filterPlaceholder="Filter icons"
        emptyMessage="No icons found."
      >
        {icons.icons
          .filter(
            (i) =>
              !icons.filterValue ||
              i.label
                .toLowerCase()
                .includes(icons.filterValue.toLowerCase()) ||
              i.key.toLowerCase().includes(icons.filterValue.toLowerCase()),
          )
          .map((i) => (
            <div
              key={i.id}
              className="group relative rounded-lg border border-[var(--color-ink-hairline)] bg-[var(--color-surface)] p-4 transition-shadow hover:shadow-sm"
            >
              <button
                type="button"
                className="absolute right-2 top-2 flex items-center gap-1.5 rounded px-2 py-1 text-xs opacity-0 transition-opacity hover:text-[var(--color-warning)] group-hover:opacity-100 border-0 bg-transparent text-[var(--color-ink)]"
                onClick={() => icons.handleDeleteItem(i.id)}
                title={`Delete icon "${i.label}"`}
              >
                <Trash2 size={12} />
                Delete
              </button>
              <div className="flex flex-col items-center gap-2 text-center">
                <IconBadge iconKey={i.key} colorKey="muted" size="lg" />
                <div>
                  <div className="text-[13px] font-medium text-[var(--color-ink)]">
                    {i.label}
                  </div>
                  <div className="text-[11px] text-[var(--color-ink-muted-foreground)]">
                    {i.kind === "lucide" ? `Lucide · ${i.token}` : "Custom SVG"}
                  </div>
                </div>
              </div>
            </div>
          ))}
      </SettingsCardGrid>
    </div>
  );

  // ── Render ───────────────────────────────────────────────────────────

  return (
    <>
      <IconLibraryBrowser
        open={icons.showLucideBrowser}
        onClose={() => icons.setShowLucideBrowser(false)}
        onSelect={icons.handleCreateFromLucide}
      />

      <SettingsPageLayout
        hero={
          <>
            <SettingsHeroHeader
              eyebrow="labelling"
              title={config.title}
              description={config.description}
              actions={heroActions()}
            />

            {heroCreatePanel()}
          </>
        }
        tabs={
          <TabBar
            tabs={[
              { id: "tags", label: "Tags", testId: "tab-tags" },
              { id: "colours", label: "Colours", testId: "tab-colours" },
              { id: "icons", label: "Icons", testId: "tab-icons" },
            ]}
            activeTab={activeTab}
            onTabChange={(tab) => setActiveTab(tab as TabKind)}
          />
        }
        bottomBar={bottomBar()}
      >
        {renderTagsContent()}
        {renderColoursContent()}
        {renderIconsContent()}
      </SettingsPageLayout>
    </>
  );
}

export default TagSettings;
