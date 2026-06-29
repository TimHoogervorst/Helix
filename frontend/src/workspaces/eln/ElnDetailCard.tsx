import type { ViewState } from "../../types/console";
import type { LibraryEntryItem } from "../../types/library";
import ReferenceBadge from "../../components/ReferenceBadge";
import ContentPreview from "../../components/ContentPreview";
import ConsoleDetailPanel from "../../console/core/ConsoleDetailPanel";
import { useContentPreview } from "../../hooks/useContentPreview";

interface ElnDetailCardProps {
  entry: LibraryEntryItem;
  viewState: ViewState;
  onClose: () => void;
  onCollapse: () => void;
  isDetailExiting?: boolean;
}

import { formatDate } from "../../utils/format";

function ElnDetailCard({
  entry,
  viewState,
  onClose,
  onCollapse,
  isDetailExiting = false,
}: ElnDetailCardProps) {
  const { content, loading, error } = useContentPreview(entry.display_id);

  return (
    <ConsoleDetailPanel
      viewState={viewState}
      onClose={onClose}
      onCollapse={onCollapse}
      expandUrl={`/eln/${entry.display_id}`}
      isExiting={isDetailExiting}
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
          <span className="detail-label">Type</span>
          <span>ELN Entry</span>
        </div>
        <div className="detail-field">
          <span className="detail-label">Created</span>
          <span>{formatDate(entry.created_at)}</span>
        </div>
        <div className="detail-field">
          <span className="detail-label">Author</span>
          <span>{entry.author_username || "—"}</span>
        </div>
        <div className="detail-field">
          <span className="detail-label">Folder</span>
          <span>{entry.folder_name || "root"}</span>
        </div>
        <div className="detail-field">
          <span className="detail-label">Updated</span>
          <span>{formatDate(entry.updated_at)}</span>
        </div>
      </div>

      {loading && <p className="empty">Loading content…</p>}
      {error && <div className="error">{error}</div>}
      {!loading && !error && <ContentPreview content={content} />}
    </ConsoleDetailPanel>
  );
}

export default ElnDetailCard;
