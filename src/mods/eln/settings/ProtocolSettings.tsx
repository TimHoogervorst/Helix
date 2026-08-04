import { useState, useEffect, useCallback } from "react";
import { FlaskConical, Trash2, X } from "lucide-react";
import { get, post, put, del } from "../../../shell/src/api/client";
import type { Protocol, ProtocolItem } from "../types";
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

  const handleDiscardEdits = () => {
    if (selectedId === null) return;
    setDirtyEdits((prev) => {
      const next = new Map(prev);
      next.delete(selectedId);
      return next;
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
              <button
                type="button"
                className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90"
                onClick={() => setShowNew(!showNew)}
              >
                {showNew ? "Cancel" : "+ New Protocol"}
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
                    placeholder="e.g., CRISPR RNP Transfection"
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleCreate();
                    }}
                  />
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
                    onClick={() => setShowNew(false)}
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
              {dirtyCount} protocol{dirtyCount !== 1 ? "s" : ""} with unsaved
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
            filterPlaceholder="Filter protocols"
          />
          {masterRows.length === 0 && (
            <p className="px-3 py-2 text-xs text-muted-foreground">
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
                      <button
                        type="button"
                        className="rounded border-transparent bg-transparent p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-warn"
                        onClick={() => handleDelete(selectedProtocol)}
                        title="Deactivate protocol"
                      >
                        <Trash2 size={14} />
                      </button>
                    )}
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
                      value={editingProtocol.name}
                      onChange={(e) => handleNameChange(e.target.value)}
                      placeholder="Protocol name"
                    />
                  </label>
                  <div className="grid grid-cols-3 gap-4">
                    <div className="flex flex-col gap-0.5">
                      <span className="text-[11px] font-medium text-muted-foreground">
                        Status
                      </span>
                      <span className="text-sm text-foreground">
                        {selectedProtocol.is_active ? "Active" : "Inactive"}
                      </span>
                    </div>
                    <div className="flex flex-col gap-0.5">
                      <span className="text-[11px] font-medium text-muted-foreground">
                        Items
                      </span>
                      <span className="text-sm text-foreground">
                        {editingProtocol.items.length}
                      </span>
                    </div>
                    <div className="flex flex-col gap-0.5">
                      <span className="text-[11px] font-medium text-muted-foreground">
                        Updated
                      </span>
                      <span className="text-sm text-foreground">
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
                    <button
                      type="button"
                      className="rounded-md border-transparent bg-transparent px-2 py-1 text-[11px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                      onClick={() => handleAddItem("step")}
                    >
                      + Step
                    </button>
                    <button
                      type="button"
                      className="rounded-md border-transparent bg-transparent px-2 py-1 text-[11px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                      onClick={() => handleAddItem("note")}
                    >
                      + Note
                    </button>
                  </div>
                }
              >
                <div className="px-4 pb-4">
                  {editingProtocol.items.length === 0 && (
                    <p className="py-4 text-center text-xs text-muted-foreground">
                      No items yet. Add a step or note to get started.
                    </p>
                  )}

                  <ol style={{ listStyle: "none", padding: 0, margin: 0 }}>
                    {editingProtocol.items.map((item, i) => (
                      <li
                        key={i}
                        className="flex items-start gap-2 border-b border-hairline px-3 py-2 last:border-b-0"
                      >
                        <span
                          className="mt-1 shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-white"
                          style={{
                            backgroundColor:
                              item.type === "step"
                                ? "var(--color-accent, #3b82f6)"
                                : "var(--color-muted, #6b7280)",
                          }}
                        >
                          {item.type}
                        </span>

                        <input
                          type="text"
                          className="min-w-0 flex-1 bg-transparent py-0.5 text-[13px] text-foreground placeholder:text-muted-foreground outline-none"
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
                            className="rounded border-transparent bg-transparent px-1 py-0.5 text-[10px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-30"
                            onClick={() => handleMoveItem(i, "up")}
                            disabled={i === 0}
                            title="Move up"
                          >
                            ↑
                          </button>
                          <button
                            type="button"
                            className="rounded border-transparent bg-transparent px-1 py-0.5 text-[10px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-30"
                            onClick={() => handleMoveItem(i, "down")}
                            disabled={i === editingProtocol.items.length - 1}
                            title="Move down"
                          >
                            ↓
                          </button>
                          <button
                            type="button"
                            className="rounded border-transparent bg-transparent px-1 py-0.5 text-[10px] text-warn transition-colors hover:bg-muted/50"
                            onClick={() => handleRemoveItem(i)}
                            title="Remove item"
                          >
                            ×
                          </button>
                        </div>
                      </li>
                    ))}
                  </ol>

                  {dirtyEdits.has(selectedProtocol.id) && (
                    <div className="mt-3">
                      <button
                        type="button"
                        className="rounded-md border-transparent bg-transparent px-2 py-1 text-[11px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                        onClick={handleDiscardEdits}
                      >
                        Discard changes
                      </button>
                    </div>
                  )}
                </div>
              </SettingsSectionCard>
            </>
          ) : (
            <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
              Select a protocol from the list to view or edit its details.
            </div>
          )}
        </div>
      </div>
    </SettingsPageLayout>
  );
}

export default ProtocolSettings;
