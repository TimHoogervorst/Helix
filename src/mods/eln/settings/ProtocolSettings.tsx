import { useState, useEffect, useCallback } from "react";
import { get, post, put, del } from "../../../core/api/client";
import type { Protocol, ProtocolItem } from "../types";
import ProtocolMasterPanel from "./ProtocolMasterPanel";
import ProtocolDetailPanel from "./ProtocolDetailPanel";

/**
 * Shared helper — applies a mutation to the dirty-edit copy of the
 * currently selected protocol.  Guards against no-selection and
 * missing-entry cases so each handler stays a one-liner.
 */
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

  // ── Shared dirty-edit helper ──────────────────────────────────────────
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

  // ── Create ──
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

  // ── Delete (soft-delete) ──
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

  // ── Select a protocol → open detail panel & start editing ──
  const handleSelect = (protocol: Protocol) => {
    if (selectedId === protocol.id) {
      setSelectedId(null);
    } else {
      setSelectedId(protocol.id);
      setDirtyEdits((prev) => {
        if (prev.has(protocol.id)) return prev;
        const next = new Map(prev);
        next.set(protocol.id, {
          ...protocol,
          items: protocol.items.map((item) => ({ ...item })),
        });
        return next;
      });
    }
  };

  // ── Name editing ──
  const handleNameChange = (name: string) => {
    updateEditingProtocol((p) => ({ ...p, name }));
  };

  // ── Item editing ──
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

  // ── Discard edits for the selected protocol ──
  const handleDiscardEdits = () => {
    if (selectedId === null) return;
    setDirtyEdits((prev) => {
      const next = new Map(prev);
      next.delete(selectedId);
      return next;
    });
  };

  // ── Save all dirty protocols ──
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

  if (loading) return <p className="empty">Loading…</p>;

  const selectedProtocol = selectedId
    ? protocols.find((p) => p.id === selectedId) ?? null
    : null;
  const editingProtocol = selectedId
    ? dirtyEdits.get(selectedId)
    : undefined;
  const dirtyCount = dirtyEdits.size;
  const dirtyIds = new Set(dirtyEdits.keys());

  return (
    <div
      className={`page settings-page${selectedProtocol ? " has-detail" : ""}`}
    >
      {error && <div className="error">{error}</div>}

      {/* Save button bar */}
      <div className="save-bar">
        <button
          className="save-all-btn"
          onClick={saveAllChanges}
          disabled={saving || dirtyCount === 0}
        >
          {saving ? "Saving…" : `Save Changes (${dirtyCount})`}
        </button>
      </div>

      {/* Master–Detail Layout */}
      <div
        className={`settings-master-detail ${selectedProtocol ? "has-detail" : ""}`}
      >
        <ProtocolMasterPanel
          protocols={protocols}
          selectedId={selectedId}
          onSelect={handleSelect}
          showNew={showNew}
          onToggleNew={() => setShowNew(!showNew)}
          newName={newName}
          onNewNameChange={setNewName}
          onCreate={handleCreate}
          saving={saving}
          dirtyIds={dirtyIds}
        />

        {selectedProtocol && editingProtocol && (
          <ProtocolDetailPanel
            liveProtocol={selectedProtocol}
            editingProtocol={editingProtocol}
            isDirty={dirtyEdits.has(selectedProtocol.id)}
            onClose={() => setSelectedId(null)}
            onDelete={handleDelete}
            onNameChange={handleNameChange}
            onAddItem={handleAddItem}
            onUpdateItem={handleUpdateItem}
            onRemoveItem={handleRemoveItem}
            onMoveItem={handleMoveItem}
            onDiscard={handleDiscardEdits}
          />
        )}
      </div>
    </div>
  );
}

export default ProtocolSettings;
