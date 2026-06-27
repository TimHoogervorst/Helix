import type { EntityListItem } from "../types/lims";
import type { ViewState } from "../types/browser";
import ReferenceBadge from "./ReferenceBadge";
import BrowserDetailPanel from "./browser/BrowserDetailPanel";

interface LimsDetailCardProps {
  entity: EntityListItem;
  viewState: ViewState;
  onClose: () => void;
  onCollapse: () => void;
}

function LimsDetailCard({
  entity,
  viewState,
  onClose,
  onCollapse,
}: LimsDetailCardProps) {
  const formatDate = (iso: string) => new Date(iso).toLocaleString();

  return (
    <BrowserDetailPanel
      viewState={viewState}
      onClose={onClose}
      expandUrl={`/lims/${entity.display_id}`}
      onCollapse={onCollapse}
    >
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
        {entity.source_entry_display_id && (
          <div className="detail-field">
            <span className="detail-label">Source Entry</span>
            <ReferenceBadge
              displayId={entity.source_entry_display_id}
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
          <p className="browser-properties-empty">No properties defined.</p>
        </div>
      )}
    </BrowserDetailPanel>
  );
}

export default LimsDetailCard;
