import type { ViewState } from "../types/browser";
import type { LibraryEntryItem } from "../types/library";
import ReferenceBadge from "./ReferenceBadge";
import ContentPreview from "./ContentPreview";
import BrowserDetailPanel from "./browser/BrowserDetailPanel";
import { useContentPreview } from "../hooks/useContentPreview";

interface LibraryDetailCardProps {
  entry: LibraryEntryItem;
  viewState: ViewState;
  onClose: () => void;
  onCollapse: () => void;
  isDetailExiting?: boolean;
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleString();
}

function LibraryDetailCard({
  entry,
  viewState,
  onClose,
  onCollapse,
  isDetailExiting = false,
}: LibraryDetailCardProps) {
  const { content, loading, error } = useContentPreview(entry.display_id);

  return (
    <BrowserDetailPanel
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
    </BrowserDetailPanel>
  );
}

export default LibraryDetailCard;
