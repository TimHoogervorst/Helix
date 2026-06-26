import { useState, useEffect, useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import { get } from "../api/client";
import type { EntityListItem, PaginatedResponse } from "../types/lims";

function LimsList() {
  const [searchParams] = useSearchParams();
  const search = searchParams.get("search") || "";
  const typeFilter = searchParams.get("type") || "";

  const [entities, setEntities] = useState<EntityListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
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
        <p className="empty">Loading…</p>
      </div>
    );
  }

  return (
    <div className={`page lims-page${selectedEntity ? " has-detail" : ""}`}>
      {error && <div className="error">{error}</div>}

      {/* Master–Detail Layout */}
      <div className={`lims-master-detail ${selectedEntity ? "has-detail" : ""}`}>
        {/* Left Panel: Entity Table */}
        <div className="lims-master-panel">
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
        </div>

        {/* Right Panel: Detail Card */}
        {selectedEntity && (
          <div className="lims-detail-panel">
            <div className="card lims-detail-card">
              <div className="detail-header">
                <h2>
                  <span className="eln-badge">{selectedEntity.display_id}</span>
                  {selectedEntity.name}
                </h2>
                <button
                  className="lims-detail-close"
                  onClick={() => { setSelectedId(null); setSelectedEntity(null); }}
                >
                  ×
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
          </div>
        )}
      </div>
    </div>
  );
}

export default LimsList;
