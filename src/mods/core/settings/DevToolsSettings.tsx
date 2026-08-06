import { useState } from "react";
import { Wrench, AlertTriangle } from "lucide-react";
import { del } from "../../../shell/src/api/client";
import { SettingsPageLayout } from "../../../shell/src/shared/components/SettingsPageLayout";
import { SettingsHeroHeader } from "../../../shell/src/shared/components/SettingsHeroHeader";
import { SettingsSectionCard } from "../../../shell/src/shared/components/SettingsSectionCard";

type ActionKey = "entities" | "entries" | "schemas" | "everything";

interface Action {
  key: ActionKey;
  label: string;
  description: string;
  endpoint: string;
}

const ACTIONS: Action[] = [
  {
    key: "entities",
    label: "DELETE ALL ENTITIES",
    description: "Hard-deletes every LIMS entity. Does not delete schemas or notebook entries.",
    endpoint: "/lims/entities/delete_all/",
  },
  {
    key: "entries",
    label: "DELETE ALL ENTRIES",
    description: "Hard-deletes every ELN notebook entry. Does not delete entities or schemas.",
    endpoint: "/eln/entries/delete_all/",
  },
  {
    key: "schemas",
    label: "DELETE ALL SCHEMAS",
    description:
      "Hard-deletes all schemas (and cascades to entities and entries). Use with extreme caution.",
    endpoint: "/schemas/delete_all/",
  },
  {
    key: "everything",
    label: "DELETE EVERYTHING",
    description:
      "Nuclear option — hard-deletes every mention, entry, entity, and schema. Irreversible.",
    endpoint: "/delete-everything/",
  },
];

function DevToolsSettings() {
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<ActionKey | null>(null);

  const handleDelete = async (action: Action) => {
    setError(null);
    setStatus(null);
    try {
      const result = await del<{ deleted: number; breakdown?: Record<string, number> }>(
        action.endpoint,
      );
      const total = result?.deleted ?? 0;
      setStatus(`"${action.label}" completed — ${total} record${total !== 1 ? "s" : ""} deleted.`);
      setConfirming(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Deletion failed");
    }
  };

  return (
    <SettingsPageLayout
      hero={
        <SettingsHeroHeader
          eyebrow="developer tools"
          title="Dev/test utilities"
          description="Mass-deletion tools for resetting test data. Every operation is irreversible — use with caution and only in development environments."
        />
      }
    >
      {error && (
        <div className="mb-4 rounded-md border border-warn/30 bg-warn/10 px-4 py-2.5 text-sm text-warn">
          {error}
        </div>
      )}
      {status && (
        <div className="mb-4 rounded-md border border-success/30 bg-success/10 px-4 py-2.5 text-sm text-success">
          {status}
        </div>
      )}

      <SettingsSectionCard
        title="Danger Zone"
        subtitle="These operations permanently delete data. There is no undo."
      >
        <div className="space-y-4">
          {ACTIONS.map((action) => (
            <div
              key={action.key}
              className="flex items-center justify-between rounded-md border border-destructive/20 bg-destructive/5 px-4 py-3"
            >
              <div className="flex items-start gap-3">
                <AlertTriangle size={16} className="mt-0.5 shrink-0 text-destructive" />
                <div>
                  <span className="text-sm font-semibold text-destructive">
                    {action.label}
                  </span>
                  <p className="text-xs text-muted-foreground">{action.description}</p>
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {confirming === action.key ? (
                  <>
                    <span className="text-xs font-medium text-destructive">Are you sure?</span>
                    <button
                      type="button"
                      className="rounded-md bg-destructive px-3 py-1.5 text-xs font-semibold text-destructive-foreground transition-colors hover:bg-destructive/90"
                      onClick={() => handleDelete(action)}
                    >
                      Confirm
                    </button>
                    <button
                      type="button"
                      className="rounded-md border border-hairline bg-surface px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-muted"
                      onClick={() => setConfirming(null)}
                    >
                      Cancel
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-1.5 text-xs font-semibold text-destructive transition-colors hover:bg-destructive/20 hover:text-destructive"
                    onClick={() => setConfirming(action.key)}
                  >
                    {action.label}
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </SettingsSectionCard>
    </SettingsPageLayout>
  );
}

export default DevToolsSettings;
