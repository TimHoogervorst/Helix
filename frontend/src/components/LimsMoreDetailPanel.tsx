import { useState } from "react";
import type { EntityListItem } from "../types/lims";
import BrowserWorkspacePanel from "./browser/BrowserWorkspacePanel";

/** Tab configuration — add entries here for future tabs. */
interface TabConfig {
  id: string;
  label: string;
}

const TABS: TabConfig[] = [
  { id: "activity", label: "Activity" },
  { id: "insights", label: "Insights" },
  { id: "storage", label: "Storage" },
];

interface LimsMoreDetailPanelProps {
  entity: EntityListItem;
  isExiting: boolean;
}

function PlaceholderTab({ label }: { label: string }) {
  return (
    <div className="browser-properties-empty">
      {label} — coming soon.
    </div>
  );
}

function LimsMoreDetailPanel({ entity: _entity, isExiting }: LimsMoreDetailPanelProps) {
  const [activeTab, setActiveTab] = useState(TABS[0].id);

  return (
    <BrowserWorkspacePanel isExiting={isExiting}>
      <div className="card">
        <div className="browser-tab-bar">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              className={`browser-tab${activeTab === tab.id ? " is-active" : ""}`}
              onClick={() => setActiveTab(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </div>
        <div className="browser-tab-content">
          {TABS.map((tab) =>
            activeTab === tab.id ? (
              <PlaceholderTab key={tab.id} label={tab.label} />
            ) : null,
          )}
        </div>
      </div>
    </BrowserWorkspacePanel>
  );
}

export default LimsMoreDetailPanel;
