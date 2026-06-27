import { useState, useEffect } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { get } from "../api/client";
import type { EntityListItem } from "../types/lims";
import ReferenceBadge from "../components/ReferenceBadge";
import EntityDetailFields from "../components/EntityDetailFields";
import BrowserWorkspacePanel from "../components/browser/BrowserWorkspacePanel";

/** Tab configuration — matches the tabs in LimsMoreDetailPanel. */
interface TabConfig {
  id: string;
  label: string;
}

const TABS: TabConfig[] = [
  { id: "activity", label: "Activity" },
  { id: "insights", label: "Insights" },
  { id: "storage", label: "Storage" },
];

function PlaceholderTab({ label }: { label: string }) {
  return (
    <div className="browser-properties-empty">
      {label} — coming soon.
    </div>
  );
}

function EntityWorkspace() {
  const { displayId } = useParams<{ displayId: string }>();
  const navigate = useNavigate();
  const [entity, setEntity] = useState<EntityListItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState(TABS[0].id);

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
    <div className="page">
      {/* Back navigation */}
      <div style={{ marginBottom: "1rem" }}>
        <Link to="/lims" className="btn">
          ← Back to LIMS
        </Link>
      </div>

      {/* Entity header */}
      <div className="card" style={{ marginBottom: "1rem" }}>
        <div className="detail-header">
          <h2>
            <ReferenceBadge
              displayId={entity.display_id}
              clickable={false}
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

      {/* Workspace panel with tabs */}
      <BrowserWorkspacePanel dedicatedUrl={`/lims/${entity.display_id}`}>
        <div className="card">
          <div className="browser-tab-bar">
            {TABS.map((tab) => (
              <button
                key={tab.id}
                className={`browser-tab${activeTab === tab.id ? " is-active" : ""}`}
                onClick={() => setActiveTab(tab.id)}
              >
                {tab.label}
              </button>
            ))}
          </div>
          <div className="browser-tab-content">
            {TABS.map((tab) =>
              activeTab === tab.id ? (
                <PlaceholderTab key={tab.id} label={tab.label} />
              ) : null,
            )}
          </div>
        </div>
      </BrowserWorkspacePanel>
    </div>
  );
}

export default EntityWorkspace;
