import { useState, useEffect, useCallback } from "react";
import { listTags, createTag, updateTag, deleteTag } from "../api";
import type { Tag } from "../types";
import { TagPill } from "../ui/TagPill";
import { TagColorPicker } from "../ui/TagColorPicker";
import { TagIconPopover } from "../ui/TagIconPopover";
import { Trash2 } from "lucide-react";

function TagSettings() {
  const [tags, setTags] = useState<Tag[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // ── New tag form ──
  const [showNew, setShowNew] = useState(false);
  const [newName, setNewName] = useState("");
  const [newColor, setNewColor] = useState("muted");
  const [newIcon, setNewIcon] = useState("circle");

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

  const handleUpdateColor = async (tagId: number, color: string) => {
    try {
      await updateTag(tagId, { color });
      setTags((prev) =>
        prev.map((t) => (t.id === tagId ? { ...t, color } : t)),
      );
    } catch {
      // silently ignore
    }
  };

  const handleUpdateIcon = async (tagId: number, icon: string) => {
    try {
      await updateTag(tagId, { icon });
      setTags((prev) =>
        prev.map((t) => (t.id === tagId ? { ...t, icon } : t)),
      );
    } catch {
      // silently ignore
    }
  };

  const handleDelete = async (tagId: number) => {
    if (!window.confirm("Delete this tag? It will be removed from all entries.")) return;
    try {
      await deleteTag(tagId);
      setTags((prev) => prev.filter((t) => t.id !== tagId));
    } catch {
      // silently ignore
    }
  };

  if (loading) {
    return <p className="p-6 text-muted-foreground">Loading tags…</p>;
  }

  return (
    <div className="p-6">
      <div className="mb-6 flex items-center justify-between">
        <h2 className="text-lg font-semibold">Labelling</h2>
        <button
          className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:opacity-90"
          onClick={() => setShowNew(true)}
          disabled={showNew}
        >
          + New Tag
        </button>
      </div>

      {error && (
        <div className="mb-4 rounded border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </div>
      )}

      {/* ── New tag form ── */}
      {showNew && (
        <div className="mb-6 rounded-md border border-hairline bg-panel p-4">
          <div className="flex items-end gap-4">
            <div>
              <label className="mb-1 block text-xs text-muted-foreground">Name</label>
              <input
                type="text"
                className="!w-48"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Tag name"
                autoFocus
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-muted-foreground">Color</label>
              <TagColorPicker value={newColor} onChange={setNewColor} />
            </div>
            <div>
              <label className="mb-1 block text-xs text-muted-foreground">Icon</label>
              <TagIconPopover value={newIcon} onChange={setNewIcon} />
            </div>
            <div className="flex gap-2">
              <button
                className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:opacity-90"
                onClick={handleCreate}
                disabled={saving || !newName.trim()}
              >
                {saving ? "Creating…" : "Create"}
              </button>
              <button
                className="rounded-md border border-hairline px-3 py-1.5 text-sm hover:bg-muted"
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

      {/* ── Tag list ── */}
      {/* ── Tags section ── */}
      <h3 className="mb-3 text-sm font-medium text-muted-foreground">Tags</h3>
      {tags.length === 0 ? (
        <p className="text-muted-foreground">
          No tags yet. Create your first tag above.
        </p>
      ) : (
        <div className="space-y-2">
          {tags.map((tag) => (
            <div
              key={tag.id}
              className="group flex items-center gap-4 rounded-md border border-hairline bg-panel px-4 py-2.5"
              data-testid="tag-settings-row"
            >
              {/* Tag pill display */}
              <TagPill tag={tag} />

              <TagColorPicker
                value={tag.color}
                onChange={(c) => handleUpdateColor(tag.id, c)}
                size="xs"
              />

              <TagIconPopover
                value={tag.icon}
                onChange={(ico) => handleUpdateIcon(tag.id, ico)}
                size="xs"
              />

              {/* Delete button — ghost, only visible on row hover */}
              <button
                type="button"
                className="ml-auto rounded p-1 !border-0 bg-transparent text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors opacity-0 group-hover:opacity-100"
                title="Delete tag"
                aria-label={`Delete tag "${tag.name}"`}
                onClick={() => handleDelete(tag.id)}
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* ── Icons section (placeholder) ── */}
      <h3 className="mb-3 mt-8 text-sm font-medium text-muted-foreground">Icons</h3>
      <p className="text-sm text-muted-foreground">Custom icons coming soon.</p>
    </div>
  );
}

export default TagSettings;
