import { useState, useEffect, useCallback } from "react";
import { listTags, createTag, updateTag, deleteTag } from "../api";
import type { Tag } from "../types";
import { TAG_COLORS, TAG_ICONS, getTagColor, getTagIcon } from "../constants";
import { X } from "lucide-react";

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

  // ── Editing state ──
  const [editingColor, setEditingColor] = useState<number | null>(null);
  const [editingIcon, setEditingIcon] = useState<number | null>(null);

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
      setEditingColor(null);
      await fetchTags();
    } catch {
      // silently ignore
    }
  };

  const handleUpdateIcon = async (tagId: number, icon: string) => {
    try {
      await updateTag(tagId, { icon });
      setEditingIcon(null);
      await fetchTags();
    } catch {
      // silently ignore
    }
  };

  const handleDelete = async (tagId: number) => {
    if (!window.confirm("Delete this tag? It will be removed from all entries.")) return;
    try {
      await deleteTag(tagId);
      await fetchTags();
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
        <h2 className="text-lg font-semibold">Tags</h2>
        <button
          className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:opacity-90"
          onClick={() => setShowNew(true)}
          disabled={showNew}
        >
          + New Tag
        </button>
      </div>

      {error && <div className="mb-4 rounded border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</div>}

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
              <div className="flex gap-1">
                {TAG_COLORS.map((c) => (
                  <button
                    key={c.key}
                    type="button"
                    className={`h-5 w-5 rounded-full border-2 ${newColor === c.key ? "border-foreground" : "border-transparent"}`}
                    style={{ backgroundColor: c.hex }}
                    title={c.label}
                    aria-label={c.label}
                    onClick={() => setNewColor(c.key)}
                  />
                ))}
              </div>
            </div>
            <div>
              <label className="mb-1 block text-xs text-muted-foreground">Icon</label>
              <div className="flex gap-1">
                {TAG_ICONS.map((ico) => {
                  const IconC = ico.Icon;
                  return (
                    <button
                      key={ico.key}
                      type="button"
                      className={`h-7 w-7 rounded border ${newIcon === ico.key ? "border-foreground bg-muted" : "border-hairline"} flex items-center justify-center`}
                      title={ico.label}
                      aria-label={ico.label}
                      onClick={() => setNewIcon(ico.key)}
                    >
                      <IconC className="h-4 w-4" />
                    </button>
                  );
                })}
              </div>
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
                onClick={() => { setShowNew(false); setNewName(""); setNewColor("muted"); setNewIcon("circle"); }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Tag list ── */}
      {tags.length === 0 ? (
        <p className="text-muted-foreground">No tags yet. Create your first tag above.</p>
      ) : (
        <div className="space-y-2">
          {tags.map((tag) => {
            const colorInfo = getTagColor(tag.color);
            const iconInfo = getTagIcon(tag.icon);
            const IconC = iconInfo.Icon;
            return (
              <div
                key={tag.id}
                className="flex items-center gap-3 rounded-md border border-hairline bg-panel px-4 py-2.5"
              >
                <span
                  className="inline-flex h-7 w-7 items-center justify-center rounded-full text-xs"
                  style={{ backgroundColor: colorInfo.hex }}
                >
                  <IconC className="h-3.5 w-3.5" />
                </span>
                <span className="min-w-[120px] font-medium">{tag.name}</span>

                {/* Color picker */}
                <div className="relative flex items-center gap-1">
                  <span className="text-xs text-muted-foreground">Color:</span>
                  {editingColor === tag.id ? (
                    <div className="flex gap-0.5 rounded border border-hairline bg-background px-1.5 py-1">
                      {TAG_COLORS.map((c) => (
                        <button
                          key={c.key}
                          type="button"
                          className={`h-4 w-4 rounded-full ${tag.color === c.key ? "ring-1 ring-foreground" : ""}`}
                          style={{ backgroundColor: c.hex }}
                          title={c.label}
                          aria-label={c.label}
                          onClick={() => handleUpdateColor(tag.id, c.key)}
                        />
                      ))}
                      <button
                        type="button"
                        className="ml-0.5 text-muted-foreground hover:text-foreground"
                        title="Close color picker"
                        aria-label="Close color picker"
                        onClick={() => setEditingColor(null)}
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      className="h-4 w-4 rounded-full border border-hairline"
                      style={{ backgroundColor: colorInfo.hex }}
                      title={colorInfo.label}
                      aria-label={colorInfo.label}
                      onClick={() => setEditingColor(tag.id)}
                    />
                  )}
                </div>

                {/* Icon picker */}
                <div className="relative flex items-center gap-1">
                  <span className="text-xs text-muted-foreground">Icon:</span>
                  {editingIcon === tag.id ? (
                    <div className="flex gap-0.5 rounded border border-hairline bg-background px-1.5 py-1">
                      {TAG_ICONS.map((ico) => {
                        const IcoC = ico.Icon;
                        return (
                          <button
                            key={ico.key}
                            type="button"
                            className={`h-6 w-6 rounded flex items-center justify-center ${tag.icon === ico.key ? "bg-muted" : ""}`}
                            title={ico.label}
                            aria-label={ico.label}
                            onClick={() => handleUpdateIcon(tag.id, ico.key)}
                          >
                            <IcoC className="h-3.5 w-3.5" />
                          </button>
                        );
                      })}
                      <button
                        type="button"
                        className="ml-0.5 text-muted-foreground hover:text-foreground"
                        title="Close icon picker"
                        aria-label="Close icon picker"
                        onClick={() => setEditingIcon(null)}
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      className="flex h-6 w-6 items-center justify-center rounded border border-hairline hover:bg-muted"
                      title={iconInfo.label}
                      aria-label={iconInfo.label}
                      onClick={() => setEditingIcon(tag.id)}
                    >
                      <IconC className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>

                {/* Delete button */}
                <button
                  type="button"
                  className="ml-auto rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                  title="Delete tag"
                  aria-label={`Delete tag "${tag.name}"`}
                  onClick={() => handleDelete(tag.id)}
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default TagSettings;
