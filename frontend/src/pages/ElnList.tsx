import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { get } from "../api/client";

interface Entry {
  id: number;
  title: string;
  author_username: string;
  created_at: string;
}

interface PageResponse {
  results: Entry[];
  next: string | null;
  previous: string | null;
  count: number;
}

function ElnList() {
  const [entries, setEntries] = useState<Entry[]>([]);
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
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h1>Notebook Entries</h1>
        <Link to="/eln/new">
          <button>+ New Entry</button>
        </Link>
      </div>

      {loading && <p>Loading...</p>}
      {error && <p style={{ color: "red" }}>Error: {error}</p>}

      {!loading && !error && entries.length === 0 && (
        <p>No entries yet. Create your first entry!</p>
      )}

      <ul style={{ listStyle: "none", padding: 0 }}>
        {entries.map((entry) => (
          <li
            key={entry.id}
            style={{
              border: "1px solid #eee",
              padding: "1rem",
              marginBottom: "0.5rem",
              borderRadius: 4,
            }}
          >
            <Link to={`/eln/${entry.id}`} style={{ fontSize: "1.1rem", fontWeight: 500 }}>
              {entry.title}
            </Link>
            <div style={{ color: "#666", fontSize: "0.85rem", marginTop: "0.25rem" }}>
              by {entry.author_username} · {new Date(entry.created_at).toLocaleString()}
            </div>
          </li>
        ))}
      </ul>

      <div style={{ display: "flex", gap: "0.5rem", justifyContent: "center" }}>
        {previous && (
          <button onClick={() => fetchEntries(previous)}>← Previous</button>
        )}
        {next && (
          <button onClick={() => fetchEntries(next)}>Next →</button>
        )}
      </div>
    </div>
  );
}

export default ElnList;
