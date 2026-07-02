import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { get } from "../api/client";
import type { EntityListItem } from "../types/lims";
import ReferenceBadge from "../components/ReferenceBadge";
import EntityDetailFields from "../components/EntityDetailFields";
import EntityWorkspacePanel from "../workspaces/lims/EntityWorkspace";

/**
 * Full-page entity workspace (route: /lims/:displayId).
 *
 * Thin fetcher wrapping the canonical {@link EntityWorkspacePanel} from
 * workspaces/lims.  Fetches the entity by displayId and renders an entity
 * header card above the shared tabbed workspace panel.
 */
function EntityWorkspace() {
  const { displayId } = useParams<{ displayId: string }>();
  const navigate = useNavigate();
  const [entity, setEntity] = useState<EntityListItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!displayId) return;
    let cancelled = false;

    async function fetchEntity() {
      setLoading(true);
      setError(null);
      try {
        const data = await get<EntityListItem>(
          `/lims/entities/${encodeURIComponent(displayId!)}/`,
        );
        if (!cancelled) setEntity(data);
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error ? err.message : "Failed to load entity",
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    fetchEntity();
    return () => {
      cancelled = true;
    };
  }, [displayId]);

  if (loading) {
    return (
      <div className="page">
        <p className="empty">Loading…</p>
      </div>
    );
  }

  if (error || !entity) {
    return (
      <div className="page">
        <div className="error">{error || "Entity not found."}</div>
        <button
          className="btn"
          onClick={() => navigate("/lims")}
          style={{ marginTop: "1rem" }}
        >
          ← Back to LIMS
        </button>
      </div>
    );
  }

  return (
    <div className="flex gap-6 items-start p-6">
      {/* Entity header card */}
      <div className="card flex-1 min-w-0">
        <div className="detail-header">
          <h2>
            <ReferenceBadge
              displayId={entity.display_id}
              clickable={false}
              compact={true}
              resolved={{
                displayId: entity.display_id,
                title: entity.name,
                type: "entity",
                id: entity.id,
                icon: entity.entity_type_icon || "🧪",
              }}
            />
            {entity.name}
          </h2>
        </div>
        <EntityDetailFields entity={entity} showProperties />
      </div>

      {/* Workspace panel with tabs — no back button */}
      <EntityWorkspacePanel
        entity={entity}
        isExiting={false}
      />
    </div>
  );
}

export default EntityWorkspace;
