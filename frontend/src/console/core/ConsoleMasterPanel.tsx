import type { ReactNode } from "react";

export interface MasterColumn {
  label: string;
  /** CSS class for the <th>. */
  className?: string;
}

export interface ConsoleMasterPanelProps {
  columns: MasterColumn[];
  /** Number of columns (used for empty-state colspan). */
  colSpan: number;
  children: ReactNode;
  /** Number of items (children count). When 0, the empty message is shown. */
  itemCount: number;
  /** Message shown when there are no items. */
  emptyMessage?: string;
  /** Whether more items are available to load. */
  hasMore?: boolean;
  /** Called when the Load More button is clicked. */
  onLoadMore?: () => void;
  /** Whether a "load more" request is in flight. */
  loadingMore?: boolean;
}

/**
 * Shared Master Panel table shell.
 *
 * Provides a standard <table> structure, column headers, empty state,
 * and a Load More button.  Row rendering is entirely controlled by the
 * `children` prop — each consumer renders its own <tbody> rows.
 */
function ConsoleMasterPanel({
  columns,
  colSpan,
  children,
  itemCount,
  emptyMessage = "No items found.",
  hasMore = false,
  onLoadMore,
  loadingMore = false,
}: ConsoleMasterPanelProps) {
  const showLoadMore = hasMore && onLoadMore;

  return (
    <div className="console-master-table-container">
      <table className="console-master-table">
        <thead>
          <tr>
            {columns.map((col, i) => (
              <th key={i} className={col.className}>
                {col.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {itemCount === 0 ? (
            <tr>
              <td colSpan={colSpan} className="empty">
                {emptyMessage}
              </td>
            </tr>
          ) : (
            children
          )}
        </tbody>
      </table>

      {showLoadMore && (
        <div className="console-load-more">
          <button onClick={onLoadMore} disabled={loadingMore}>
            {loadingMore ? "Loading…" : "Load More"}
          </button>
        </div>
      )}
    </div>
  );
}

export default ConsoleMasterPanel;
