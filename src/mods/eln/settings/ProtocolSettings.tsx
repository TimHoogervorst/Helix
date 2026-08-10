import { useState, useEffect, useCallback } from "react";
import { FlaskConical, Trash2, X } from "lucide-react";
import { get, post, put, del } from "../../../shell/src/api/client";
import type { Protocol, ProtocolItem } from "../types";
import { Button } from "../../../shell/src/shared/primitives/Button";
import { IconButton } from "../../../shell/src/shared/primitives/IconButton";
import { Input } from "../../../shell/src/shared/primitives/Input";
import { Textarea } from "../../../shell/src/shared/primitives/Input";
import { SettingsPageLayout } from "../../../shell/src/shared/components/SettingsPageLayout";
import { SettingsHeroHeader } from "../../../shell/src/shared/components/SettingsHeroHeader";
import { SettingsSectionCard } from "../../../shell/src/shared/components/SettingsSectionCard";
import {
  SettingsMasterList,
  type MasterListRow,
} from "../../../shell/src/shared/components/SettingsMasterList";

type ProtocolMutator = (protocol: Protocol) => Protocol;

function ProtocolSettings() {
  const [protocols, setProtocols] = useState<Protocol[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [dirtyEdits, setDirtyEdits] = useState<Map<number, Protocol>>(
    new Map(),
  );
  const [saving, setSaving] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [newName, setNewName] = useState("");
  const [filterValue, setFilterValue] = useState("");

  const fetchProtocols = useCallback(async () => {
    try {
      const data = await get<{
        results: Protocol[];
        count: number;
      }>("/eln/protocols/");
      setProtocols(data.results);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchProtocols();
  }, [fetchProtocols]);

  const updateEditingProtocol = (fn: ProtocolMutator) => {
    if (selectedId === null) return;
    setDirtyEdits((prev) => {
      const next = new Map(prev);
      const p = next.get(selectedId);
      if (!p) return prev;
      next.set(
        selectedId,
        fn({
          ...p,
          items: p.items.map((item) => ({ ...item })),
        }),
      );
      return next;
    });
  };

  const handleCreate = async () => {
    if (!newName.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const payload = {
        name: newName.trim(),
        items: [] as ProtocolItem[],
      };
      await post("/eln/protocols/", payload);
      setShowNew(false);
      setNewName("");
      await fetchProtocols();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (protocol: Protocol) => {
    if (!window.confirm(`Deactivate protocol "${protocol.name}"?`)) return;
    try {
      await del(`/eln/protocols/${protocol.id}/`);
      setDirtyEdits((prev) => {
        const next = new Map(prev);
        next.delete(protocol.id);
        return next;
      });
      if (selectedId === protocol.id) setSelectedId(null);
      await fetchProtocols();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete");
    }
  };

  const handleSelect = (id: string | number) => {
    const protocolId = Number(id);
    if (selectedId === protocolId) {
      setSelectedId(null);
    } else {
      setSelectedId(protocolId);
      setDirtyEdits((prev) => {
        if (prev.has(protocolId)) return prev;
        const protocol = protocols.find((p) => p.id === protocolId);
        if (!protocol) return prev;
        const next = new Map(prev);
        next.set(protocolId, {
          ...protocol,
          items: protocol.items.map((item) => ({ ...item })),
        });
        return next;
      });
    }
  };

  const handleNameChange = (name: string) => {
    updateEditingProtocol((p) => ({ ...p, name }));
  };

  const handleAddItem = (type: "step" | "note") => {
    updateEditingProtocol((p) => ({
      ...p,
      items: [...p.items, { type, text: "" }],
    }));
  };

  const handleUpdateItem = (
    index: number,
    field: keyof ProtocolItem,
    value: string,
  ) => {
    updateEditingProtocol((p) => {
      const items = [...p.items];
      items[index] = { ...items[index], [field]: value };
      return { ...p, items };
    });
  };

  const handleRemoveItem = (index: number) => {
    updateEditingProtocol((p) => ({
      ...p,
      items: p.items.filter((_, i) => i !== index),
    }));
  };

  const handleMoveItem = (index: number, direction: "up" | "down") => {
    updateEditingProtocol((p) => {
      const items = [...p.items];
      const target = direction === "up" ? index - 1 : index + 1;
      if (target < 0 || target >= items.length) return p;
      [items[index], items[target]] = [items[target], items[index]];
      return { ...p, items };
    });
  };

  const saveAllChanges = async () => {
    if (dirtyEdits.size === 0) return;
    setSaving(true);
    setError(null);
    let failed = 0;
    for (const [, p] of dirtyEdits) {
      try {
        const payload = {
          name: p.name,
          items: p.items,
        };
        await put(`/eln/protocols/${p.id}/`, payload);
      } catch {
        failed++;
      }
    }
    setDirtyEdits(new Map());
    await fetchProtocols();
    if (failed > 0) {
      setError(
        `Failed to save ${failed} protocol${failed > 1 ? "s" : ""}`,
      );
    }
    setSaving(false);
  };

  const discardAllEdits = () => {
    setDirtyEdits(new Map());
  };

  const filteredProtocols = filterValue
    ? protocols.filter((p) =>
        p.name.toLowerCase().includes(filterValue.toLowerCase()),
      )
    : protocols;

  const itemCount = (p: Protocol) => p.items.length;

  const masterRows: MasterListRow[] = filteredProtocols.map((p) => ({
    id: p.id,
    label: p.name,
    secondary: `${itemCount(p)} item${itemCount(p) !== 1 ? "s" : ""}`,
    dirty: dirtyEdits.has(p.id),
    icon: <FlaskConical size={13} />,
  }));

  const selectedProtocol = selectedId
    ? protocols.find((p) => p.id === selectedId) ?? null
    : null;
  const editingProtocol = selectedId
    ? dirtyEdits.get(selectedId)
    : undefined;
  const dirtyCount = dirtyEdits.size;

  if (loading) return <p className="empty">Loading…</p>;

  return (
    <SettingsPageLayout
      hero={
        <>
          <SettingsHeroHeader
            eyebrow="protocols"
            title="Protocol settings"
            description="Define reusable protocol templates. Each protocol contains an ordered list of steps and notes that can be inserted into entries."
            actions={
              <Button
                size="sm"
                onClick={() => setShowNew(!showNew)}
              >
                {showNew ? "Cancel" : "+ New Protocol"}
              </Button>
            }
          />

          {showNew && (
            <div className="mb-6 rounded-lg border border-[var(--color-ink-hairline)] bg-[var(--color-card)] p-4">
              <div className="flex flex-wrap items-end gap-4">
                <label className="flex flex-col gap-1">
                  <span className="text-xs text-[var(--color-ink-muted-foreground)]">Name</span>
                  <Input
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    placeholder="e.g., CRISPR RNP Transfection"
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleCreate();
                    }}
                  />
                </label>
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
                    onClick={() => setShowNew(false)}
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
              {dirtyCount} protocol{dirtyCount !== 1 ? "s" : ""} with unsaved
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
            filterPlaceholder="Filter protocols"
          />
          {masterRows.length === 0 && (
            <p className="px-3 py-2 text-xs text-[var(--color-ink-muted-foreground)]">
              No protocols found.
            </p>
          )}
        </div>

        <div className="flex-1 space-y-4 p-6">
          {selectedProtocol && editingProtocol ? (
            <>
              <SettingsSectionCard
                title="Protocol identity"
                subtitle={selectedProtocol.is_active ? "Active" : "Inactive"}
                actions={
                  <div className="flex items-center gap-1">
                    {selectedProtocol.is_active && (
                      <IconButton
                        aria-label="Deactivate protocol"
                        title="Deactivate protocol"
                        onClick={() => handleDelete(selectedProtocol)}
                      >
                        <Trash2 size={14} />
                      </IconButton>
                    )}
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
                      value={editingProtocol.name}
                      onChange={(e) => handleNameChange(e.target.value)}
                      placeholder="Protocol name"
                    />
                  </label>
                  <div className="grid grid-cols-3 gap-4">
                    <div className="flex flex-col gap-0.5">
                      <span className="text-xs font-medium text-[var(--color-ink-muted-foreground)]">
                        Status
                      </span>
                      <span className="text-sm text-[var(--color-ink)]">
                        {selectedProtocol.is_active ? "Active" : "Inactive"}
                      </span>
                    </div>
                    <div className="flex flex-col gap-0.5">
                      <span className="text-xs font-medium text-[var(--color-ink-muted-foreground)]">
                        Items
                      </span>
                      <span className="text-sm text-[var(--color-ink)]">
                        {editingProtocol.items.length}
                      </span>
                    </div>
                    <div className="flex flex-col gap-0.5">
                      <span className="text-xs font-medium text-[var(--color-ink-muted-foreground)]">
                        Updated
                      </span>
                      <span className="text-sm text-[var(--color-ink)]">
                        {new Date(selectedProtocol.updated_at).toLocaleDateString()}
                      </span>
                    </div>
                  </div>
                </div>
              </SettingsSectionCard>

              <SettingsSectionCard
                flush
                title="Items"
                subtitle={`${editingProtocol.items.length} item${editingProtocol.items.length !== 1 ? "s" : ""}`}
                actions={
                  <div className="flex items-center gap-2">
                    <Button variant="ghost" size="sm" onClick={() => handleAddItem("step")}>
                      + Step
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => handleAddItem("note")}>
                      + Note
                    </Button>
                  </div>
                }
              >
                <div className="px-4 pb-4">
                  {editingProtocol.items.length === 0 && (
                    <p className="py-4 text-center text-xs text-[var(--color-ink-muted-foreground)]">
                      No items yet. Add a step or note to get started.
                    </p>
                  )}

                  <ol style={{ listStyle: "none", padding: 0, margin: 0 }}>
                    {editingProtocol.items.map((item, i) => (
                      <li
                        key={i}
                        className="flex items-start gap-2 border-b border-[var(--color-ink-hairline)] px-3 py-2 last:border-b-0"
                      >
                        <span
                          className="mt-1 shrink-0 rounded px-1.5 py-0.5 text-2xs font-semibold uppercase tracking-wider text-white"
                          style={{
                            backgroundColor:
                              item.type === "step"
                                ? "var(--color-accent, #3b82f6)"
                                : "var(--color-surface-hover, #6b7280)",
                          }}
                        >
                          {item.type}
                        </span>

                        <Input
                          className="min-w-0 flex-1 bg-transparent py-0.5 text-[var(--color-ink)]"
                          value={item.text}
                          onChange={(e) =>
                            handleUpdateItem(i, "text", e.target.value)
                          }
                          placeholder={
                            item.type === "step"
                              ? "Step description…"
                              : "Note text…"
                          }
                        />

                        <div className="flex shrink-0 items-center gap-0.5">
                          <button
                            type="button"
                            className="rounded border-transparent bg-transparent px-1 py-0.5 text-2xs text-[var(--color-ink-muted-foreground)] transition-colors hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-ink)] disabled:opacity-30"
                            onClick={() => handleMoveItem(i, "up")}
                            disabled={i === 0}
                            title="Move up"
                          >
                            ↑
                          </button>
                          <button
                            type="button"
                            className="rounded border-transparent bg-transparent px-1 py-0.5 text-2xs text-[var(--color-ink-muted-foreground)] transition-colors hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-ink)] disabled:opacity-30"
                            onClick={() => handleMoveItem(i, "down")}
                            disabled={i === editingProtocol.items.length - 1}
                            title="Move down"
                          >
                            ↓
                          </button>
                          <button
                            type="button"
                            className="rounded border-transparent bg-transparent px-1 py-0.5 text-2xs text-[var(--color-warning)] transition-colors hover:bg-[var(--color-surface-hover)]/50"
                            onClick={() => handleRemoveItem(i)}
                            title="Remove item"
                          >
                            ×
                          </button>
                        </div>
                      </li>
                    ))}
                  </ol>


                </div>
              </SettingsSectionCard>
            </>
          ) : (
            <div className="flex h-full items-center justify-center text-sm text-[var(--color-ink-muted-foreground)]">
              Select a protocol from the list to view or edit its details.
            </div>
          )}
        </div>
      </div>
    </SettingsPageLayout>
  );
}

export default ProtocolSettings;
