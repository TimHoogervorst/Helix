import type { ReactNode } from "react";
import { useState } from "react";
import type { EntityListItem } from "../types";
import ConsoleWorkspacePanel from "../../../core/console/ConsoleWorkspacePanel";

/** Tab configuration — canonical source for entity workspace tabs. */
interface TabConfig {
  id: string;
  label: string;
}

export const ENTITY_TABS: TabConfig[] = [
  { id: "activity", label: "Activity" },
  { id: "insights", label: "Insights" },
  { id: "storage", label: "Storage" },
];

export function PlaceholderTab({ label }: { label: string }) {
  return (
    <div className="console-properties-empty">
      {label} — coming soon.
    </div>
  );
}

interface LimsWorkspaceProps {
  entity: EntityListItem;
  isExiting: boolean;
  /** Optional URL pointing back to the master panel (used when rendered as a full page). */
  backUrl?: string;
  /** Optional slot rendered above the tab bar (e.g. entity header fields). */
  children?: ReactNode;
}

function LimsWorkspace({ entity: _entity, isExiting, backUrl, children }: LimsWorkspaceProps) {
  const [activeTab, setActiveTab] = useState(ENTITY_TABS[0].id);

  return (
    <ConsoleWorkspacePanel isExiting={isExiting} backUrl={backUrl}>
      <div className="card">
        {children}
        <div className="console-tab-bar">
          {ENTITY_TABS.map((tab) => (
            <button
              key={tab.id}
              className={`console-tab${activeTab === tab.id ? " is-active" : ""}`}
              onClick={() => setActiveTab(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </div>
        <div className="console-tab-content">
          {ENTITY_TABS.map((tab) =>
            activeTab === tab.id ? (
              <PlaceholderTab key={tab.id} label={tab.label} />
            ) : null,
          )}
        </div>
      </div>
    </ConsoleWorkspacePanel>
  );
}

export default LimsWorkspace;
