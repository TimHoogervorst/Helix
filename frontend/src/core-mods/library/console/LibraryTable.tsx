import type { LibraryItem } from "../types";
import ReferenceBadge from "../../../shared/ReferenceBadge";
import ConsoleMasterPanel, {
  type MasterColumn,
} from "../../../core/console/ConsoleMasterPanel";

interface LibraryTableProps {
  items: LibraryItem[];
  selectedId: number | null;
  onRowClick: (item: LibraryItem) => void;
  onRowExpand: (item: LibraryItem) => void;
  onFolderNavigate: (folderName: string) => void;
}

const COLUMNS: MasterColumn[] = [
  { label: "ID" },
  { label: "Name" },
  { label: "Type" },
  { label: "Created" },
  { label: "Folder" },
  { className: "console-master-row-expand-header", label: "" },
];

import { formatDate } from "../../../shared/format";

function LibraryTable({
  items,
  selectedId,
  onRowClick,
  onRowExpand,
  onFolderNavigate,
}: LibraryTableProps) {
  return (
    <ConsoleMasterPanel
      columns={COLUMNS}
      colSpan={6}
      itemCount={items.length}
      emptyMessage="This folder is empty."
    >
      {items.map((item) => {
        const isSelected =
          item.type === "entry" && selectedId === item.id;
        return (
          <tr
            key={`${item.type}-${item.id}`}
            className={`console-master-row${isSelected ? " is-selected" : ""}`}
            onClick={() => onRowClick(item)}
          >
            <td>
              {item.type === "entry" ? (
                <ReferenceBadge
                  displayId={item.display_id}
                  clickable={false}
                  compact={true}
                  resolved={{
                    displayId: item.display_id,
                    title: item.title,
                    type: "entry",
                    id: item.id,
                    icon: "📄",
                  }}
                />
              ) : (
                <span className="library-no-id">—</span>
              )}
            </td>
            <td>
              {item.type === "folder" ? (
                <span className="library-folder-name">
                  📁 {item.name}
                </span>
              ) : (
                item.title
              )}
            </td>
            <td>
              {item.type === "folder" ? "—" : "ELN Entry"}
            </td>
            <td className="console-master-date">
              {formatDate(item.created_at)}
            </td>
            <td>
              {item.type === "entry"
                ? item.folder_name || "—"
                : "—"}
            </td>
            <td style={{ width: 40, padding: "0.25rem" }}>
              {item.type === "entry" && (
                <button
                  className="console-master-row-expand-btn"
                  onClick={(e) => {
                    e.stopPropagation();
                    onRowExpand(item);
                  }}
                  title="Open entry"
                >
                  &gt;
                </button>
              )}
              {item.type === "folder" && (
                <button
                  className="console-master-row-expand-btn"
                  onClick={(e) => {
                    e.stopPropagation();
                    onFolderNavigate(item.name);
                  }}
                  title="Open folder"
                >
                  &gt;
                </button>
              )}
            </td>
          </tr>
        );
      })}
    </ConsoleMasterPanel>
  );
}

export default LibraryTable;
