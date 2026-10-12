import type { ReactNode } from "react";
import type { EntityListItem } from "../types";
import {
  Table,
  TableHead,
  TableRow,
  TableHeaderCell,
  TableCell,
} from "../../../shell/src/shared/primitives/Table";

export interface EntityDetailFieldsProps {
  entity: EntityListItem;
  /** Show the properties table? Default false. */
  showProperties?: boolean;
  /** Slot below the field rows, above the properties table. */
  children?: ReactNode;
}

import { formatDate } from "../../../shell/src/shared/format";

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
            {entity.schema_name} ({entity.schema_prefix})
          </span>
        </div>
        <div className="detail-field">
          <span className="detail-label">Created</span>
          <span>{formatDate(entity.created_at)}</span>
        </div>
        <div className="detail-field">
          <span className="detail-label">By</span>
          <span>{entity.author_username || "—"}</span>
        </div>
      </div>

      {children}

      {showProperties &&
        (entity.properties && Object.keys(entity.properties).length > 0 ? (
          <div className="detail-properties">
            <h3>Properties</h3>
            <Table>
              <TableHead>
                <TableRow>
                  <TableHeaderCell>Field</TableHeaderCell>
                  <TableHeaderCell>Value</TableHeaderCell>
                </TableRow>
              </TableHead>
              <tbody>
                {Object.entries(entity.properties).map(([key, value]) => (
                  <TableRow key={key}>
                    <TableCell className="prop-key">{key}</TableCell>
                    <TableCell className="prop-value">
                      {typeof value === "boolean"
                        ? value
                          ? "✓"
                          : "✗"
                        : String(value ?? "—")}
                    </TableCell>
                  </TableRow>
                ))}
              </tbody>
            </Table>
          </div>
        ) : (
          <div className="detail-properties">
            <h3>Properties</h3>
            <p className="lims-properties-empty">No properties defined.</p>
          </div>
        ))}
    </>
  );
}

export default EntityDetailFields;
