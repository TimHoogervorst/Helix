import { useState } from "react";
import type { EntityType, ColumnDef } from "../types";
import MentionBadge from "../../../shared/components/MentionBadge";
import ColumnEditor, { type ColumnEditorProps } from "./ColumnEditor";

const CURATED_EMOJIS = ["🧪", "🩸", "🐁", "🌿", "👤", "🧬", "🔬"];

export interface TypeDetailPanelProps {
  /** The live (server) version of the selected entity type. */
  liveEntity: EntityType;
  /** The dirty (editing) copy — may differ from liveEntity. */
  editingEntity: EntityType;
  /** Whether this schema has unsaved changes. */
  isDirty: boolean;
  onClose: () => void;
  onDeactivate: (et: EntityType) => void;
  /** Called when the user picks a new emoji icon. */
  onSetEmoji: (emoji: string) => void;
  /** Column editor callbacks (forwarded to ColumnEditor). */
  columnProps: Omit<ColumnEditorProps, "columns"> & {
    columns: ColumnDef[];
  };
}

/**
 * Right-panel detail card for a schema — shows info fields + column editor.
 *
 * Manages its own emoji-picker popover state.  Column editing is delegated
 * to ColumnEditor via the `columnProps` bag.
 */
function TypeDetailPanel({
  liveEntity,
  editingEntity,
  onClose,
  onDeactivate,
  onSetEmoji,
  columnProps,
}: TypeDetailPanelProps) {
  const [popover, setPopover] = useState<"header" | "body" | null>(null);

  const renderEmojiPicker = (source: "header" | "body") => {
    if (popover !== source) return null;

    return (
      <span
        className="settings-emoji-popover"
        onMouseLeave={() => setPopover(null)}
      >
        {CURATED_EMOJIS.map((emoji) => (
          <button
            key={emoji}
            className={`settings-emoji-option${editingEntity.icon === emoji ? " is-selected" : ""}`}
            onClick={() => {
              onSetEmoji(emoji);
              setPopover(null);
            }}
            title={`Set icon to ${emoji}`}
          >
            {emoji}
          </button>
        ))}
      </span>
    );
  };

  return (
    <div className="settings-detail-panel">
      <div className="card settings-detail-card">
        <div className="detail-header">
          <h2>
            <MentionBadge
              displayId={`${editingEntity.prefix}…`}
              clickable={false}
            />
            <span
              style={{
                position: "relative",
                cursor: "pointer",
                userSelect: "none",
              }}
            >
              <span
                onClick={() =>
                  setPopover((prev) =>
                    prev === "header" ? null : "header",
                  )
                }
                style={{ fontSize: "1.2rem" }}
                title="Change icon"
              >
                {editingEntity.icon || "🧪"}
              </span>
              {renderEmojiPicker("header")}
            </span>
            {liveEntity.name}
          </h2>
          <div className="detail-header-actions">
            {liveEntity.is_active && (
              <button
                className="deactivate-btn"
                onClick={() => onDeactivate(liveEntity)}
                title="Deactivate schema"
              >
                🗑️
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
            <span className="detail-label">Status</span>
            <span>{liveEntity.is_active ? "Active" : "Inactive"}</span>
          </div>
          <div className="detail-field">
            <span className="detail-label">Prefix</span>
            <MentionBadge
              displayId={`${editingEntity.prefix}…`}
              clickable={false}
            />
          </div>
          <div className="detail-field">
            <span className="detail-label">Icon</span>
            <span
              style={{
                position: "relative",
                cursor: "pointer",
                userSelect: "none",
                display: "inline-block",
              }}
            >
              <span
                onClick={() =>
                  setPopover((prev) =>
                    prev === "body" ? null : "body",
                  )
                }
                style={{ fontSize: "1.2rem" }}
                title="Change icon"
              >
                {editingEntity.icon || "🧪"}
              </span>
              {renderEmojiPicker("body")}
            </span>
          </div>
          <div className="detail-field">
            <span className="detail-label">Columns</span>
            <span>{editingEntity.columns.length}</span>
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
