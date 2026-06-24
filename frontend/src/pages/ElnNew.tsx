import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { get, post } from "../api/client";

interface Folder {
  id: number;
  name: string;
}

function ElnNew() {
  const navigate = useNavigate();
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [folderId, setFolderId] = useState<number | null>(null);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    get<Folder[]>("/core/folders/")
      .then(setFolders)
      .catch(() => setError("Failed to load folders"));
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    setSubmitting(true);
    setError(null);

    try {
      const entry = await post<{ id: number }>("/eln/entries/", {
        title: title.trim(),
        content,
        folder: folderId,
      });
      navigate(`/eln/${entry.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create entry");
      setSubmitting(false);
    }
  };

  if (folders.length === 0 && !error) {
    return <p className="empty">Loading…</p>;
  }

  return (
    <div>
      <h1>New Notebook Entry</h1>
      {error && <div className="error">{error}</div>}
      <form onSubmit={handleSubmit}>
        <div style={{ marginBottom: "1rem" }}>
          <label htmlFor="title">Title</label>
          <input
            id="title"
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
            placeholder="Entry title…"
          />
        </div>

        <div style={{ marginBottom: "1rem" }}>
          <label htmlFor="folder">Folder</label>
          <select
            id="folder"
            value={folderId ?? ""}
            onChange={(e) => setFolderId(e.target.value ? Number(e.target.value) : null)}
          >
            <option value="">-- Select a folder --</option>
            {folders.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
          </select>
        </div>

        <div style={{ marginBottom: "1rem" }}>
          <label htmlFor="content">Content</label>
          <textarea
            id="content"
            value={content}
            onChange={(e) => setContent(e.target.value)}
            rows={12}
            placeholder="Write your entry here…"
          />
        </div>

        <div style={{ display: "flex", gap: "0.5rem" }}>
          <button type="submit" disabled={submitting || !title.trim()}>
            {submitting ? "Creating…" : "Create Entry"}
          </button>
          <button type="button" onClick={() => navigate("/eln")}>
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}

export default ElnNew;
