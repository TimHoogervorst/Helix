import type { ReactNode } from "react";
import type { EntityListItem } from "../types/lims";
import ReferenceBadge from "./ReferenceBadge";

export interface EntityDetailFieldsProps {
  entity: EntityListItem;
  /** Show the properties table? Default false. */
  showProperties?: boolean;
  /** Slot below the field rows, above the properties table. */
  children?: ReactNode;
}

import { formatDate } from "../utils/format";

function EntityDetailFields({
  entity,
  showProperties = false,
  children,
}: EntityDetailFieldsProps) {
  return (
    <>
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

      {children}

      {showProperties &&
        (entity.properties && Object.keys(entity.properties).length > 0 ? (
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
            <p className="console-properties-empty">No properties defined.</p>
          </div>
        ))}
    </>
  );
}

export default EntityDetailFields;
