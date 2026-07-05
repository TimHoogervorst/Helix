import { useNavigate } from "react-router-dom";
import type { EntityListItem } from "../types";
import ConsoleMasterPanel, {
  type MasterColumn,
} from "../../../core/console/ConsoleMasterPanel";
import ReferenceBadge from "../../../shared/ReferenceBadge";

const LIMS_COLUMNS: MasterColumn[] = [
  { label: "ID" },
  { label: "Name" },
  { label: "Type" },
  { label: "Created" },
  { label: "Source" },
  { className: "console-master-row-expand-header", label: "" },
];

interface LimsTableProps {
  entities: EntityListItem[];
  selectedId: string | null;
  nextUrl: string | null;
  onRowClick: (entity: EntityListItem) => void;
  onLoadMore: () => void;
  loadingMore: boolean;
}

function LimsTable({
  entities,
  selectedId,
  nextUrl,
  onRowClick,
  onLoadMore,
  loadingMore,
}: LimsTableProps) {
  const navigate = useNavigate();

  const handleRowExpand = (entity: EntityListItem) => {
    navigate(`/lims/${entity.display_id}`);
  };

  return (
    <ConsoleMasterPanel
      columns={LIMS_COLUMNS}
      colSpan={6}
      itemCount={entities.length}
      emptyMessage="No entities found."
      hasMore={!!nextUrl}
      onLoadMore={onLoadMore}
      loadingMore={loadingMore}
    >
      {entities.map((entity) => (
        <tr
          key={entity.display_id}
          className={`console-master-row${selectedId === entity.display_id ? " is-selected" : ""}`}
          onClick={() => onRowClick(entity)}
        >
          <td>
            <ReferenceBadge
              displayId={entity.display_id}
              clickable={false}
              compact={true}
              resolved={{
                displayId: entity.display_id,
                title: entity.name,
                type: "entity",
                id: entity.id,
                icon: entity.entity_type_icon || "🧪",
              }}
            />
          </td>
          <td>{entity.name}</td>
          <td>{entity.entity_type_name}</td>
          <td className="console-master-date">
            {new Date(entity.created_at).toLocaleString()}
          </td>
          <td>
            {entity.source_entry_display_id ? (
              <ReferenceBadge
                displayId={entity.source_entry_display_id}
                clickable
              />
            ) : (
              <span className="lims-no-source">—</span>
            )}
          </td>
          <td style={{ width: 40, padding: "0.25rem" }}>
            <button
              className="console-master-row-expand-btn"
              onClick={(e) => {
                e.stopPropagation();
                handleRowExpand(entity);
              }}
              title="Expand to full detail"
            >
              &gt;
            </button>
          </td>
        </tr>
      ))}
    </ConsoleMasterPanel>
  );
}

export default LimsTable;
