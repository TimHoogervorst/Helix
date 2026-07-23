import type { Schema, ColumnDef } from "../types";
import MentionBadge from "../../../shell/src/shared/components/MentionBadge";
import ColumnEditor, { type ColumnEditorProps } from "./ColumnEditor";

export interface TypeDetailPanelProps {
  /** The live (server) version of the selected schema. */
  liveSchema: Schema;
  /** The dirty (editing) copy — may differ from liveSchema. */
  editingSchema: Schema;
  /** Whether this schema has unsaved changes. */
  isDirty: boolean;
  onClose: () => void;
  onDeactivate: (s: Schema) => void;
  onReactivate: (s: Schema) => void;
  /** Column editor callbacks (forwarded to ColumnEditor). */
  columnProps: Omit<ColumnEditorProps, "columns"> & {
    columns: ColumnDef[];
  };
}

/**
 * Right-panel detail card for a schema — shows info fields + column editor.
 *
 * Column editing is delegated to ColumnEditor via the `columnProps` bag.
 * System (default) schemas cannot be deleted.
 */
function TypeDetailPanel({
  liveSchema,
  editingSchema,
  onClose,
  onDeactivate,
  onReactivate,
  columnProps,
}: TypeDetailPanelProps) {
  return (
    <div className="settings-detail-panel">
      <div className="card settings-detail-card">
        <div className="detail-header">
          <h2>
            {liveSchema.is_default ? (
              <span className="system-badge">System</span>
            ) : (
              <MentionBadge
                displayId={`${editingSchema.prefix}…`}
                clickable={false}
              />
            )}
            {liveSchema.name}
          </h2>
          <div className="detail-header-actions">
            {liveSchema.is_active ? (
              <button
                className="deactivate-btn"
                onClick={() => onDeactivate(liveSchema)}
                title="Deactivate schema"
              >
                🗑️
              </button>
            ) : (
              <button
                className="activate-btn"
                onClick={() => onReactivate(liveSchema)}
                title="Reactivate schema"
              >
                🔄
              </button>
            )}
            <button
              className="type-detail-close"
              onClick={onClose}
            >
              ×
            </button>
          </div>
        </div>

        <div className="detail-body">
          <div className="detail-field">
            <span className="detail-label">Schema Type</span>
            <span>{liveSchema.schema_type_display}</span>
          </div>
          <div className="detail-field">
            <span className="detail-label">Status</span>
            <span>{liveSchema.is_active ? "Active" : "Inactive"}</span>
          </div>
          <div className="detail-field">
            <span className="detail-label">Prefix</span>
            {liveSchema.is_default ? (
              <span className="detail-system-note">Auto-generated (system default)</span>
            ) : (
              <MentionBadge
                displayId={`${editingSchema.prefix}…`}
                clickable={false}
              />
            )}
          </div>
          <div className="detail-field">
            <span className="detail-label">Columns</span>
            <span>{editingSchema.columns.length}</span>
          </div>
        </div>

        <ColumnEditor
          columns={columnProps.columns}
          onAdd={columnProps.onAdd}
          onUpdate={columnProps.onUpdate}
          onRemove={columnProps.onRemove}
          onMove={columnProps.onMove}
          onDiscard={columnProps.onDiscard}
        />
      </div>
    </div>
  );
}

export default TypeDetailPanel;
