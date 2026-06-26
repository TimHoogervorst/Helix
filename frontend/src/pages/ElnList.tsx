import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { get } from "../api/client";
import type { EntryListItem } from "../types/eln";
import ReferenceBadge from "../components/ReferenceBadge";

interface PageResponse {
  results: EntryListItem[];
  next: string | null;
  previous: string | null;
  count: number;
}

function ElnList() {
  const [entries, setEntries] = useState<EntryListItem[]>([]);
  const [next, setNext] = useState<string | null>(null);
  const [previous, setPrevious] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchParams] = useSearchParams();

  const fetchEntries = (url?: string) => {
    setLoading(true);
    setError(null);
    const path = url ? url.replace("/api", "") : "/eln/entries/";

    get<PageResponse>(path)
      .then((data) => {
        setEntries(data.results);
        setNext(data.next);
        setPrevious(data.previous);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchEntries();
  }, [searchParams]);

  return (
    <div>
      <div className="toolbar">
        <h1>Notebook Entries</h1>
        <Link to="/eln/new">
          <button>+ New Entry</button>
        </Link>
      </div>

      {loading && <p className="empty">Loading…</p>}
      {error && <div className="error">Error: {error}</div>}

      {!loading && !error && entries.length === 0 && (
        <p className="empty">No entries yet. Create your first entry!</p>
      )}

      {entries.map((entry) => (
        <div key={entry.id} className="entry-item">
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
          <Link to={`/eln/${entry.id}`}>{entry.title}</Link>
          <div className="meta">
            by {entry.author_username} · {new Date(entry.created_at).toLocaleString()}
          </div>
        </div>
      ))}

      {(previous || next) && (
        <div style={{ display: "flex", gap: "0.5rem", justifyContent: "center", marginTop: "1.5rem" }}>
          {previous && (
            <button onClick={() => fetchEntries(previous)}>← Previous</button>
          )}
          {next && (
            <button onClick={() => fetchEntries(next)}>Next →</button>
          )}
        </div>
      )}
    </div>
  );
}

export default ElnList;
