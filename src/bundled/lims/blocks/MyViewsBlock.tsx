import { useState, useEffect, useCallback, useRef } from "react";
import { createPortal } from "react-dom";
import { useSearchParams, useNavigate } from "react-router-dom";
import { Save, Trash2, Pencil, Globe, Lock } from "lucide-react";
import type { BlockComponentProps } from "../../../shell/src/mod-system/types";
import type { LimsViewItem, ViewFilterState } from "../types";
import {
  getMyViews,
  createView,
  updateView,
  deleteView,
} from "../hub/api";

// ── Helpers ──────────────────────────────────────────────────────────────

/** Read the current filter state from URL params + localStorage. */
function readFilterState(
  searchParams: URLSearchParams,
): ViewFilterState {
  const columnsRaw = searchParams.get("columns") || "";
  let viewMode: "list" | "compact" = "list";
  try {
    const stored = localStorage.getItem("helix-entities-view-mode");
    if (stored === "list" || stored === "compact") {
      viewMode = stored;
    }
  } catch {
    // localStorage unavailable
  }

  return {
    search: searchParams.get("search") || "",
    schema_type: searchParams.get("schema_type") || "",
    schema: searchParams.get("schema") || "",
    status: searchParams.get("status") || "",
    sort: searchParams.get("sort") || "",
    fields: searchParams.getAll("f"),
    columns: columnsRaw ? columnsRaw.split(",").filter(Boolean) : [],
    viewMode,
  };
}

/** Build a full /entities?… URL from a filter state object. */
function buildViewURL(state: ViewFilterState): string {
  const params = new URLSearchParams();
  if (state.search) params.set("search", state.search);
  if (state.schema_type) params.set("schema_type", state.schema_type);
  if (state.schema) params.set("schema", state.schema);
  if (state.status) params.set("status", state.status);
  if (state.sort) params.set("sort", state.sort);
  for (const f of state.fields ?? []) {
    params.append("f", f);
  }
  if ((state.columns ?? []).length > 0) {
    params.set("columns", state.columns.join(","));
  }
  // Persist viewMode to localStorage so the filter bar picks it up
  try {
    localStorage.setItem("helix-entities-view-mode", state.viewMode);
  } catch {
    // localStorage unavailable
  }
  const qs = params.toString();
  return `/entities${qs ? `?${qs}` : ""}`;
}

// ── Component ────────────────────────────────────────────────────────────

interface EditingState {
  /** The view id being renamed, or null if not editing any existing view. */
  viewId: number | null;
  /** The current value of the inline name input. */
  name: string;
}

/**
 * My Views sidebar block — CRUD for the current user's saved Views.
 *
 * - Save button at the top captures the current filter state.
 * - Clicking "Save" opens an inline name row; press Enter to save.
 * - Each saved View shows its name and, on hover, a three-dot menu.
 * - Three-dot menu: Rename, Delete, Toggle Public/Private.
 * - Clicking a View navigates to its constructed URL.
 */
