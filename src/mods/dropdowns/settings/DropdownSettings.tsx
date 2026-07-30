import { useState, useEffect, useCallback } from "react";
import { ListPlus, Trash2, Plus, X } from "lucide-react";
import {
  listDropdowns,
  createDropdown,
  updateDropdown,
  deleteDropdown,
} from "../api";
import { deriveDropdownColor } from "../colourUtils";
import type { Dropdown } from "../types";

/** Colour swatch dot rendered next to each option. */
function OptionColorDot({ value }: { value: string }) {
  const color = deriveDropdownColor(value);
  return (
    <span
      className="inline-block h-3 w-3 flex-shrink-0 rounded-full border border-hairline"
      style={{ backgroundColor: color.bg }}
      title={color.hex}
    />
  );
}

function DropdownSettings() {
  const [dropdowns, setDropdowns] = useState<Dropdown[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // ── New dropdown form ──
  const [showNew, setShowNew] = useState(false);
  const [newName, setNewName] = useState("");
  const [newOptions, setNewOptions] = useState<string[]>([""]);

  // ── Editing state ──
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editName, setEditName] = useState("");
  const [editOptions, setEditOptions] = useState<string[]>([""]);

  const fetchDropdowns = useCallback(async () => {
    try {
      const data = await listDropdowns();
      setDropdowns(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load dropdowns");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDropdowns();
  }, [fetchDropdowns]);

  // ── Create ───────────────────────────────────────────────────────────

  const handleCreate = async () => {
    if (!newName.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const options = newOptions.map((o) => o.trim()).filter(Boolean);
      await createDropdown(newName.trim(), options);
      setShowNew(false);
      setNewName("");
      setNewOptions([""]);
      await fetchDropdowns();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create dropdown");
    } finally {
      setSaving(false);
    }
  };

  // ── Edit ─────────────────────────────────────────────────────────────

  const startEditing = (dropdown: Dropdown) => {
    setEditingId(dropdown.id);
    setEditName(dropdown.name);
    setEditOptions(
      dropdown.options.length > 0 ? [...dropdown.options] : [""],
    );
  };

  const cancelEditing = () => {
    setEditingId(null);
    setEditName("");
    setEditOptions([""]);
  };

  const handleSaveEdit = async () => {
    if (editingId === null || !editName.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const options = editOptions.map((o) => o.trim()).filter(Boolean);
      await updateDropdown(editingId, { name: editName.trim(), options });
      setEditingId(null);
      setEditName("");
      setEditOptions([""]);
      await fetchDropdowns();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save dropdown");
    } finally {
      setSaving(false);
    }
  };

  // ── Option CRUD helpers (in edit form) ───────────────────────────────

  const addOption = () => setEditOptions((prev) => [...prev, ""]);

  const removeOption = (idx: number) => {
    setEditOptions((prev) => {
      if (prev.length <= 1) return prev;
      return prev.filter((_, i) => i !== idx);
    });
  };

  const updateOption = (idx: number, value: string) => {
    setEditOptions((prev) => prev.map((o, i) => (i === idx ? value : o)));
  };

  // Same for new form
  const addNewOption = () => setNewOptions((prev) => [...prev, ""]);
  const removeNewOption = (idx: number) => {
    setNewOptions((prev) => {
      if (prev.length <= 1) return prev;
      return prev.filter((_, i) => i !== idx);
    });
  };
  const updateNewOption = (idx: number, value: string) => {
    setNewOptions((prev) => prev.map((o, i) => (i === idx ? value : o)));
  };

  // ── Delete ───────────────────────────────────────────────────────────

  const handleDelete = async (dropdownId: number) => {
    if (!window.confirm("Delete this dropdown? Select columns referencing it will lose their allowed-values validation.")) return;
    try {
      await deleteDropdown(dropdownId);
      setDropdowns((prev) => prev.filter((d) => d.id !== dropdownId));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete dropdown");
    }
  };

  // ── Render ───────────────────────────────────────────────────────────

  if (loading) {
    return <p className="p-6 text-muted-foreground">Loading dropdowns…</p>;
  }

  return (
    <div className="p-6">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Dropdowns</h2>
          <p className="text-sm text-muted-foreground">
            Manage controlled vocabularies for dropdown columns.{" "}
            <span className="italic">
              Option colours are derived automatically from the option text.
            </span>
          </p>
        </div>
        <button
          className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:opacity-90"
          onClick={() => setShowNew(true)}
          disabled={showNew}
        >
          + New Dropdown
        </button>
      </div>

      {error && (
        <div className="mb-4 rounded border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </div>
      )}

      {/* ── New dropdown form ── */}
      {showNew && (
        <div className="mb-6 rounded-md border border-hairline bg-panel p-4">
          <div className="space-y-3">
            <div>
              <label className="mb-1 block text-xs text-muted-foreground">
                Name
              </label>
              <input
                type="text"
                className="!w-64"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder='e.g. "Priority", "Department"'
                autoFocus
              />
            </div>
            <fieldset>
              <legend className="mb-1 text-xs text-muted-foreground">
                Options
              </legend>
              <div className="space-y-2">
                {newOptions.map((opt, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <OptionColorDot value={opt || "(empty)"} />
                    <input
                      type="text"
                      className="!w-48"
                      value={opt}
                      onChange={(e) => updateNewOption(i, e.target.value)}
                      placeholder={`Option ${i + 1}`}
                    />
                    {newOptions.length > 1 && (
                      <button
                        type="button"
                        className="rounded p-1 !border-0 bg-transparent text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                        title="Remove option"
                        onClick={() => removeNewOption(i)}
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
              <button
                type="button"
                className="mt-2 rounded-md border border-hairline px-2 py-1 text-xs text-muted-foreground hover:bg-muted"
                onClick={addNewOption}
              >
                <Plus className="mr-1 inline h-3 w-3" />
                Add option
              </button>
            </fieldset>
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
                  setNewOptions([""]);
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Dropdown list ── */}
      {dropdowns.length === 0 && !showNew ? (
        <p className="text-muted-foreground">
          No dropdowns yet. Create your first dropdown above.
        </p>
      ) : (
        <div className="space-y-2">
          {dropdowns.map((dropdown) => (
            <div
              key={dropdown.id}
              className="rounded-md border border-hairline bg-panel"
              data-testid="dropdown-settings-row"
            >
              {editingId === dropdown.id ? (
                /* ── Edit mode ── */
                <div className="space-y-3 p-4">
                  <div>
                    <label className="mb-1 block text-xs text-muted-foreground">
                      Name
                    </label>
                    <input
                      type="text"
                      className="!w-64"
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      autoFocus
                    />
                  </div>
                  <fieldset>
                    <legend className="mb-1 text-xs text-muted-foreground">
                      Options
                    </legend>
                    <div className="space-y-2">
                      {editOptions.map((opt, i) => (
                        <div key={i} className="flex items-center gap-2">
                          <OptionColorDot value={opt || "(empty)"} />
                          <input
                            type="text"
                            className="!w-48"
                            value={opt}
                            onChange={(e) => updateOption(i, e.target.value)}
                            placeholder={`Option ${i + 1}`}
                          />
                          {editOptions.length > 1 && (
                            <button
                              type="button"
                              className="rounded p-1 !border-0 bg-transparent text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                              title="Remove option"
                              onClick={() => removeOption(i)}
                            >
                              <X className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                    <button
                      type="button"
                      className="mt-2 rounded-md border border-hairline px-2 py-1 text-xs text-muted-foreground hover:bg-muted"
                      onClick={addOption}
                    >
                      <Plus className="mr-1 inline h-3 w-3" />
                      Add option
                    </button>
                  </fieldset>
                  <div className="flex gap-2">
                    <button
                      className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:opacity-90"
                      onClick={handleSaveEdit}
                      disabled={saving || !editName.trim()}
                    >
                      {saving ? "Saving…" : "Save"}
                    </button>
                    <button
                      className="rounded-md border border-hairline px-3 py-1.5 text-sm hover:bg-muted"
                      onClick={cancelEditing}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                /* ── Display mode ── */
                <div className="group flex items-center gap-3 px-4 py-3">
                  <ListPlus className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">
                        {dropdown.name}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        ({dropdown.options.length} option
                        {dropdown.options.length !== 1 ? "s" : ""})
                      </span>
                    </div>
                    {dropdown.options.length > 0 && (
                      <div className="mt-1 flex flex-wrap gap-1">
                        {dropdown.options.map((opt) => {
                          const color = deriveDropdownColor(opt);
                          return (
                            <span
                              key={opt}
                              className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium"
                              style={{
                                backgroundColor: color.bg,
                                color: color.fg,
                              }}
                            >
                              {opt}
                            </span>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {/* Edit button */}
                  <button
                    type="button"
                    className="rounded px-2 py-1 text-xs text-muted-foreground border border-hairline bg-transparent hover:bg-muted transition-colors"
                    onClick={() => startEditing(dropdown)}
                  >
                    Edit
                  </button>

                  {/* Delete button */}
                  <button
                    type="button"
                    className="rounded p-1 !border-0 bg-transparent text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors opacity-0 group-hover:opacity-100"
                    title={`Delete dropdown "${dropdown.name}"`}
                    aria-label={`Delete dropdown "${dropdown.name}"`}
                    onClick={() => handleDelete(dropdown.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default DropdownSettings;
