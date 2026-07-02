import type { LibraryEntryItem } from "../../../types/library";
import type { ViewState } from "../../../types/console";
import ReferenceBadge from "../../../components/ReferenceBadge";
import ConsoleDetailPanel from "../../../console/core/ConsoleDetailPanel";
import { formatDate } from "../../../utils/format";

interface LibraryDetailCardProps {
  entry: LibraryEntryItem;
  viewState: ViewState;
  onClose: () => void;
  onCollapse: () => void;
}

function LibraryDetailCard({
  entry,
  viewState,
  onClose,
  onCollapse,
}: LibraryDetailCardProps) {
  return (
    <ConsoleDetailPanel
      viewState={viewState}
      onClose={onClose}
      expandUrl={`/eln/${entry.display_id}`}
      onCollapse={onCollapse}
    >
      <div className="detail-header">
        <h2>
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
          {entry.title}
        </h2>
      </div>
      <div className="detail-body">
        <div className="detail-field">
          <span className="detail-label">Description</span>
          <span
            className="text-muted-foreground text-[13px]"
            title="Coming soon"
          >
            Description — coming soon.
          </span>
        </div>
        <div className="detail-field">
          <span className="detail-label">Tags</span>
          <span
            className="inline-block rounded border border-hairline bg-muted px-2 py-0.5 text-[12px] text-muted-foreground"
            title="Coming soon"
          >
            Tags — coming soon.
          </span>
        </div>
        <div className="detail-field">
          <span className="detail-label">Created</span>
          <span>{formatDate(entry.created_at)}</span>
        </div>
        <div className="detail-field">
          <span className="detail-label">Updated</span>
          <span>{formatDate(entry.updated_at)}</span>
        </div>
        {entry.author_username && (
          <div className="detail-field">
            <span className="detail-label">Author</span>
            <span>{entry.author_username}</span>
          </div>
        )}
        {entry.folder_name && (
          <div className="detail-field">
            <span className="detail-label">Folder</span>
            <span>{entry.folder_name}</span>
          </div>
        )}
      </div>
    </ConsoleDetailPanel>
  );
}

export default LibraryDetailCard;
