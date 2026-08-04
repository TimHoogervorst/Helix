import {
  useState,
  useCallback,
  useMemo,
  useRef,
  useEffect,
  type ReactNode,
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
} from "lucide-react";
import type { SlotContext } from "../../../shell/src/mod-system/types";
import { SlotSidebar } from "../../../shell/src/shared/components/Sidebar/SlotSidebar";
import { WorkspaceBus } from "../../../shell/src/workspace/WorkspaceBus";
import { StatusBadge } from "../../../shell/src/shared/components/StatusBadge";
import { relativeTime, formatDate } from "../../../shell/src/shared/format";
import { ModRegistry } from "../../../shell/src/mod-system/ModRegistry";
import { IconBadge, resolveColorHex, deriveForeground } from "../../../shell/src/shared/components/IconBadge";
import { getColumnTypeIcon } from "../../../shell/src/shared/components/CellEditors";
import { deriveDropdownColor } from "../../dropdowns/colourUtils";
import { listDropdowns } from "../../dropdowns/api";
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
import {
  FilterBar,
  serializeFilter,
  deserializeFilter,
  type FilterRow,
} from "./FilterBar";

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
  const fieldFiltersRaw = searchParams.getAll("f");
  // Parse into structured filter rows (new format: column:operator:value)
  // and legacy filters (old format: key:value → eq operator).
  const fieldFilters = useMemo(() => {
    let nextId = 0;
    return fieldFiltersRaw.map((raw) => deserializeFilter(raw, nextId++));
  }, [fieldFiltersRaw]);
  // Stabilize the serialized form so it doesn't trigger fetchData recreation
  const fieldFiltersKey = useMemo(
    () => fieldFilters.map(serializeFilter).join(","),
    [fieldFilters],
  );
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

  // Sync columnVisibility from URL params on subsequent navigations
  // (e.g. when loading a saved view).  The useState initialiser handles
  // the first mount; a ref lets us skip that so we don't double-render.
  const prevColumnsParam = useRef(columnsParam);
  useEffect(() => {
    if (prevColumnsParam.current === columnsParam) return;
    prevColumnsParam.current = columnsParam;

    if (columnsParam) {
      const keys = columnsParam.split(",").filter(Boolean);
      if (keys.length > 0) {
        setColumnVisibility(new Set(keys));
        return;
      }
    }
    setColumnVisibility(new Set(DEFAULT_VISIBLE_COLUMNS));
  }, [columnsParam]);

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

  // ── Schema types, schemas & dropdowns ──────────────────────────────────

  const [schemaTypes, setSchemaTypes] = useState<SchemaTypeItem[]>([]);
  const [schemas, setSchemas] = useState<Schema[]>([]);
  const [dropdowns, setDropdowns] = useState<
    { id: number; options: string[] }[]
  >([]);

  useEffect(() => {
    Promise.all([getSchemaTypes(), getSchemas(), listDropdowns()])
      .then(([types, schemaList, dropdownList]) => {
        setSchemaTypes(types);
        setSchemas(schemaList);
        setDropdowns(dropdownList);
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

  // ── Filter bar state (operator-aware) ──────────────────────────────────

  const handleFiltersChange = useCallback(
    (newFilters: FilterRow[]) => {
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev);
        next.delete("f");
        for (const f of newFilters) {
          next.append("f", serializeFilter(f));
        }
        next.set("page", "1");
        return next;
      });
    },
    [setSearchParams],
  );

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
      if (fieldFilters.length > 0) {
        filters.f = fieldFilters
          .filter((f) => f.column && f.operator)
          .map(serializeFilter);
      }
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
    status: 130,
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

  // ── Column type icon resolver ─────────────────────────────────────────

  /** Look up the Lucide icon for a column type from the registry. */
  function resolveColumnIcon(col: HubColumn): ReactNode {
    const ct = ModRegistry.getInstance().getColumnType(col.type);
    const iconName = col.icon ?? ct?.icon;
    if (!iconName) return null;
    const IconComponent = getColumnTypeIcon(iconName);
    if (!IconComponent) return null;
    const colorKey = ct?.color || "muted";
    const bg = resolveColorHex(colorKey);
    const fg = deriveForeground(bg);
    return (
      <span
        className="entities-th-type-icon"
        style={{ backgroundColor: bg, color: fg }}
      >
        <IconComponent size={13} aria-hidden="true" />
      </span>
    );
  }

  // ── Cell renderer ────────────────────────────────────────────────────────

  /** Format a value as a locale-aware date-only string. */
  function formatDateOnly(value: unknown): string {
    if (typeof value !== "string") return String(value);
    try {
      // Extract the date portion (YYYY-MM-DD) in case the value is a full
      // ISO datetime string like "2025-03-15T14:30:00Z".
      const datePart = value.slice(0, 10);
      const date = new Date(datePart + "T00:00:00");
      if (isNaN(date.getTime())) return value;
      return date.toLocaleDateString("en-US", {
        year: "numeric",
        month: "short",
        day: "numeric",
      });
    } catch {
      return value;
    }
  }

  /** Format a value as a locale-aware date+time string. */
  function formatDateTime(value: unknown): string {
    if (typeof value !== "string") return String(value);
    try {
      return formatDate(value);
    } catch {
      return value;
    }
  }

  /** Render a dropdown-type value as a coloured badge using hash-based colour. */
  function renderSelectBadge(value: string): ReactNode {
    const color = deriveDropdownColor(value);
    return (
      <span
        className="entities-select-badge"
        style={{
          backgroundColor: color.bg,
          color: color.fg,
        }}
      >
        {value}
      </span>
    );
  }

  /** Render a schema property cell based on the column type from the registry. */
  function renderTypedCell(item: EntityHubItem, col: HubColumn): ReactNode {
    const value = item._expanded?.[col.key];
    if (value === null || value === undefined) return "—";

    switch (col.type) {
      case "text":
        return String(value);
      case "number": {
        if (typeof value === "number") return value.toLocaleString("en-US");
        const num = Number(value);
        if (Number.isNaN(num)) return String(value);
        return num.toLocaleString("en-US");
      }
      case "date":
        return formatDateOnly(value);
      case "datetime":
        return formatDateTime(value);
      case "boolean":
        return value ? "Yes" : "No";
      case "dropdown":
        return renderSelectBadge(String(value));
      case "reference":
        return (
          <a
            className="entities-ref-link"
            href={`/${item.workspace_id}/${String(value)}`}
            onClick={(e) => {
              e.stopPropagation();
              navigate(`/${item.workspace_id}/${String(value)}`);
            }}
          >
            {String(value)}
          </a>
        );
      case "user":
        return (
          <a
            className="entities-user-link"
            href="/profile"
            onClick={(e) => {
              e.stopPropagation();
              navigate("/profile");
            }}
          >
            {String(value)}
          </a>
        );
      default:
        return String(value);
    }
  }

  function renderCell(item: EntityHubItem, col: HubColumn) {
    // System columns retain specialized (non-generic) rendering
    switch (col.key) {
      case "display_id":
        return (
          <span className="entities-display-id">
            <IconBadge iconKey={item.icon || "circle"} colorKey={item.color || "muted"} size="sm" />
            <span className="entities-display-id-text">{item.display_id}</span>
          </span>
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
      default:
        // Schema property columns — dispatch on column type from registry
        return renderTypedCell(item, col);
    }
  }

  // ── Available columns from response (for Fields popover) ─────────────────

  const availableColumns: AvailableColumn[] = data?.available_columns || [];

  // ── Build dropdown options map (column key → option strings) ────────────

  const dropdownOptionsMap = useMemo(() => {
    const map = new Map<string, string[]>();
    if (dropdowns.length === 0) return map;
    const optionsById = new Map<number, string[]>();
    for (const d of dropdowns) {
      optionsById.set(d.id, d.options);
    }
    for (const col of availableColumns) {
      if (col.type === "dropdown" && col.dropdownId) {
        const opts = optionsById.get(col.dropdownId);
        if (opts) {
          map.set(col.key, opts);
        }
      }
    }
    return map;
  }, [availableColumns, dropdowns]);

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

  // Active filter count for the badge
  const activeFilterCount = fieldFilters.filter(
    (f) => f.column && f.operator,
  ).length;

  // ── Has any filter active? ───────────────────────────────────────────────

  const hasActiveFilters =
    searchRaw !== "" ||
    schemaTypeParam !== "" ||
    schemaParam !== "" ||
    statusParam !== "" ||
    activeFilterCount > 0 ||
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

        {/* ── Filter pills row (operator-aware, below the search bar) ──── */}
        <div className="entities-filter-pills-row">
          <FilterBar
            availableColumns={availableColumns}
            filters={fieldFilters}
            onFiltersChange={handleFiltersChange}
            dropdownOptionsMap={dropdownOptionsMap}
          />
        </div>

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
                            <span className="entities-th-label">
                              {resolveColumnIcon(col)}
                              {col.label}
                            </span>
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
        slotId="lims.sidebar"
        context={sidebarContext}
        bus={bus}
      />
    </div>
  );
}

export default EntitiesHub;
