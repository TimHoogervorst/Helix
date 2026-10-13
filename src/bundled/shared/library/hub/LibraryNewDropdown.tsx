import { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Plus, FolderPlus, FileText, Loader2 } from "lucide-react";
import { post } from "../../../../shell/src/api/client";
import { useClickOutside } from "../../../../shell/src/shared/hooks/useClickOutside";
import { Button } from "../../../../shell/src/shared/primitives/Button";
import { ModRegistry } from "../../../../shell/src/mod-system/ModRegistry";

interface LibraryNewDropdownProps {
  currentPath: string;
  projectUid?: string | null;
  currentFolderId: number | null;
  currentProjectId: number | null;
  onCreated: () => void;
}

function LibraryNewDropdown({
  currentPath,
  projectUid,
  currentFolderId,
  currentProjectId,
  onCreated,
}: LibraryNewDropdownProps) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [creatingSource, setCreatingSource] = useState<string | null>(null);
  const [folderName, setFolderName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useClickOutside(dropdownRef, () => {
    setOpen(false);
    setCreatingFolder(false);
    setFolderName("");
    setError(null);
  }, open);

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
        project: currentProjectId,
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

  const handleNewSource = async (kind: string) => {
    const source = ModRegistry.getInstance().getContentSources().get(kind);
    if (!source?.create) return;
    setCreatingSource(kind);
    setError(null);
    try {
      const entry = await source.create({ sourceId: currentFolderId, projectId: currentProjectId });
      setOpen(false);
      const params = new URLSearchParams({ new: "true" });
      if (projectUid) params.set("project", projectUid);
      if (currentProjectId !== null) params.set("projectId", String(currentProjectId));
      if (currentPath) params.set("path", currentPath);
      const destination = source.navigate?.(entry.display_id, params);
      if (destination) navigate(destination);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create entry");
      setCreatingSource(null);
    }
  };

  return (
    <div className="library-new-dropdown" ref={dropdownRef}>
      <Button
        onClick={() => setOpen((prev) => !prev)}
        title="New folder or entry"
        aria-label="New folder or entry"
        size="sm"
      >
        <Plus size={18} />
      </Button>

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
              {[...ModRegistry.getInstance().getContentSources().values()]
                .filter((source) => source.create)
                .map((source) => (
                  <button
                    key={source.kind}
                    className="library-new-menu-item"
                    onClick={() => handleNewSource(source.kind)}
                    disabled={creatingSource !== null}
                  >
                    {creatingSource === source.kind ? <Loader2 size={18} className="animate-spin" /> : <FileText size={18} />} {source.label}
                  </button>
                ))}
              {error && <div className="library-new-error">{error}</div>}
            </>
          )}
        </div>
      )}
    </div>
  );
}

export default LibraryNewDropdown;
