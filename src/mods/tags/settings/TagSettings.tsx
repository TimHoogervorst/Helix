import { useState, useEffect, useCallback } from "react";
import { Trash2, X } from "lucide-react";
import { listTags, createTag, updateTag, deleteTag } from "../api";
import type { Tag } from "../types";
import { getTagIcon } from "../constants";
import { TagColorPicker } from "../ui/TagColorPicker";
import { TagIconPicker } from "../ui/TagIconPicker";
import { SettingsPageLayout } from "../../../shell/src/shared/components/SettingsPageLayout";
import { SettingsHeroHeader } from "../../../shell/src/shared/components/SettingsHeroHeader";
import { SettingsSectionCard } from "../../../shell/src/shared/components/SettingsSectionCard";
import {
  SettingsMasterList,
  type MasterListRow,
} from "../../../shell/src/shared/components/SettingsMasterList";

type TagMutator = (tag: Tag) => Tag;

function TagSettings() {
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

  const handleColorChange = (color: string) => {
    updateEditingTag((t) => ({ ...t, color }));
  };

  const handleIconChange = (icon: string) => {
    updateEditingTag((t) => ({ ...t, icon }));
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

  const masterRows: MasterListRow[] = filteredTags.map((t) => {
    const iconInfo = getTagIcon(t.icon);
    const IconComponent = iconInfo.Icon;
    return {
      id: t.id,
      label: t.name,
      secondary: t.color,
      dirty: dirtyEdits.has(t.id),
      icon: <IconComponent size={13} />,
    };
  });

  const selectedTag = selectedId
    ? tags.find((t) => t.id === selectedId) ?? null
    : null;
  const editingTag = selectedId ? dirtyEdits.get(selectedId) : undefined;
  const dirtyCount = dirtyEdits.size;

  if (loading) return <p className="empty">Loading tags…</p>;

  return (
    <SettingsPageLayout
      hero={
        <>
          <SettingsHeroHeader
            eyebrow="labelling"
            title="Labelling"
            description="Create and manage tags to label and organize your entries."
            actions={
              <button
                type="button"
                className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90"
                onClick={() => setShowNew(!showNew)}
              >
                {showNew ? "Cancel" : "+ New Tag"}
              </button>
            }
          />

          {showNew && (
            <div className="mb-6 rounded-lg border border-hairline bg-panel p-4">
              <div className="flex flex-wrap items-end gap-4">
                <label className="flex flex-col gap-1">
                  <span className="text-[11px] text-muted-foreground">Name</span>
                  <input
                    type="text"
                    className="rounded-md border border-hairline bg-surface px-2.5 py-1.5 text-sm outline-none focus:border-primary/50"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    placeholder="e.g., Urgent"
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleCreate();
                    }}
                  />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-[11px] text-muted-foreground">Color</span>
                  <TagColorPicker value={newColor} onChange={setNewColor} />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-[11px] text-muted-foreground">Icon</span>
                  <TagIconPicker value={newIcon} onChange={setNewIcon} />
                </label>
                <div className="flex gap-2">
                  <button
                    type="button"
                    className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
                    onClick={handleCreate}
                    disabled={saving || !newName.trim()}
                  >
                    {saving ? "Creating…" : "Create"}
                  </button>
                  <button
                    type="button"
                    className="rounded-md border border-hairline bg-surface px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-muted/50"
                    onClick={() => {
                      setShowNew(false);
                      setNewName("");
                      setNewColor("muted");
                      setNewIcon("circle");
                    }}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          )}
        </>
      }
      bottomBar={
        dirtyCount > 0 ? (
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">
              {dirtyCount} tag{dirtyCount !== 1 ? "s" : ""} with unsaved
              changes
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                className="rounded-md border-transparent bg-transparent px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                onClick={discardAllEdits}
              >
                Discard Changes
              </button>
              <button
                type="button"
                className="rounded-md bg-primary px-4 py-1.5 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
                onClick={saveAllChanges}
                disabled={saving}
              >
                {saving ? "Saving…" : `Save Changes (${dirtyCount})`}
              </button>
            </div>
          </div>
        ) : undefined
      }
    >
      {error && (
        <div className="mb-4 rounded-md border border-warn/30 bg-warn/10 px-4 py-2.5 text-sm text-warn">
          {error}
        </div>
      )}

      <div className="flex min-h-0 gap-0">
        <div className="w-64 shrink-0">
          <SettingsMasterList
            rows={masterRows}
            selectedId={selectedId}
            filterValue={filterValue}
            onFilterChange={setFilterValue}
            onSelect={handleSelect}
            filterPlaceholder="Filter tags"
          />
          {masterRows.length === 0 && (
            <p className="px-3 py-2 text-xs text-muted-foreground">
              No tags found.
            </p>
          )}
        </div>

        <div className="flex-1 space-y-4 p-6">
          {selectedTag && editingTag ? (
            <>
              <SettingsSectionCard
                title="Tag identity"
                subtitle={`#${selectedTag.id}`}
                actions={
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      className="rounded border-transparent bg-transparent p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-warn"
                      onClick={handleDelete}
                      title="Delete tag"
                    >
                      <Trash2 size={14} />
                    </button>
                    <button
                      type="button"
                      className="rounded border-transparent bg-transparent p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                      onClick={() => setSelectedId(null)}
                      title="Close detail"
                    >
                      <X size={14} />
                    </button>
                  </div>
                }
              >
                <div className="space-y-3">
                  <label className="block">
                    <span className="text-[11px] font-medium text-muted-foreground">
                      Name
                    </span>
                    <input
                      type="text"
                      className="mt-1 block w-full rounded-md border border-hairline bg-muted px-2.5 py-1.5 text-sm outline-none focus:border-primary/50"
                      value={editingTag.name}
                      onChange={(e) => handleNameChange(e.target.value)}
                      placeholder="Tag name"
                    />
                  </label>
                  <div className="flex flex-col gap-2">
                    <span className="text-[11px] font-medium text-muted-foreground">
                      Color
                    </span>
                    <TagColorPicker
                      value={editingTag.color}
                      onChange={handleColorChange}
                    />
                  </div>
                  <div className="flex flex-col gap-2">
                    <span className="text-[11px] font-medium text-muted-foreground">
                      Icon
                    </span>
                    <TagIconPicker
                      value={editingTag.icon}
                      onChange={handleIconChange}
                    />
                  </div>
                </div>
              </SettingsSectionCard>


            </>
          ) : (
            <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
              Select a tag from the list to view or edit its details.
            </div>
          )}
        </div>
      </div>
    </SettingsPageLayout>
  );
}

export default TagSettings;
