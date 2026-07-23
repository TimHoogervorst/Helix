import {
  useState,
  useCallback,
  useMemo,
  useRef,
  useEffect,
} from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  Search,
  ChevronDown,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  LayoutList,
  AlignJustify,
  Lock,
  X,
  Filter,
  Plus,
} from "lucide-react";
import type { SlotContext } from "../../../shell/src/mod-system/types";
import { SlotSidebar } from "../../../shell/src/shared/components/Sidebar/SlotSidebar";
import { WorkspaceBus } from "../../../shell/src/workspace/WorkspaceBus";
import { StatusBadge } from "../../../shell/src/shared/components/StatusBadge";
import { relativeTime } from "../../../shell/src/shared/format";
import { getEntities, getSchemaTypes, getSchemas } from "./api";
import type { EntityHubFilters } from "./api";
import type {
  EntityHubItem,
  EntityHubResponse,
  SchemaTypeItem,
  Schema,
  AvailableColumn,
} from "../types";
import {
  ColumnChooser,
  buildColumns,
  DEFAULT_VISIBLE_COLUMNS,
} from "./ColumnChooser";
import type { HubColumn } from "./ColumnChooser";
import {
  applyLockCascade,
  isColumnLocked,
  getLockedCount,
} from "./columnLock";

// ── View mode ──────────────────────────────────────────────────────────────

type ViewMode = "list" | "compact";

const VIEW_MODE_STORAGE_KEY = "helix-entities-view-mode";

function getInitialViewMode(): ViewMode {
  try {
    const stored = localStorage.getItem(VIEW_MODE_STORAGE_KEY);
    if (stored === "list" || stored === "compact") {
      return stored;
    }
  } catch {
    // localStorage unavailable (SSR / privacy mode)
  }
  return "list";
}

// ── Pagination size options ────────────────────────────────────────────────

const PAGE_SIZES = [50, 100, 200] as const;

// ── Sort helpers ───────────────────────────────────────────────────────────

type SortDirection = "asc" | "desc" | null;

interface SortState {
  field: string | null;
  direction: SortDirection;
}

const SORTABLE_COLUMNS = ["name", "status", "created_at", "updated_at"] as const;
type SortableColumn = typeof SORTABLE_COLUMNS[number];

const SORT_CYCLE: SortableColumn[] = ["name", "status", "created_at", "updated_at"];

function nextSortDirection(current: SortDirection): SortDirection {
  if (current === null) return "asc";
  if (current === "asc") return "desc";
  return null;
}

function sortToParam(field: string, direction: SortDirection): string | null {
  if (direction === null) return null;
  return direction === "desc" ? `-${field}` : field;
}

function sortFromParam(param: string | null): SortState {
  if (!param) return { field: null, direction: null };
  if (param.startsWith("-")) {
    const field = param.slice(1);
    if (SORTABLE_COLUMNS.includes(field as typeof SORTABLE_COLUMNS[number])) {
      return { field, direction: "desc" };
    }
  }
  if (SORTABLE_COLUMNS.includes(param as typeof SORTABLE_COLUMNS[number])) {
    return { field: param, direction: "asc" };
  }
  return { field: null, direction: null };
}

const SORT_LABELS: Record<string, string> = {
  name: "Name",
  status: "Status",
  created_at: "Created",
  updated_at: "Updated",
};

// ── Debounce hook ──────────────────────────────────────────────────────────

function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debouncedValue;
}

// ── Component ──────────────────────────────────────────────────────────────

