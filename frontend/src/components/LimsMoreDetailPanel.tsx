import { useState } from "react";
import type { EntityListItem } from "../types/lims";

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
    <div className="lims-properties-empty">
      {label} — coming soon.
    </div>
  );
}

function LimsMoreDetailPanel({ entity: _entity, isExiting }: LimsMoreDetailPanelProps) {
  const [activeTab, setActiveTab] = useState(TABS[0].id);

  return (
    <div
      className={`lims-more-detail-panel${isExiting ? " is-exiting" : ""}`}
    >
      <div className="card">
        <div className="lims-tab-bar">
          {TABS.map((tab) => (
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
          {TABS.map((tab) =>
            activeTab === tab.id ? (
              <PlaceholderTab key={tab.id} label={tab.label} />
            ) : null,
          )}
        </div>
      </div>
    </div>
  );
}

export default LimsMoreDetailPanel;
