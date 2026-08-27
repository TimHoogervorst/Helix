import type { ReactNode } from "react";
import { useState } from "react";
import type { EntityListItem } from "../types";
import { ActivityFeedBlock } from "../blocks/ActivityFeedBlock";

/** Tab configuration — canonical source for entity workspace tabs. */
interface TabConfig {
  id: string;
  label: string;
}

const ENTITY_TABS: TabConfig[] = [
  { id: "activity", label: "Activity" },
  { id: "insights", label: "Insights" },
  { id: "storage", label: "Storage" },
];

function PlaceholderTab({ label }: { label: string }) {
  return (
    <div className="lims-properties-empty">
      {label} — coming soon.
    </div>
  );
}

interface LimsWorkspaceProps {
  entity: EntityListItem;
  isExiting: boolean;
  /** Optional slot rendered above the tab bar (e.g. entity header fields). */
  children?: ReactNode;
}

function LimsWorkspace({ entity, isExiting, children }: LimsWorkspaceProps) {
  const [activeTab, setActiveTab] = useState(ENTITY_TABS[0].id);

  const panelClass = `lims-workspace-panel${isExiting ? " is-exiting" : ""}`;

  return (
    <div className={panelClass}>
      <div className="card">
        {children}
        <div className="lims-tab-bar">
          {ENTITY_TABS.map((tab) => (
            <button
              key={tab.id}
              className={`lims-tab${activeTab === tab.id ? " is-active" : ""}`}
              onClick={() => setActiveTab(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </div>
        <div className="lims-tab-content">
          {ENTITY_TABS.map((tab) =>
            activeTab === tab.id ? (
              tab.id === "activity" ? (
                <ActivityFeedBlock
                  key={tab.id}
                  context={{
                    workspaceId: "lims",
                    user: null,
                    viewMode: "view",
                    entityId: String(entity.id),
                    displayId: entity.display_id,
                  }}
                  instance={{
                    id: "lims.activity-feed::workspace",
                    blockId: "lims.activity-feed",
                    slotId: "lims.entity-workspace",
                    attrs: {},
                    updateAttrs: () => undefined,
                  }}
                  overrides={{}}
                />
              ) : (
                <PlaceholderTab key={tab.id} label={tab.label} />
              )
            ) : null,
          )}
        </div>
      </div>
    </div>
  );
}

export default LimsWorkspace;
