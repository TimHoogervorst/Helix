import type { LibraryItem } from "../types/library";
import ReferenceBadge from "./ReferenceBadge";

interface LibraryTableProps {
  items: LibraryItem[];
  selectedId: number | null;
  onRowClick: (item: LibraryItem) => void;
  onRowExpand: (item: LibraryItem) => void;
  onFolderNavigate: (folderName: string) => void;
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleString();
}

function LibraryTable({
  items,
  selectedId,
  onRowClick,
  onRowExpand,
  onFolderNavigate,
}: LibraryTableProps) {
  return (
    <div className="library-table-container">
      <table className="library-table">
        <thead>
          <tr>
            <th>ID</th>
            <th>Name</th>
            <th>Type</th>
            <th>Created</th>
            <th>Folder</th>
            <th className="library-row-expand-header"></th>
          </tr>
        </thead>
        <tbody>
          {items.length === 0 && (
            <tr>
              <td colSpan={6} className="empty">
                This folder is empty.
              </td>
            </tr>
          )}
          {items.map((item) => {
            const isSelected =
              item.type === "entry" && selectedId === item.id;
            return (
              <tr
                key={`${item.type}-${item.id}`}
                className={`library-row${isSelected ? " is-selected" : ""}`}
                onClick={() => onRowClick(item)}
              >
                <td>
                  {item.type === "entry" ? (
                    <ReferenceBadge
                      displayId={item.display_id}
                      clickable={false}
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
                <td className="library-date">
                  {formatDate(item.created_at)}
                </td>
                <td>
                  {item.type === "entry" ? (
                    item.folder_name || "—"
                  ) : (
                    "—"
                  )}
                </td>
                <td style={{ width: 40, padding: "0.25rem" }}>
                  {item.type === "entry" && (
                    <button
                      className="library-row-expand-btn"
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
                      className="library-row-expand-btn"
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
        </tbody>
      </table>
    </div>
  );
}

export default LibraryTable;
