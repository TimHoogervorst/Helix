import { useState, useEffect, useCallback } from "react";
import { get } from "../api/client";
import type { EntityListItem, PaginatedResponse, EntityType } from "../types/lims";

function LimsList() {
  const [entities, setEntities] = useState<EntityListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("");
  const [entityTypes, setEntityTypes] = useState<EntityType[]>([]);
  const [nextUrl, setNextUrl] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedEntity, setSelectedEntity] = useState<EntityListItem | null>(null);

  const fetchEntities = useCallback(async (url?: string) => {
    setLoading(true);
    setError(null);
    try {
      const path = url
        ? url.replace("/api", "")
        : `/lims/entities/?search=${encodeURIComponent(search)}&type=${typeFilter}`;
      const data = await get<PaginatedResponse<EntityListItem>>(path);
      if (url) {
        setEntities((prev) => [...prev, ...data.results]);
      } else {
        setEntities(data.results);
      }
      setNextUrl(data.next);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [search, typeFilter]);

  useEffect(() => {
    fetchEntities();
  }, [fetchEntities]);

  // Fetch entity types for the filter dropdown
  useEffect(() => {
    get<EntityType[]>("/lims/entity-types/")
      .then((types) => setEntityTypes(types.filter((t) => t.is_active)))
      .catch(() => {});
  }, []);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    fetchEntities();
  };

  const handleSelect = (entity: EntityListItem) => {
    if (selectedId === entity.display_id) {
      setSelectedId(null);
      setSelectedEntity(null);
    } else {
      setSelectedId(entity.display_id);
      setSelectedEntity(entity);
    }
  };

  const loadMore = () => {
    if (nextUrl) fetchEntities(nextUrl);
  };

  const formatDate = (iso: string) => new Date(iso).toLocaleString();

  if (loading && entities.length === 0) {
    return (
      <div className="page">
        <h1>LIMS</h1>
        <p className="empty">Loading…</p>
      </div>
    );
  }

  return (
    <div className="page lims-page">
      <div className="toolbar">
        <h1>LIMS</h1>
      </div>

      {error && <div className="error">{error}</div>}

      {/* Search & Filter Bar */}
      <form className="lims-search-bar" onSubmit={handleSearch}>
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by ID or name…"
          className="lims-search-input"
        />
        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
          className="lims-type-select"
        >
          <option value="">All types</option>
          {entityTypes.map((et) => (
            <option key={et.id} value={et.id}>
              {et.name} ({et.prefix})
            </option>
          ))}
        </select>
        <button type="submit">Search</button>
      </form>

      {/* Entity Table */}
      <div className="lims-table-container">
        <table className="lims-table">
          <thead>
            <tr>
              <th>ID</th>
              <th>Name</th>
              <th>Type</th>
              <th>Created</th>
              <th>Source</th>
            </tr>
          </thead>
          <tbody>
            {entities.length === 0 && (
              <tr>
                <td colSpan={5} className="empty">
                  No entities found.
                </td>
              </tr>
            )}
            {entities.map((entity) => (
              <tr
                key={entity.display_id}
                className={`lims-row ${selectedId === entity.display_id ? "is-selected" : ""}`}
                onClick={() => handleSelect(entity)}
              >
                <td>
                  <span className="eln-badge">{entity.display_id}</span>
                </td>
                <td>{entity.name}</td>
                <td>{entity.entity_type_name}</td>
                <td className="lims-date">{formatDate(entity.created_at)}</td>
                <td>
                  {entity.source_entry ? (
                    <span className="eln-badge">E{entity.source_entry}</span>
                  ) : (
                    <span className="lims-no-source">—</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {nextUrl && (
        <div className="lims-load-more">
          <button onClick={loadMore} disabled={loading}>
            {loading ? "Loading…" : "Load More"}
          </button>
        </div>
      )}

      {/* Detail Card */}
      {selectedEntity && (
        <div className="card lims-detail-card">
          <div className="detail-header">
            <h2>
              <span className="eln-badge">{selectedEntity.display_id}</span>
              {selectedEntity.name}
            </h2>
            <button
              onClick={() => { setSelectedId(null); setSelectedEntity(null); }}
              style={{
                background: "transparent",
                color: "var(--gray-700)",
                border: "1px solid var(--gray-300)",
              }}
            >
              Close
            </button>
          </div>
          <div className="detail-body">
            <div className="detail-field">
              <span className="detail-label">Type</span>
              <span>{selectedEntity.entity_type_name} ({selectedEntity.entity_type_prefix})</span>
            </div>
            <div className="detail-field">
              <span className="detail-label">Created</span>
              <span>{formatDate(selectedEntity.created_at)}</span>
            </div>
            <div className="detail-field">
              <span className="detail-label">By</span>
              <span>{selectedEntity.created_by_username || "—"}</span>
            </div>
            {selectedEntity.source_entry && (
              <div className="detail-field">
                <span className="detail-label">Source Entry</span>
                <a href={`/eln/${selectedEntity.source_entry}`}>
                  E{selectedEntity.source_entry}
                </a>
              </div>
            )}
          </div>
          {/* Properties */}
          {selectedEntity.properties && Object.keys(selectedEntity.properties).length > 0 && (
            <div className="detail-properties">
              <h3>Properties</h3>
              <table className="properties-table">
                <thead>
                  <tr>
                    <th>Field</th>
                    <th>Value</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(selectedEntity.properties).map(([key, value]) => (
                    <tr key={key}>
                      <td className="prop-key">{key}</td>
                      <td className="prop-value">
                        {typeof value === "boolean"
                          ? (value ? "✓" : "✗")
                          : String(value ?? "—")}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default LimsList;
