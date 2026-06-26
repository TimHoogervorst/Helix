import type { EntityListItem, ViewState } from "../types/lims";
import ReferenceBadge from "./ReferenceBadge";

interface LimsDetailCardProps {
  entity: EntityListItem;
  viewState: ViewState;
  onClose: () => void;
  onExpand: () => void;
  onCollapse: () => void;
}

function LimsDetailCard({
  entity,
  viewState,
  onClose,
  onExpand,
  onCollapse,
}: LimsDetailCardProps) {
  const formatDate = (iso: string) => new Date(iso).toLocaleString();

  return (
    <div className="lims-detail-panel">
      <div className="card lims-detail-card">
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
          <div className="detail-header-actions">
            {viewState === "detail" && (
              <button
                className="lims-detail-expand"
                onClick={onExpand}
                title="Expand to full detail"
              >
                &gt;
              </button>
            )}
            {viewState === "expanded" && (
              <button
                className="lims-detail-collapse"
                onClick={onCollapse}
                title="Collapse to summary"
              >
                &lt;
              </button>
            )}
            <button
              className="lims-detail-close"
              onClick={onClose}
              title="Close detail"
            >
              &times;
            </button>
          </div>
        </div>
        <div className="detail-body">
          <div className="detail-field">
            <span className="detail-label">Type</span>
            <span>
              {entity.entity_type_name} ({entity.entity_type_prefix})
            </span>
          </div>
          <div className="detail-field">
            <span className="detail-label">Created</span>
            <span>{formatDate(entity.created_at)}</span>
          </div>
          <div className="detail-field">
            <span className="detail-label">By</span>
            <span>{entity.created_by_username || "—"}</span>
          </div>
          {entity.source_entry && (
            <div className="detail-field">
              <span className="detail-label">Source Entry</span>
              <ReferenceBadge
                displayId={`E${entity.source_entry}`}
                clickable
              />
            </div>
          )}
        </div>

        {/* Properties table — part of the detail card */}
        {entity.properties && Object.keys(entity.properties).length > 0 ? (
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
                {Object.entries(entity.properties).map(([key, value]) => (
                  <tr key={key}>
                    <td className="prop-key">{key}</td>
                    <td className="prop-value">
                      {typeof value === "boolean"
                        ? value
                          ? "✓"
                          : "✗"
                        : String(value ?? "—")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="detail-properties">
            <h3>Properties</h3>
            <p className="lims-properties-empty">No properties defined.</p>
          </div>
        )}
      </div>
    </div>
  );
}

export default LimsDetailCard;
