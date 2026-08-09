import { useState, useEffect, useCallback } from "react";
import { List, Trash2, Plus, X } from "lucide-react";
import {
  listDropdowns,
  createDropdown,
  updateDropdown,
  deleteDropdown,
} from "../api";
import { deriveDropdownColor } from "../colourUtils";
import type { Dropdown } from "../types";
import { Button } from "../../../shell/src/shared/primitives/Button";
import { IconButton } from "../../../shell/src/shared/primitives/IconButton";
import { Input } from "../../../shell/src/shared/primitives/Input";
import { SettingsPageLayout } from "../../../shell/src/shared/components/SettingsPageLayout";
import { SettingsHeroHeader } from "../../../shell/src/shared/components/SettingsHeroHeader";
import { SettingsSectionCard } from "../../../shell/src/shared/components/SettingsSectionCard";
import {
  SettingsMasterList,
  type MasterListRow,
} from "../../../shell/src/shared/components/SettingsMasterList";

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

type DropdownMutator = (dropdown: Dropdown) => Dropdown;

function DropdownSettings() {
  const [dropdowns, setDropdowns] = useState<Dropdown[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [dirtyEdits, setDirtyEdits] = useState<Map<number, Dropdown>>(
    new Map(),
  );
  const [saving, setSaving] = useState(false);

  const [showNew, setShowNew] = useState(false);
  const [newName, setNewName] = useState("");
  const [newOptions, setNewOptions] = useState<string[]>([""]);
  const [filterValue, setFilterValue] = useState("");

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

  const updateEditingDropdown = (fn: DropdownMutator) => {
    if (selectedId === null) return;
    setDirtyEdits((prev) => {
      const next = new Map(prev);
      const d = next.get(selectedId);
      if (!d) return prev;
      next.set(selectedId, fn({ ...d, options: [...d.options] }));
      return next;
    });
  };

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

  const handleSelect = (id: string | number) => {
    const dropdownId = Number(id);
    if (selectedId === dropdownId) {
      setSelectedId(null);
    } else {
      setSelectedId(dropdownId);
      setDirtyEdits((prev) => {
        if (prev.has(dropdownId)) return prev;
        const dropdown = dropdowns.find((d) => d.id === dropdownId);
        if (!dropdown) return prev;
        const next = new Map(prev);
        next.set(dropdownId, {
          ...dropdown,
          options: [...dropdown.options],
        });
        return next;
      });
    }
  };

  const handleNameChange = (name: string) => {
    updateEditingDropdown((d) => ({ ...d, name }));
  };

  const handleOptionChange = (index: number, value: string) => {
    updateEditingDropdown((d) => {
      const options = [...d.options];
      options[index] = value;
      return { ...d, options };
    });
  };

  const handleAddOption = () => {
    updateEditingDropdown((d) => ({
      ...d,
      options: [...d.options, ""],
    }));
  };

  const handleRemoveOption = (index: number) => {
    updateEditingDropdown((d) => {
      if (d.options.length <= 1) return d;
      return { ...d, options: d.options.filter((_, i) => i !== index) };
    });
  };

  const handleMoveOption = (index: number, direction: "up" | "down") => {
    updateEditingDropdown((d) => {
      const options = [...d.options];
      const target = direction === "up" ? index - 1 : index + 1;
      if (target < 0 || target >= options.length) return d;
      [options[index], options[target]] = [options[target], options[index]];
      return { ...d, options };
    });
  };

  const handleDelete = async () => {
    if (selectedId === null) return;
    const dropdown = dropdowns.find((d) => d.id === selectedId);
    if (!dropdown) return;
    if (
      !window.confirm(
        "Delete this dropdown? Select columns referencing it will lose their allowed-values validation.",
      )
    )
      return;
    try {
      await deleteDropdown(selectedId);
      setDirtyEdits((prev) => {
        const next = new Map(prev);
        next.delete(selectedId);
        return next;
      });
      setSelectedId(null);
      await fetchDropdowns();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete dropdown");
    }
  };

  const saveAllChanges = async () => {
    if (dirtyEdits.size === 0) return;
    setSaving(true);
    setError(null);
    let failed = 0;
    for (const [, d] of dirtyEdits) {
      try {
        await updateDropdown(d.id, {
          name: d.name,
          options: d.options.map((o) => o.trim()).filter(Boolean),
        });
      } catch {
        failed++;
      }
    }
    setDirtyEdits(new Map());
    await fetchDropdowns();
    if (failed > 0) {
      setError(
        `Failed to save ${failed} dropdown${failed > 1 ? "s" : ""}`,
      );
    }
    setSaving(false);
  };

  const discardAllEdits = () => {
    setDirtyEdits(new Map());
  };

  // ── New option helpers ──────────────────────────────────────────────

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

  // ── Master list rows ────────────────────────────────────────────────

  const filteredDropdowns = filterValue
    ? dropdowns.filter((d) =>
        d.name.toLowerCase().includes(filterValue.toLowerCase()),
      )
    : dropdowns;

  const masterRows: MasterListRow[] = filteredDropdowns.map((d) => ({
    id: d.id,
    label: d.name,
    secondary: `${d.options.length} option${d.options.length !== 1 ? "s" : ""}`,
    dirty: dirtyEdits.has(d.id),
    icon: <List size={13} />,
  }));

  const selectedDropdown = selectedId
    ? dropdowns.find((d) => d.id === selectedId) ?? null
    : null;
  const editingDropdown = selectedId
    ? dirtyEdits.get(selectedId)
    : undefined;
  const dirtyCount = dirtyEdits.size;

  if (loading) return <p className="empty">Loading dropdowns…</p>;

  return (
    <SettingsPageLayout
      hero={
        <>
          <SettingsHeroHeader
            eyebrow="controlled vocabularies"
            title="Dropdowns"
            description="Manage controlled vocabularies for dropdown columns. Option colours are derived automatically from the option text."
            actions={
              <Button
                size="sm"
                onClick={() => setShowNew(!showNew)}
              >
                {showNew ? "Cancel" : "+ New Dropdown"}
              </Button>
            }
          />

          {showNew && (
            <div className="mb-6 rounded-lg border border-[var(--color-ink-hairline)] bg-[var(--color-card)] p-4">
              <div className="space-y-3">
                <label className="flex flex-col gap-1">
                  <span className="text-xs text-[var(--color-ink-muted-foreground)]">
                    Name
                  </span>
                  <Input
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    placeholder='e.g. "Priority", "Department"'
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleCreate();
                    }}
                  />
                </label>

                <fieldset>
                  <legend className="mb-1 text-xs text-[var(--color-ink-muted-foreground)]">
                    Options
                  </legend>
                  <div className="space-y-2">
                    {newOptions.map((opt, i) => (
                      <div key={i} className="flex items-center gap-2">
                        <OptionColorDot value={opt || "(empty)"} />
                        <Input
                          value={opt}
                          onChange={(e) =>
                            updateNewOption(i, e.target.value)
                          }
                          placeholder={`Option ${i + 1}`}
                        />
                        {newOptions.length > 1 && (
                          <IconButton
                            aria-label="Remove option"
                            title="Remove option"
                            className="text-[var(--color-ink-muted-foreground)] hover:text-[var(--color-warning)]"
                            onClick={() => removeNewOption(i)}
                          >
                            <X className="h-3.5 w-3.5" />
                          </IconButton>
                        )}
                      </div>
                    ))}
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="mt-2"
                    onClick={addNewOption}
                  >
                    <Plus className="mr-1 h-3 w-3" />
                    Add option
                  </Button>
                </fieldset>

                <div className="flex gap-2">
                  <Button
                    size="sm"
                    onClick={handleCreate}
                    disabled={saving || !newName.trim()}
                  >
                    {saving ? "Creating…" : "Create"}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setShowNew(false);
                      setNewName("");
                      setNewOptions([""]);
                    }}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            </div>
          )}
        </>
      }
      bottomBar={
        dirtyCount > 0 ? (
          <div className="flex items-center justify-between">
            <span className="text-xs text-[var(--color-ink-muted-foreground)]">
              {dirtyCount} dropdown{dirtyCount !== 1 ? "s" : ""} with unsaved
              changes
            </span>
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="sm" onClick={discardAllEdits}>
                Discard Changes
              </Button>
              <Button
                size="sm"
                onClick={saveAllChanges}
                disabled={saving}
              >
                {saving ? "Saving…" : `Save Changes (${dirtyCount})`}
              </Button>
            </div>
          </div>
        ) : undefined
      }
    >
      {error && (
        <div className="mb-4 rounded-md border border-[var(--color-warning)]/30 bg-[var(--color-warning)]/10 px-4 py-2.5 text-sm text-[var(--color-warning)]">
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
            filterPlaceholder="Filter dropdowns"
          />
          {masterRows.length === 0 && (
            <p className="px-3 py-2 text-xs text-[var(--color-ink-muted-foreground)]">
              No dropdowns found.
            </p>
          )}
        </div>

        <div className="flex-1 space-y-4 p-6">
          {selectedDropdown && editingDropdown ? (
            <>
              <SettingsSectionCard
                title="Dropdown identity"
                subtitle={`#${selectedDropdown.id}`}
                actions={
                  <div className="flex items-center gap-1">
                    <IconButton
                      aria-label="Delete dropdown"
                      title="Delete dropdown"
                      onClick={handleDelete}
                      className="text-[var(--color-ink-muted-foreground)] hover:text-[var(--color-warning)]"
                    >
                      <Trash2 size={14} />
                    </IconButton>
                    <IconButton
                      aria-label="Close detail"
                      title="Close detail"
                      onClick={() => setSelectedId(null)}
                    >
                      <X size={14} />
                    </IconButton>
                  </div>
                }
              >
                <div className="space-y-3">
                  <label className="block">
                    <span className="text-xs font-medium text-[var(--color-ink-muted-foreground)]">
                      Name
                    </span>
                    <Input
                      value={editingDropdown.name}
                      onChange={(e) => handleNameChange(e.target.value)}
                      placeholder="Dropdown name"
                    />
                  </label>
                  <div className="grid grid-cols-3 gap-4">
                    <div className="flex flex-col gap-0.5">
                      <span className="text-xs font-medium text-[var(--color-ink-muted-foreground)]">
                        Options
                      </span>
                      <span className="text-sm text-[var(--color-ink)]">
                        {editingDropdown.options.length}
                      </span>
                    </div>
                    <div className="flex flex-col gap-0.5">
                      <span className="text-xs font-medium text-[var(--color-ink-muted-foreground)]">
                        Created
                      </span>
                      <span className="text-sm text-[var(--color-ink)]">
                        {new Date(
                          selectedDropdown.created_at,
                        ).toLocaleDateString()}
                      </span>
                    </div>
                    <div className="flex flex-col gap-0.5">
                      <span className="text-xs font-medium text-[var(--color-ink-muted-foreground)]">
                        Updated
                      </span>
                      <span className="text-sm text-[var(--color-ink)]">
                        {new Date(
                          selectedDropdown.updated_at,
                        ).toLocaleDateString()}
                      </span>
                    </div>
                  </div>
                  {dirtyEdits.has(selectedDropdown.id) && (
                    <div className="rounded-md border border-[var(--color-primary)]/20 bg-[var(--color-primary)]/5 px-3 py-1.5 text-xs text-[var(--color-primary)]">
                      Unsaved changes — review and save when ready.
                    </div>
                  )}
                </div>
              </SettingsSectionCard>

              <SettingsSectionCard
                flush
                title="Options"
                subtitle={`${editingDropdown.options.length} option${editingDropdown.options.length !== 1 ? "s" : ""}`}
                actions={
                  <Button variant="ghost" size="sm" onClick={handleAddOption}>
                    + Add Option
                  </Button>
                }
              >
                <div className="px-4 pb-4">
                  {editingDropdown.options.length === 0 && (
                    <p className="py-4 text-center text-xs text-[var(--color-ink-muted-foreground)]">
                      No options yet. Add an option to get started.
                    </p>
                  )}

                  <div style={{ listStyle: "none", padding: 0, margin: 0 }}>
                    {editingDropdown.options.map((opt, i) => {
                      const color = deriveDropdownColor(opt || "(empty)");
                      return (
                        <div
                          key={i}
                          className="flex items-center gap-2 border-b border-[var(--color-ink-hairline)] px-3 py-2 last:border-b-0"
                        >
                          <OptionColorDot value={opt || "(empty)"} />
                          <Input
                            className="min-w-0 flex-1 bg-transparent py-0.5 text-[var(--color-ink)]"
                            value={opt}
                            onChange={(e) =>
                              handleOptionChange(i, e.target.value)
                            }
                            placeholder={`Option ${i + 1}`}
                          />
                          <div className="flex shrink-0 items-center gap-0.5">
                            <IconButton
                              aria-label="Move up"
                              title="Move up"
                              className="h-5 w-5 text-2xs text-[var(--color-ink-muted-foreground)] disabled:opacity-30"
                              onClick={() => handleMoveOption(i, "up")}
                              disabled={i === 0}
                            >
                              ↑
                            </IconButton>
                            <IconButton
                              aria-label="Move down"
                              title="Move down"
                              className="h-5 w-5 text-2xs text-[var(--color-ink-muted-foreground)] disabled:opacity-30"
                              onClick={() => handleMoveOption(i, "down")}
                              disabled={
                                i === editingDropdown.options.length - 1
                              }
                            >
                              ↓
                            </IconButton>
                            {editingDropdown.options.length > 1 && (
                              <IconButton
                                aria-label="Remove option"
                                title="Remove option"
                                className="h-5 w-5 text-2xs text-[var(--color-warning)]"
                                onClick={() => handleRemoveOption(i)}
                              >
                                ×
                              </IconButton>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </SettingsSectionCard>
            </>
          ) : (
            <div className="flex h-full items-center justify-center text-sm text-[var(--color-ink-muted-foreground)]">
              Select a dropdown from the list to view or edit its details.
            </div>
          )}
        </div>
      </div>
    </SettingsPageLayout>
  );
}

export default DropdownSettings;
