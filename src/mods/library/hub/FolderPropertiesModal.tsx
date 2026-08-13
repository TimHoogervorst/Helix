import { useState, useRef, useCallback } from "react";
import { Modal } from "../../../shell/src/shared/primitives/Modal";
import { Input } from "../../../shell/src/shared/primitives/Input";
import { formatDate } from "../../../shell/src/shared/format";
import type { LibraryFolderItem } from "../types";
import { patchFolder } from "../api";
import { SharingPanel } from "./SharingPanel";

interface FolderPropertiesModalProps {
  open: boolean;
  onClose: () => void;
  folder: LibraryFolderItem;
  canEdit: boolean;
  isOrgAdmin: boolean;
  projectId: number | null;
  onMutated: () => void;
}

export function FolderPropertiesModal({
  open,
  onClose,
  folder,
  canEdit,
  isOrgAdmin,
  projectId,
  onMutated,
}: FolderPropertiesModalProps) {
  const [name, setName] = useState(folder.name);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const nameRef = useRef<string>(folder.name);

  const isTopLevel = folder.parent === null;
  const isOwnProject = !folder.is_shared;
  const showSharingPanel = isOrgAdmin && isTopLevel && isOwnProject && projectId !== null;
  const showNestedHint = isOrgAdmin && !isTopLevel && isOwnProject;

  const handleSave = useCallback(
    async (newName: string) => {
      const trimmed = newName.trim();
      if (trimmed === "" || trimmed === folder.name || saving) {
        if (trimmed === "" || trimmed === folder.name) {
          setName(folder.name);
          setError(null);
        }
        return;
      }
      nameRef.current = trimmed;
      setSaving(true);
      setError(null);
      try {
        await patchFolder(folder.id, { name: trimmed });
        onMutated();
      } catch (err: unknown) {
        const msg =
          err instanceof Error ? err.message : "Failed to rename folder";
        setError(msg);
        setName(folder.name);
      } finally {
        setSaving(false);
      }
    },
    [folder.id, folder.name, onMutated, saving],
  );

  return (
    <Modal
      open={open}
      onClose={() => {
        if (canEdit && name.trim() !== folder.name && name.trim() !== "") {
          handleSave(name);
        }
        onClose();
      }}
      title={folder.name}
    >
      <dl className="space-y-3">
        <div className="flex items-start justify-between gap-3">
          <dt className="text-sm text-[var(--color-ink-muted-foreground)] shrink-0 pt-1.5">
            Name
          </dt>
          <dd className="text-sm text-right flex-1 min-w-0">
            {canEdit ? (
              <>
                <Input
                  disabled={saving}
                  value={name}
                  onChange={(e) => {
                    setName(e.target.value);
                    setError(null);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      handleSave(name);
                    }
                  }}
                  onBlur={() => handleSave(name)}
                />
                {error && (
                  <p className="text-xs text-red-500 mt-1">{error}</p>
                )}
              </>
            ) : (
              <span>{folder.name}</span>
            )}
          </dd>
        </div>

        <div className="flex items-start justify-between gap-3">
          <dt className="text-sm text-[var(--color-ink-muted-foreground)] shrink-0">
            Created
          </dt>
          <dd className="text-sm text-right">{formatDate(folder.created_at)}</dd>
        </div>
      </dl>

      {showSharingPanel && (
        <SharingPanel
          folderId={folder.id}
          projectId={projectId!}
          onMutated={onMutated}
        />
      )}

      {showNestedHint && (
        <p className="text-xs text-[var(--color-ink-muted-foreground)] border-t border-[var(--color-ink-border)] pt-4 mt-4">
          Only top-level folders can be shared.
        </p>
      )}
    </Modal>
  );
}