function EntitiesHub() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  // ── Derive filter state from URL params ─────────────────────────────────

  const searchRaw = searchParams.get("search") || "";
  const schemaTypeParam = searchParams.get("schema_type") || "";
  const schemaParam = searchParams.get("schema") || "";
  const statusParam = searchParams.get("status") || "";
  const sortParam = searchParams.get("sort") || "";
  const fieldFilters = searchParams.getAll("f");
  // Stabilize array reference so it doesn't trigger fetchData recreation
  const fieldFiltersKey = fieldFilters.join(",");
  const pageParam = parseInt(searchParams.get("page") || "1", 10);
  const sizeParam = parseInt(searchParams.get("size") || "50", 10);

  const page = Number.isFinite(pageParam) && pageParam > 0 ? pageParam : 1;
  const size = PAGE_SIZES.includes(sizeParam as typeof PAGE_SIZES[number])
    ? sizeParam
    : 50;

  // Debounce search to avoid excessive API calls while typing
  const search = useDebounce(searchRaw, 250);

  const sort = useMemo(() => sortFromParam(sortParam), [sortParam]);

  // ── Column visibility state (from URL, defaults to common visible set) ──

  const columnsParam = searchParams.get("columns") || "";
  const [columnVisibility, setColumnVisibility] = useState<Set<string>>(() => {
    if (columnsParam) {
      const keys = columnsParam.split(",").filter(Boolean);
      if (keys.length > 0) return new Set(keys);
    }
    return new Set(DEFAULT_VISIBLE_COLUMNS);
  });

  // Sync column visibility to URL (called after state updates)
  const syncColumnsToURL = useCallback(
    (visible: Set<string>) => {
      setSearchParams((sp) => {
        const nextSp = new URLSearchParams(sp);
        // Only store non-default visibility in URL
        const keys = Array.from(visible).sort();
        const defaults = Array.from(DEFAULT_VISIBLE_COLUMNS).sort();
        if (
          keys.length === defaults.length &&
          keys.every((k, i) => k === defaults[i])
        ) {
          nextSp.delete("columns");
        } else {
          nextSp.set("columns", keys.join(","));
        }
        return nextSp;
      });
    },
    [setSearchParams],
  );

  const handleToggleColumn = useCallback(
    (key: string) => {
      setColumnVisibility((prev) => {
        const next = new Set(prev);
        if (next.has(key)) {
          next.delete(key);
        } else {
          next.add(key);
        }
        // Sync after state update via microtask
        queueMicrotask(() => syncColumnsToURL(next));
        return next;
      });
    },
    [syncColumnsToURL],
  );

  // ── Column lock state (local state, not in URL) ─────────────────────

  const [lockedColumns, setLockedColumns] = useState<Set<number>>(() => {
    // display_id (index 0) is always locked
    return new Set([0]);
  });

  const handleToggleLock = useCallback(
    (index: number) => {
      // display_id (index 0) must always stay locked
      if (index === 0) return;
      setLockedColumns((prev) => applyLockCascade(prev, index));
    },
    [],
  );

  // ── Data state ──────────────────────────────────────────────────────────

  const [data, setData] = useState<EntityHubResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // ── Schema types & schemas for dropdowns ────────────────────────────────

  const [schemaTypes, setSchemaTypes] = useState<SchemaTypeItem[]>([]);
  const [schemas, setSchemas] = useState<Schema[]>([]);

  useEffect(() => {
    Promise.all([getSchemaTypes(), getSchemas()])
      .then(([types, schemaList]) => {
        setSchemaTypes(types);
        setSchemas(schemaList);
      })
      .catch(() => {
        // Dropdowns fall back to empty — user can still type search
      });
  }, []);

  // ── Build schema optgroups ──────────────────────────────────────────────

  const schemaOptgroups = useMemo(() => {
    return schemaTypes.map((st) => ({
      schemaType: st,
      schemas: schemas.filter((s) => s.schema_type === st.id),
    }));
  }, [schemaTypes, schemas]);

  // ── Fields popover state ────────────────────────────────────────────────

  const [fieldsPopoverOpen, setFieldsPopoverOpen] = useState(false);
  const fieldsPopoverRef = useRef<HTMLDivElement>(null);
  const [fieldKey, setFieldKey] = useState("");
  const [fieldValue, setFieldValue] = useState("");

  // Close popover on outside click
  useEffect(() => {
    if (!fieldsPopoverOpen) return;
    function handleClick(e: MouseEvent) {
      if (
        fieldsPopoverRef.current &&
        !fieldsPopoverRef.current.contains(e.target as Node)
      ) {
        setFieldsPopoverOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [fieldsPopoverOpen]);

  // ── Fetch data when URL params change ───────────────────────────────────

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const filters: EntityHubFilters = {
        page,
        size,
      };
      // Use debounced search so the API call follows the debounce
      if (search) filters.search = search;
      if (schemaTypeParam) filters.schema_type = schemaTypeParam;
      if (schemaParam) filters.schema = schemaParam;
      if (statusParam) filters.status = statusParam;
      if (sortParam) filters.sort = sortParam;
      if (fieldFilters.length > 0) filters.f = fieldFilters;
      const response = await getEntities(filters);
      setData(response);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load entities.");
    } finally {
      setLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps -- fieldFiltersKey
  // stabilizes the fieldFilters dependency
  }, [page, size, search, schemaTypeParam, schemaParam, statusParam, sortParam, fieldFiltersKey]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // ── URL helpers ─────────────────────────────────────────────────────────

  const updateParam = useCallback(
    (key: string, value: string | null) => {
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev);
        if (value === null || value === "") {
          next.delete(key);
        } else {
          next.set(key, value);
        }
        // Reset page to 1 when filters change (unless the change is page itself)
        if (key !== "page") {
          next.set("page", "1");
        }
        return next;
      });
    },
    [setSearchParams],
  );

  const addFieldFilter = useCallback(
    (key: string, value: string) => {
      if (!key.trim() || !value.trim()) return;
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev);
        next.append("f", `${key.trim()}:${value.trim()}`);
        next.set("page", "1");
        return next;
      });
      setFieldKey("");
      setFieldValue("");
    },
    [setSearchParams],
  );

  const removeFieldFilter = useCallback(
    (index: number) => {
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev);
        next.delete("f");
        const all = prev.getAll("f");
        for (let i = 0; i < all.length; i++) {
          if (i !== index) {
            next.append("f", all[i]);
          }
        }
        next.set("page", "1");
        return next;
      });
    },
    [setSearchParams],
  );

  // ── View mode state (persisted to localStorage) ─────────────────────────

  const [viewMode, setViewMode] = useState<ViewMode>(getInitialViewMode);

  const handleViewModeChange = useCallback((mode: ViewMode) => {
    setViewMode(mode);
    try {
      localStorage.setItem(VIEW_MODE_STORAGE_KEY, mode);
    } catch {
      // localStorage unavailable
    }
  }, []);

  // ── Sidebar bus and context ──────────────────────────────────────────────

  const busRef = useRef<WorkspaceBus>(null);
  if (!busRef.current) {
    busRef.current = new WorkspaceBus();
  }
  const bus = busRef.current;

  const sidebarContext: SlotContext = useMemo(
    () => ({
      workspaceId: "entities",
      user: null,
      viewMode,
    }),
    [viewMode],
  );

  // ── Row click → navigate to workspace ────────────────────────────────────

  const handleRowClick = useCallback(
    (item: EntityHubItem) => {
      navigate(`/${item.workspace_id}/${item.display_id}`);
    },
    [navigate],
  );

  // ── Column header click → toggle sort ────────────────────────────────────

  const handleColumnSort = useCallback(
    (column: string) => {
      const currentDir = sort.field === column ? sort.direction : null;
      const nextDir = nextSortDirection(currentDir);
      const param = sortToParam(column, nextDir);
      updateParam("sort", param);
    },
    [sort, updateParam],
  );

  // ── Pagination helpers ───────────────────────────────────────────────────

  const totalPages = data ? Math.ceil(data.total / data.size) : 0;

  const handlePageChange = useCallback(
    (p: number) => {
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev);
        next.set("page", String(p));
        return next;
      });
    },
    [setSearchParams],
  );

  const handleSizeChange = useCallback(
    (s: number) => {
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev);
        next.set("size", String(s));
        next.set("page", "1");
        return next;
      });
    },
    [setSearchParams],
  );

  // ── Page number range (show max ~7 page buttons) ─────────────────────────

  const pageNumbers = useMemo(() => {
    if (totalPages <= 7) {
      return Array.from({ length: totalPages }, (_, i) => i + 1);
    }
    const pages: (number | "...")[] = [];
    if (page <= 4) {
      pages.push(1, 2, 3, 4, 5, "...", totalPages);
    } else if (page >= totalPages - 3) {
      pages.push(
        1,
        "...",
        totalPages - 4,
        totalPages - 3,
        totalPages - 2,
        totalPages - 1,
        totalPages,
      );
    } else {
      pages.push(1, "...", page - 1, page, page + 1, "...", totalPages);
    }
    return pages;
  }, [totalPages, page]);

  // ── Schema type badge color ──────────────────────────────────────────────

  function schemaTypeClass(schemaTypeId: string): string {
    return schemaTypeId === "eln.entry"
      ? "entities-schema-type-eln"
      : "entities-schema-type-lims";
  }

  // ── Sort indicator for column headers ────────────────────────────────────

  function renderSortIcon(column: string) {
    if (sort.field !== column) return null;
    if (sort.direction === "asc") {
      return <ArrowUp size={12} className="entities-sort-icon" />;
    }
    if (sort.direction === "desc") {
      return <ArrowDown size={12} className="entities-sort-icon" />;
    }
    return null;
  }

  // ── Column width map (shared with CSS and sticky offset calc) ───────────

  const COL_WIDTHS: Record<string, number> = {
    display_id: 110,
    name: 0, // flex / auto — not used for sticky offset
    schema_type_id: 120,
    status: 110,
    author: 100,
    created_at: 90,
    updated_at: 90,
  };
  const DEFAULT_COL_WIDTH = 120;

  /** Compute the sticky `left` offset for a locked column at the given index. */
  function stickyLeftOffset(
    colIndex: number,
    columns: HubColumn[],
  ): number {
    let offset = 0;
    for (let i = 0; i < colIndex; i++) {
      offset += COL_WIDTHS[columns[i]?.key] ?? DEFAULT_COL_WIDTH;
    }
    return offset;
  }

  // ── Cell renderer ────────────────────────────────────────────────────────

  function renderCell(item: EntityHubItem, col: HubColumn) {
    switch (col.key) {
      case "display_id":
        return (
          <span className="entities-display-id">{item.display_id}</span>
        );
      case "name":
        return item.name;
      case "schema_type_id":
        return (
          <span
            className={`entities-schema-type-badge ${schemaTypeClass(item.schema_type_id)}`}
          >
            {item.schema_type_display}
          </span>
        );
      case "status":
        return <StatusBadge status={item.status} />;
      case "author":
        return item.author_username ?? "—";
      case "created_at":
        return relativeTime(item.created_at);
      case "updated_at":
        return relativeTime(item.updated_at);
      default: {
        // Schema or schema_type properties column — read from _expanded
        const value = item._expanded?.[col.key];
        if (value === null || value === undefined) return "—";
        if (typeof value === "boolean") return value ? "Yes" : "No";
        return String(value);
      }
    }
  }

  // ── Available columns from response (for Fields popover) ─────────────────

  const availableColumns: AvailableColumn[] = data?.available_columns || [];

  // ── Build merged columns (common + schema_type + schema) ──────────────────

  const allColumns = useMemo<HubColumn[]>(
    () => buildColumns(availableColumns),
    [availableColumns],
  );

  // Filter column visibility to only include currently available columns
  const validVisibleColumns = useMemo<HubColumn[]>(() => {
    const validKeys = new Set(allColumns.map((c) => c.key));
    return allColumns.filter(
      (c) => columnVisibility.has(c.key) || !c.hideable,
    );
  }, [allColumns, columnVisibility]);

  // Parse existing field filters into {key, value} pairs for chips
  const parsedFieldFilters = useMemo(() => {
    return fieldFilters
      .map((f) => {
        const colonIdx = f.indexOf(":");
        if (colonIdx === -1) return null;
        return {
          key: f.slice(0, colonIdx),
          value: f.slice(colonIdx + 1),
        };
      })
      .filter(Boolean) as { key: string; value: string }[];
  }, [fieldFilters]);

  // ── Has any filter active? ───────────────────────────────────────────────

  const hasActiveFilters =
    searchRaw !== "" ||
    schemaTypeParam !== "" ||
    schemaParam !== "" ||
    statusParam !== "" ||
    fieldFilters.length > 0 ||
    sortParam !== "";

  // ── Loading state ────────────────────────────────────────────────────────

  if (loading && !data) {
    return (
      <div className="entities-hub">
        <p className="empty">Loading…</p>
      </div>
    );
  }

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="entities-hub">
      {/* ── Main column: top bar + filter bar + table + pagination ────────── */}
      <div className="entities-main-column">
        {/* ── Top Bar ────────────────────────────────────────────────────── */}
        <div className="entities-top-bar">
          <div className="entities-breadcrumb">
            <span className="entities-breadcrumb-current">Entities</span>
          </div>

          <div className="entities-top-bar-actions">
            {/* View mode toggle button group — Compact / List only */}
            <div
              className="entities-view-toggle-group"
              role="group"
              aria-label="View mode"
            >
              <button
                className={`entities-view-toggle${viewMode === "compact" ? " is-active" : ""}`}
                title="Compact view"
                type="button"
                onClick={() => handleViewModeChange("compact")}
              >
                <AlignJustify size={15} />
              </button>
              <button
                className={`entities-view-toggle${viewMode === "list" ? " is-active" : ""}`}
                title="List view"
                type="button"
                onClick={() => handleViewModeChange("list")}
              >
                <LayoutList size={15} />
              </button>
            </div>
          </div>
        </div>

        {/* ── Filter Bar ────────────────────────────────────────────────── */}
        <div className="entities-filter-bar">
          {/* Search */}
          <div className="entities-filter-search-wrap">
            <Search size={15} className="entities-filter-search-icon" />
            <input
              className="entities-filter-search"
              type="text"
              placeholder="Search…"
              value={searchRaw}
              onChange={(e) => updateParam("search", e.target.value || null)}
            />
          </div>

          <div className="entities-filter-actions">
            {/* Schema dropdown with optgroups */}
            <div className="entities-filter-select-wrap">
              <ChevronDown
                size={14}
                className="entities-filter-select-icon"
              />
              <select
                className="entities-filter-select"
                value={
                  schemaParam
                    ? schemaParam
                    : schemaTypeParam
                      ? `type:${schemaTypeParam}`
                      : ""
                }
                onChange={(e) => {
                  const val = e.target.value;
                  setSearchParams((prev) => {
                    const next = new URLSearchParams(prev);
                    if (!val) {
                      next.delete("schema");
                      next.delete("schema_type");
                    } else if (val.startsWith("type:")) {
                      next.set("schema_type", val.slice(5));
                      next.delete("schema");
                    } else {
                      next.set("schema", val);
                      next.delete("schema_type");
                    }
                    next.set("page", "1");
                    return next;
                  });
                }}
              >
                <option value="">All schemas</option>
                {schemaOptgroups.map((group) => (
                  <optgroup
                    key={group.schemaType.id}
                    label={group.schemaType.display_name}
                  >
                    <option value={`type:${group.schemaType.schema_type_id}`}>
                      All {group.schemaType.display_name}
                    </option>
                    {group.schemas.map((schema) => (
                      <option key={schema.id} value={String(schema.id)}>
                        {schema.name}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </div>

            {/* Status dropdown */}
            <div className="entities-filter-select-wrap">
              <ChevronDown
                size={14}
                className="entities-filter-select-icon"
              />
              <select
                className="entities-filter-select"
                value={statusParam}
                onChange={(e) =>
                  updateParam("status", e.target.value || null)
                }
              >
                <option value="">All statuses</option>
                <option value="in_progress">In Progress</option>
                <option value="finished">Finished</option>
              </select>
            </div>

            {/* Fields popover */}
            <div
              className="entities-filter-fields-wrap"
              ref={fieldsPopoverRef}
            >
              <button
                className="entities-filter-fields-btn"
                type="button"
                onClick={() => setFieldsPopoverOpen((prev) => !prev)}
              >
                <Filter size={14} />
                Fields
                {parsedFieldFilters.length > 0 && (
                  <span className="entities-filter-fields-count">
                    {parsedFieldFilters.length}
                  </span>
                )}
              </button>
              {fieldsPopoverOpen && (
                <div className="entities-filter-fields-popover">
                  <div className="entities-filter-fields-popover-header">
                    Field Filters
                  </div>
                  {availableColumns.length > 0 ? (
                    <div className="entities-filter-fields-popover-body">
                      {/* Add a new field filter */}
                      <div className="entities-filter-fields-add">
                        <select
                          className="entities-filter-select"
                          value={fieldKey}
                          onChange={(e) => setFieldKey(e.target.value)}
                        >
                          <option value="">Select field…</option>
                          {availableColumns
                            .filter((c) => c.source !== "common" || c.key === "name")
                            .map((col) => (
                              <option key={col.key} value={col.key}>
                                {col.label}
                              </option>
                            ))}
                        </select>
                        <input
                          className="entities-filter-search"
                          type="text"
                          placeholder="Value…"
                          value={fieldValue}
                          onChange={(e) => setFieldValue(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              addFieldFilter(fieldKey, fieldValue);
                            }
                          }}
                        />
                        <button
                          className="entities-filter-fields-add-btn"
                          type="button"
                          onClick={() => addFieldFilter(fieldKey, fieldValue)}
                          title="Add filter"
                        >
                          <Plus size={14} />
                        </button>
                      </div>

                      {/* Existing field filters */}
                      {parsedFieldFilters.length > 0 && (
                        <div className="entities-filter-fields-existing">
                          <div className="entities-filter-fields-existing-label">
                            Active field filters:
                          </div>
                          {parsedFieldFilters.map((ff, i) => {
                            const fieldIdx = fieldFilters.indexOf(
                              `${ff.key}:${ff.value}`,
                            );
                            return (
                              <div
                                key={`${ff.key}:${ff.value}-${i}`}
                                className="entities-filter-field-chip"
                              >
                                <span className="entities-filter-field-chip-key">
                                  {ff.key}
                                </span>
                                <span className="entities-filter-field-chip-sep">
                                  =
                                </span>
                                <span className="entities-filter-field-chip-value">
                                  {ff.value}
                                </span>
                                <button
                                  className="entities-filter-field-chip-remove"
                                  type="button"
                                  onClick={() =>
                                    removeFieldFilter(fieldIdx)
                                  }
                                  title="Remove filter"
                                >
                                  <X size={12} />
                                </button>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="entities-filter-fields-popover-empty">
                      No fields available. Select a schema to see its fields.
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Sort button */}
            <button
              className={`entities-filter-sort-btn${sortParam ? " is-active" : ""}`}
              type="button"
              onClick={() => {
                // Cycle through fields: each field asc → desc, then next field
                if (!sort.field) {
                  updateParam("sort", SORT_CYCLE[0]);
                } else if (sort.direction === "asc") {
                  updateParam("sort", `-${sort.field}`);
                } else {
                  // Move to next field in cycle, or clear if at the end
                  const idx = SORT_CYCLE.indexOf(sort.field as SortableColumn);
                  if (idx >= 0 && idx < SORT_CYCLE.length - 1) {
                    updateParam("sort", SORT_CYCLE[idx + 1]);
                  } else {
                    updateParam("sort", null);
                  }
                }
              }}
              title={sortParam ? `Sorted by ${sortParam}` : "Sort"}
            >
              {sort.field ? (
                <>
                  {sort.direction === "asc" ? (
                    <ArrowUp size={14} />
                  ) : (
                    <ArrowDown size={14} />
                  )}
                  {SORT_LABELS[sort.field] || sort.field}
                </>
              ) : (
                <>
                  <ArrowUpDown size={14} />
                  Sort
                </>
              )}
            </button>

            {/* Column visibility chooser */}
            <ColumnChooser
              columns={allColumns}
              visibleKeys={columnVisibility}
              lockedKeys={lockedColumns}
              onToggleColumn={handleToggleColumn}
              onToggleLock={handleToggleLock}
            />
          </div>
        </div>

        {/* ── Active field filter chips (below filter bar) ────────────────── */}
        {parsedFieldFilters.length > 0 && (
          <div className="entities-filter-chips">
            {parsedFieldFilters.map((ff, i) => {
              const fieldIdx = fieldFilters.indexOf(`${ff.key}:${ff.value}`);
              return (
                <span
                  key={`chip-${ff.key}:${ff.value}-${i}`}
                  className="entities-filter-chip"
                >
                  <span className="entities-filter-chip-key">{ff.key}</span>
                  <span className="entities-filter-chip-sep">:</span>
                  <span className="entities-filter-chip-value">{ff.value}</span>
                  <button
                    className="entities-filter-chip-remove"
                    type="button"
                    onClick={() => removeFieldFilter(fieldIdx)}
                    title="Remove filter"
                  >
                    <X size={12} />
                  </button>
                </span>
              );
            })}
            {parsedFieldFilters.length > 0 && (
              <button
                className="entities-filter-chip-clear-all"
                type="button"
                onClick={() => {
                  setSearchParams((prev) => {
                    const next = new URLSearchParams(prev);
                    next.delete("f");
                    next.set("page", "1");
                    return next;
                  });
                }}
              >
                Clear all
              </button>
            )}
          </div>
        )}

        {/* ── Error state ────────────────────────────────────────────────── */}
        {error && <div className="error">{error}</div>}

        {/* ── Empty state ────────────────────────────────────────────────── */}
        {!error && !loading && data && data.results.length === 0 && (
          <div className="entities-empty">
            <p className="empty">
              {hasActiveFilters
                ? "No entities match your filters."
                : "No entities found."}
            </p>
            {hasActiveFilters && (
              <button
                className="entities-filter-clear-link"
                type="button"
                onClick={() => setSearchParams({})}
              >
                Clear all filters
              </button>
            )}
          </div>
        )}

        {/* ── Data Table ─────────────────────────────────────────────────── */}
        {!error && data && data.results.length > 0 && (
          <>
            <div
              className={`entities-table-wrap view-${viewMode}`}
            >
              <table className="entities-table">
                <thead>
                  <tr>
                    {validVisibleColumns.map((col, idx) => {
                      const isLocked = isColumnLocked(lockedColumns, idx);
                      const lockCount = getLockedCount(lockedColumns);
                      const style: React.CSSProperties = {};
                      if (isLocked) {
                        style.position = "sticky";
                        style.left = `${stickyLeftOffset(idx, validVisibleColumns)}px`;
                        style.zIndex = 2;
                      }
                      return (
                        <th
                          key={col.key}
                          className={`entities-th entities-col-${col.key}${col.sortable ? " is-sortable" : ""}${isLocked ? " is-locked" : ""}`}
                          style={style}
                          onClick={() =>
                            col.sortable && handleColumnSort(col.key)
                          }
                        >
                          <span className="entities-th-content">
                            {col.label}
                            {renderSortIcon(col.key)}
                            {col.hideable && (
                              <button
                                className={`entities-lock-btn${isLocked ? " is-locked" : ""}`}
                                type="button"
                                title={isLocked ? "Unlock column" : "Lock column"}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleToggleLock(idx);
                                }}
                              >
                                <Lock size={11} />
                              </button>
                            )}
                          </span>
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody>
                  {data.results.map((item) => (
                    <tr
                      key={`${item.schema_type_id}-${item.id}`}
                      className="entities-tr"
                      onClick={() => handleRowClick(item)}
                      tabIndex={0}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          handleRowClick(item);
                        }
                      }}
                    >
                      {validVisibleColumns.map((col, idx) => {
                        const isLocked = isColumnLocked(lockedColumns, idx);
                        const style: React.CSSProperties = {};
                        if (isLocked) {
                          style.position = "sticky";
                          style.left = `${stickyLeftOffset(idx, validVisibleColumns)}px`;
                          style.zIndex = 1;
                        }
                        return (
                          <td
                            key={col.key}
                            className={`entities-td entities-col-${col.key}${isLocked ? " is-locked" : ""}`}
                            style={style}
                          >
                            {renderCell(item, col)}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* ── Pagination ──────────────────────────────────────────────── */}
            <div className="entities-pagination">
              <div className="entities-page-size">
                <label htmlFor="entities-page-size">Show</label>
                <div className="entities-filter-select-wrap">
                  <ChevronDown
                    size={14}
                    className="entities-filter-select-icon"
                  />
                  <select
                    id="entities-page-size"
                    className="entities-filter-select"
                    value={size}
                    onChange={(e) =>
                      handleSizeChange(Number(e.target.value))
                    }
                  >
                    {PAGE_SIZES.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="entities-page-numbers">
                {pageNumbers.map((p, i) =>
                  p === "..." ? (
                    <span
                      key={`ellipsis-${i}`}
                      className="entities-page-ellipsis"
                    >
                      …
                    </span>
                  ) : (
                    <button
                      key={p}
                      className={`entities-page-btn${p === page ? " is-active" : ""}`}
                      type="button"
                      onClick={() => handlePageChange(p)}
                      disabled={p === page}
                    >
                      {p}
                    </button>
                  ),
                )}
              </div>

              <div className="entities-page-total">
                {data.total} total
              </div>
            </div>
          </>
        )}
      </div>

      {/* ── Right Sidebar (slot-driven) ─────────────────────────────────── */}
      <SlotSidebar
        slotId="entities.sidebar"
        context={sidebarContext}
        bus={bus}
      />
    </div>
  );
}

export default EntitiesHub;
