import { Link } from "react-router-dom";
import type { ViewState } from "../types/lims";
import type { LibraryEntryItem } from "../types/library";
import ReferenceBadge from "./ReferenceBadge";
import ContentPreview from "./ContentPreview";
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
    <div className={`library-detail-panel${isDetailExiting ? " is-exiting" : ""}`}>
      <div className="card library-detail-card">
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
          <div className="detail-header-actions">
            {viewState === "expanded" ? (
              <button
                className="library-detail-collapse"
                onClick={onCollapse}
                title="Back to summary"
              >
                &lt;
              </button>
            ) : (
              <Link
                to={`/eln/${entry.display_id}`}
                className="library-detail-expand"
                title="Open entry"
              >
                &gt;
              </Link>
            )}
            <button
              className="library-detail-close"
              onClick={onClose}
              title="Close"
            >
              ×
            </button>
          </div>
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
      </div>
    </div>
  );
}

export default LibraryDetailCard;
