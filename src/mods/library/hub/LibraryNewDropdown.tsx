import { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Plus, FolderPlus, FileText, Loader2 } from "lucide-react";
import { post } from "../../../core/api/client";
import { EMPTY_DOC } from "../../eln/types";
import { createEntry } from "../../eln/api";
import { useClickOutside } from "../../../shared/hooks/useClickOutside";

interface LibraryNewDropdownProps {
  currentPath: string;
  /** Resolved folder ID for the current path (null for root). */
  currentFolderId: number | null;
  onCreated: () => void;
}

function LibraryNewDropdown({
  currentPath: _currentPath,
  currentFolderId,
  onCreated,
}: LibraryNewDropdownProps) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [creatingEntry, setCreatingEntry] = useState(false);
  const [folderName, setFolderName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  useClickOutside(dropdownRef, () => {
    setOpen(false);
    setCreatingFolder(false);
    setFolderName("");
    setError(null);
  }, open);

  // Focus input when creating folder
  useEffect(() => {
    if (creatingFolder && inputRef.current) {
      inputRef.current.focus();
    }
  }, [creatingFolder]);

  const handleNewFolder = () => {
    setCreatingFolder(true);
    setFolderName("");
    setError(null);
  };

  const handleSubmitFolder = async () => {
    const trimmed = folderName.trim();
    if (!trimmed) return;

    try {
      await post("/core/folders/", {
        name: trimmed,
        parent: currentFolderId,
      });
      setCreatingFolder(false);
      setFolderName("");
      setOpen(false);
      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create folder");
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleSubmitFolder();
    } else if (e.key === "Escape") {
      setCreatingFolder(false);
      setFolderName("");
      setError(null);
    }
  };

  const handleNewEntry = async () => {
    setCreatingEntry(true);
    setError(null);
    try {
      const entry = await createEntry({
        title: "Untitled",
        content: EMPTY_DOC,
        folder: currentFolderId,
      });
      setOpen(false);
      navigate(`/eln/${entry.display_id}?new=true`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create entry");
      setCreatingEntry(false);
    }
  };

  return (
    <div className="library-new-dropdown" ref={dropdownRef}>
      <button
        className="library-new-btn"
        onClick={() => setOpen((prev) => !prev)}
        title="New folder or entry"
        aria-label="New folder or entry"
      >
        <Plus size={18} />
      </button>

      {open && (
        <div className="library-new-menu">
          {creatingFolder ? (
            <div className="library-new-folder-form">
              <input
                ref={inputRef}
                type="text"
                value={folderName}
                onChange={(e) => setFolderName(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Folder name…"
                className="library-new-folder-input"
              />
              {error && <div className="library-new-error">{error}</div>}
            </div>
          ) : (
            <>
              <button className="library-new-menu-item" onClick={handleNewFolder}>
                <FolderPlus size={18} /> New Folder
              </button>
              <button
                className="library-new-menu-item"
                onClick={handleNewEntry}
                disabled={creatingEntry}
              >
                {creatingEntry ? (
                  <Loader2 size={18} className="animate-spin" />
                ) : (
                  <FileText size={18} />
                )}{" "}
                New ELN Entry
              </button>
              {error && <div className="library-new-error">{error}</div>}
            </>
          )}
        </div>
      )}
    </div>
  );
}

export default LibraryNewDropdown;
