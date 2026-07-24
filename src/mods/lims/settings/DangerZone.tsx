export interface DangerZoneProps {
  /** Which delete operation is in flight (key), or null if idle. */
  dangerLoading: string | null;
  /** Result message from the last delete operation. */
  dangerResult: string | null;
  onDeleteAllElms: () => void;
  onDeleteAllEntities: () => void;
  onDeleteAllSchemas: () => void;
  onDeleteEverything: () => void;
}

/**
 * Danger Zone section — destructive actions for testing use.
 *
 * Renders three delete buttons with confirmation.  The parent owns
 * the loading/result state and API-call logic.
 */
function DangerZone({
  dangerLoading,
  dangerResult,
  onDeleteAllElms,
  onDeleteAllEntities,
  onDeleteAllSchemas,
  onDeleteEverything,
}: DangerZoneProps) {
  return (
    <section className="settings-danger-zone">
      <h2>⚠️ Danger Zone</h2>
      <p className="danger-zone-desc">
        These actions are destructive and cannot be undone. For testing use only.
      </p>

      {dangerResult && (
        <div
          className={
            dangerResult.startsWith("Failed") ? "error" : "danger-success"
          }
        >
          {dangerResult}
        </div>
      )}

      <div className="danger-zone-actions">
        <button
          className="danger-btn danger-btn-elns"
          onClick={onDeleteAllElms}
          disabled={dangerLoading !== null}
        >
          {dangerLoading === "elns" ? "Deleting…" : "🗑️ DELETE ALL ELNs"}
        </button>
        <button
          className="danger-btn danger-btn-entities"
          onClick={onDeleteAllEntities}
          disabled={dangerLoading !== null}
        >
          {dangerLoading === "entities" ? "Deleting…" : "🗑️ DELETE ALL ENTITIES"}
        </button>
        <button
          className="danger-btn danger-btn-schemas"
          onClick={onDeleteAllSchemas}
          disabled={dangerLoading !== null}
        >
          {dangerLoading === "schemas" ? "Deleting…" : "🗑️ DELETE ALL SCHEMAS"}
        </button>
        <button
          className="danger-btn danger-btn-everything"
          onClick={onDeleteEverything}
          disabled={dangerLoading !== null}
        >
          {dangerLoading === "everything" ? "Deleting…" : "💀 DELETE EVERYTHING"}
        </button>
      </div>
    </section>
  );
}

export default DangerZone;
