import type { EntryListItem } from "../types";
import ReferenceBadge from "../../../shared/ReferenceBadge";

interface ElnTableProps {
  entries: EntryListItem[];
  selectedId: number | null;
  onRowClick: (entry: EntryListItem) => void;
  onRowExpand: (entry: EntryListItem) => void;
}

function ElnTable({ entries, selectedId, onRowClick, onRowExpand }: ElnTableProps) {
  return (
    <table className="console-master-table">
      <thead>
        <tr>
          <th>ID</th>
          <th>Title</th>
          <th>Author</th>
          <th>Updated</th>
          <th className="console-master-row-expand-header"></th>
        </tr>
      </thead>
      <tbody>
        {entries.map((entry) => (
          <tr
            key={entry.id}
            className={`console-master-row${selectedId === entry.id ? " is-selected" : ""}`}
            onClick={() => onRowClick(entry)}
          >
            <td>
              <ReferenceBadge
                displayId={entry.display_id}
                clickable={false}
                compact={true}
                resolved={{
                  displayId: entry.display_id,
                  title: entry.title,
                  type: "entry",
                  id: entry.id,
                  icon: "📄",
                }}
              />
            </td>
            <td>{entry.title}</td>
            <td>{entry.author_username || "—"}</td>
            <td className="console-master-date">
              {new Date(entry.updated_at).toLocaleString()}
            </td>
            <td style={{ width: 40, padding: "0.25rem" }}>
              <button
                className="console-master-row-expand-btn"
                onClick={(e) => {
                  e.stopPropagation();
                  onRowExpand(entry);
                }}
                title="Expand to full detail"
              >
                &gt;
              </button>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export default ElnTable;