export function MyViewsBlock(_props: BlockComponentProps) {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const [views, setViews] = useState<LimsViewItem[]>([]);
  const [loading, setLoading] = useState(true);

  // ── Save mode — whether the inline "new view name" row is visible ────
  const [isAdding, setIsAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [saving, setSaving] = useState(false);
  const newInputRef = useRef<HTMLInputElement>(null);

  // ── Editing state — which view is being renamed ──────────────────────
  const [editing, setEditing] = useState<EditingState | null>(null);
  const editInputRef = useRef<HTMLInputElement>(null);

  // ── Three-dot menu open state ────────────────────────────────────────
  const [menuViewId, setMenuViewId] = useState<number | null>(null);
  const [menuPosition, setMenuPosition] = useState<{ top: number; left: number } | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // ── Fetch views on mount ─────────────────────────────────────────────
  const fetchViews = useCallback(async () => {
    try {
      const data = await getMyViews();
      setViews(data);
    } catch {
      // Silently fail — sidebar stays empty
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchViews();
  }, [fetchViews]);

  // ── Focus new-input when adding starts ───────────────────────────────
  useEffect(() => {
    if (isAdding && newInputRef.current) {
      newInputRef.current.focus();
    }
  }, [isAdding]);

  // ── Focus edit-input when editing starts ─────────────────────────────
  useEffect(() => {
    if (editing && editInputRef.current) {
      editInputRef.current.focus();
      editInputRef.current.select();
    }
  }, [editing]);

  // ── Close menu on outside click ──────────────────────────────────────
  useEffect(() => {
    if (menuViewId === null) return;
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuViewId(null);
        setMenuPosition(null);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [menuViewId]);

  // ── Save handlers ────────────────────────────────────────────────────
  const handleStartAdd = useCallback(() => {
    setIsAdding(true);
    setNewName("");
  }, []);

  const handleCancelAdd = useCallback(() => {
    setIsAdding(false);
    setNewName("");
  }, []);

  const handleSaveNew = useCallback(async () => {
    const trimmed = newName.trim();
    if (!trimmed) return;
    setSaving(true);
    try {
      const filterState = readFilterState(searchParams);
      const created = await createView({ name: trimmed, filter_state: filterState });
      setViews((prev) => [created, ...prev]);
      setIsAdding(false);
      setNewName("");
    } catch {
      // Silently fail
    } finally {
      setSaving(false);
    }
  }, [newName, searchParams]);

  // ── Edit / rename handlers ───────────────────────────────────────────
  const handleStartRename = useCallback((view: LimsViewItem) => {
    setMenuViewId(null);
    setEditing({ viewId: view.id, name: view.name });
  }, []);

  const handleCancelRename = useCallback(() => {
    setEditing(null);
  }, []);

  const handleSaveRename = useCallback(async () => {
    if (!editing) return;
    const trimmed = editing.name.trim();
    if (!trimmed) return;
    try {
      const updated = await updateView(editing.viewId, { name: trimmed });
      setViews((prev) =>
        prev.map((v) => (v.id === updated.id ? updated : v)),
      );
    } catch {
      // Silently fail
    } finally {
      setEditing(null);
    }
  }, [editing]);

  // ── Delete handler ───────────────────────────────────────────────────
  const handleDelete = useCallback(
    async (view: LimsViewItem) => {
      setMenuViewId(null);
      if (!window.confirm(`Delete view "${view.name}"?`)) return;
      try {
        await deleteView(view.id);
        setViews((prev) => prev.filter((v) => v.id !== view.id));
      } catch {
        // Silently fail
      }
    },
    [],
  );

  // ── Overwrite filters ────────────────────────────────────────────────
  const handleOverwrite = useCallback(
    async (view: LimsViewItem) => {
      setMenuViewId(null);
      try {
        const filterState = readFilterState(searchParams);
        const updated = await updateView(view.id, { filter_state: filterState });
        setViews((prev) =>
          prev.map((v) => (v.id === updated.id ? updated : v)),
        );
      } catch {
        // Silently fail
      }
    },
    [searchParams],
  );

  // ── Toggle public / private ──────────────────────────────────────────
  const handleTogglePublic = useCallback(async (view: LimsViewItem) => {
    setMenuViewId(null);
    try {
      const updated = await updateView(view.id, {
        is_public: !view.is_public,
      });
      setViews((prev) =>
        prev.map((v) => (v.id === updated.id ? updated : v)),
      );
    } catch {
      // Silently fail
    }
  }, []);

  // ── Click view → navigate ────────────────────────────────────────────
  const handleClickView = useCallback(
    (view: LimsViewItem) => {
      navigate(buildViewURL(view.filter_state));
    },
    [navigate],
  );

  // ── Keyboard: Enter on new name input ────────────────────────────────
  const handleNewKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter") {
        handleSaveNew();
      } else if (e.key === "Escape") {
        handleCancelAdd();
      }
    },
    [handleSaveNew, handleCancelAdd],
  );

  // ── Keyboard: Enter on edit name input ───────────────────────────────
  const handleEditKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter") {
        handleSaveRename();
      } else if (e.key === "Escape") {
        handleCancelRename();
      }
    },
    [handleSaveRename, handleCancelRename],
  );

  // ── Render ───────────────────────────────────────────────────────────
  const openView = menuViewId !== null ? views.find((v) => v.id === menuViewId) : null;

  return (
    <>
    <div className="entities-views-block">
      {/* ── Save button ──────────────────────────────────────────────── */}
      <div className="entities-views-save-row">
        <button
          className="entities-views-save-btn"
          type="button"
          title="Save current view"
          onClick={handleStartAdd}
          disabled={isAdding}
        >
          <Save size={14} />
          <span>Save current view</span>
        </button>
      </div>

      {/* ── Inline new-view name row ─────────────────────────────────── */}
      {isAdding && (
        <div className="entities-views-new-row">
          <input
            ref={newInputRef}
            className="entities-views-name-input"
            type="text"
            placeholder="View name…"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={handleNewKeyDown}
            disabled={saving}
          />
          <div className="entities-views-new-actions">
            <button
              className="entities-views-action-btn is-save"
              type="button"
              onClick={handleSaveNew}
              disabled={saving || !newName.trim()}
            >
              Save
            </button>
            <button
              className="entities-views-action-btn is-cancel"
              type="button"
              onClick={handleCancelAdd}
              disabled={saving}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* ── View list ────────────────────────────────────────────────── */}
      {loading ? (
        <ul className="entities-sidebar-views">
          <li className="entities-sidebar-view-item is-empty">Loading…</li>
        </ul>
      ) : views.length === 0 && !isAdding ? (
        <ul className="entities-sidebar-views">
          <li className="entities-sidebar-view-item is-empty">
            No saved views yet.
          </li>
        </ul>
      ) : (
        <ul className="entities-sidebar-views">
          {views.map((view) => (
            <li
              key={view.id}
              className="entities-sidebar-view-item"
            >
              {editing?.viewId === view.id ? (
                /* ── Inline rename row ── */
                <div className="entities-views-edit-row">
                  <input
                    ref={editInputRef}
                    className="entities-views-name-input"
                    type="text"
                    value={editing.name}
                    onChange={(e) =>
                      setEditing({ ...editing, name: e.target.value })
                    }
                    onKeyDown={handleEditKeyDown}
                  />
                  <div className="entities-views-new-actions">
                    <button
                      className="entities-views-action-btn is-save"
                      type="button"
                      onClick={handleSaveRename}
                      disabled={!editing.name.trim()}
                    >
                      Save
                    </button>
                    <button
                      className="entities-views-action-btn is-cancel"
                      type="button"
                      onClick={handleCancelRename}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                /* ── Normal row ── */
                <>
                  <button
                    className="entities-views-item-name"
                    type="button"
                    onClick={() => handleClickView(view)}
                    title={`Load view: ${view.name}`}
                  >
                    {view.name}
                    {view.is_public && (
                      <Globe size={11} className="entities-views-public-icon" />
                    )}
                  </button>

                  {/* ── Three-dot menu ── */}
                  <div className="entities-views-menu-wrap" ref={menuViewId === view.id ? menuRef : undefined}>
                    <button
                      className="entities-views-menu-trigger"
                      type="button"
                      title="View actions"
                      onClick={(e) => {
                        e.stopPropagation();
                        if (menuViewId === view.id) {
                          setMenuViewId(null);
                          setMenuPosition(null);
                        } else {
                          const rect = e.currentTarget.getBoundingClientRect();
                          setMenuPosition({ top: rect.bottom + 2, left: rect.right });
                          setMenuViewId(view.id);
                        }
                      }}
                    >
                      <span className="entities-views-menu-dots">⋮</span>
                    </button>
                  </div>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>

      {/* ── Portal dropdown — rendered outside sidebar to avoid overflow clipping ── */}
      {openView && menuPosition && createPortal(
        <div
          ref={menuRef}
          className="entities-views-menu-dropdown"
          style={{
            position: "fixed",
            top: menuPosition.top,
            left: menuPosition.left,
            transform: "translateX(-100%)",
          }}
        >
          <button
            className="entities-views-menu-item"
            type="button"
            onClick={() => handleOverwrite(openView)}
          >
            <Save size={13} />
            Update
          </button>
          <button
            className="entities-views-menu-item"
            type="button"
            onClick={() => handleStartRename(openView)}
          >
            <Pencil size={13} />
            Rename
          </button>
          <button
            className="entities-views-menu-item"
            type="button"
            onClick={() => handleTogglePublic(openView)}
          >
            {openView.is_public ? (
              <>
                <Lock size={13} />
                Make Private
              </>
            ) : (
              <>
                <Globe size={13} />
                Make Public
              </>
            )}
          </button>
          <button
            className="entities-views-menu-item is-destructive"
            type="button"
            onClick={() => handleDelete(openView)}
          >
            <Trash2 size={13} />
            Delete
          </button>
        </div>,
        document.body,
      )}
    </>
  );
}
