import { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { post } from "../api/client";

interface LibraryNewDropdownProps {
  currentPath: string;
  /** Resolved folder ID for the current path (null for root). */
  currentFolderId: number | null;
  onCreated: () => void;
}

function LibraryNewDropdown({
  currentPath,
  currentFolderId,
  onCreated,
}: LibraryNewDropdownProps) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [folderName, setFolderName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
        setCreatingFolder(false);
        setFolderName("");
        setError(null);
      }
    };
    if (open) {
      document.addEventListener("mousedown", handleClick);
    }
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

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

  const handleNewEntry = () => {
    const returnUrl = `/library?path=${encodeURIComponent(currentPath || "/")}`;
    navigate(`/eln/new?returnUrl=${encodeURIComponent(returnUrl)}`);
    setOpen(false);
  };

  return (
    <div className="library-new-dropdown" ref={dropdownRef}>
      <button
        className="library-new-btn"
        onClick={() => setOpen((prev) => !prev)}
        title="New folder or entry"
      >
        +
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
                📁 New Folder
              </button>
              <button className="library-new-menu-item" onClick={handleNewEntry}>
                📄 New ELN Entry
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

export default LibraryNewDropdown;
