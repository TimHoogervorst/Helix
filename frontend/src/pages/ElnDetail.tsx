import { useEffect, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { get, del } from "../api/client";

interface EntryDetail {
  id: number;
  title: string;
  content: string;
  author_username: string;
  folder_name: string;
  created_at: string;
  updated_at: string;
}

function ElnDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [entry, setEntry] = useState<EntryDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    setLoading(true);
    get<EntryDetail>(`/eln/entries/${id}/`)
      .then(setEntry)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [id]);

  const handleDelete = async () => {
    if (!window.confirm("Delete this entry?")) return;
    setDeleting(true);
    try {
      await del(`/eln/entries/${id}/`);
      navigate("/eln");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete");
      setDeleting(false);
    }
  };

  if (loading) return <p>Loading...</p>;
  if (error) return <p style={{ color: "red" }}>Error: {error}</p>;
  if (!entry) return <p>Entry not found.</p>;

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start" }}>
        <div>
          <h1>{entry.title}</h1>
          <p style={{ color: "#666", fontSize: "0.9rem" }}>
            by {entry.author_username} · Folder: {entry.folder_name} ·{" "}
            {new Date(entry.created_at).toLocaleString()}
            {entry.updated_at !== entry.created_at &&
              ` · Updated: ${new Date(entry.updated_at).toLocaleString()}`}
          </p>
        </div>
        <div style={{ display: "flex", gap: "0.5rem" }}>
          <Link to={`/eln/${id}/edit`}>
            <button>Edit</button>
          </Link>
          <button onClick={handleDelete} disabled={deleting} style={{ color: "red" }}>
            {deleting ? "Deleting..." : "Delete"}
          </button>
        </div>
      </div>

      <div
        style={{
          marginTop: "1.5rem",
          padding: "1rem",
          border: "1px solid #eee",
          borderRadius: 4,
          whiteSpace: "pre-wrap",
          lineHeight: 1.6,
        }}
      >
        {entry.content || <em style={{ color: "#999" }}>No content.</em>}
      </div>
    </div>
  );
}

export default ElnDetail;
