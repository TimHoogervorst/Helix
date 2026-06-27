import type { EntityListItem } from "../../types/lims";
import type { ViewState } from "../../types/console";
import ReferenceBadge from "../../components/ReferenceBadge";
import ConsoleDetailPanel from "../../console/core/ConsoleDetailPanel";
import EntityDetailFields from "../../components/EntityDetailFields";

interface LimsDetailCardProps {
  entity: EntityListItem;
  viewState: ViewState;
  onClose: () => void;
  onCollapse: () => void;
}

function LimsDetailCard({
  entity,
  viewState,
  onClose,
  onCollapse,
}: LimsDetailCardProps) {
  return (
    <ConsoleDetailPanel
      viewState={viewState}
      onClose={onClose}
      expandUrl={`/lims/${entity.display_id}`}
      onCollapse={onCollapse}
    >
      <div className="detail-header">
        <h2>
          <ReferenceBadge
            displayId={entity.display_id}
            clickable={false}
            resolved={{
              displayId: entity.display_id,
              title: entity.name,
              type: "entity",
              id: entity.id,
              icon: entity.entity_type_icon || "🧪",
            }}
          />
          {entity.name}
        </h2>
      </div>
      <EntityDetailFields entity={entity} />
    </ConsoleDetailPanel>
  );
}

export default LimsDetailCard;
