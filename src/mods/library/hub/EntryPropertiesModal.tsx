import { useState, useEffect, useMemo } from "react";
import { Modal } from "../../../shell/src/shared/primitives/Modal";
import { Avatar, getInitials } from "../../../shell/src/shared/Avatar";
import { formatDate } from "../../../shell/src/shared/format";
import { IconBadge } from "../../../shell/src/shared/components/IconBadge";
import { Select } from "../../../shell/src/shared/primitives/Input";
import { listDropdowns } from "../../dropdowns/api";
import type { LibraryEntryItem, LibraryFolderPath } from "../types";
import { patchEntry, getLockStatus } from "../../eln/api";
import { patchEntity } from "../../lims/hub/api";

interface ProjectMeta {
  name: string;
  icon: string;
  color: string;
}

interface EntryPropertiesModalProps {
  open: boolean;
  onClose: () => void;
  entry: LibraryEntryItem;
  projectMeta?: ProjectMeta | null;
  canEdit: boolean;
  folders: LibraryFolderPath[];
  projectUid: string;
  onMutated: () => void;
}

export function EntryPropertiesModal({
  open,
  onClose,
  entry,
  projectMeta,
  canEdit,
  folders,
  projectUid,
  onMutated,
}: EntryPropertiesModalProps) {
  const [statusOptions, setStatusOptions] = useState<string[]>([]);
  const [status, setStatus] = useState(entry.status);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [moveSearch, setMoveSearch] = useState("");
  const [moveError, setMoveError] = useState<string | null>(null);
  const [lockedByOther, setLockedByOther] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    listDropdowns()
      .then((dropdowns) => {
        const statusDropdown = dropdowns.find((d) => d.name === "Status");
        if (statusDropdown) {
          setStatusOptions(statusDropdown.options);
        }
      })
      .catch(() => {});
  }, [open]);

  useEffect(() => {
    if (!open) return;
    setStatus(entry.status);
    if (entry.type === "entity") {
      setLockedByOther(false);
      return;
    }
    getLockStatus(entry.display_id)
      .then((lockStatus) => {
        if (lockStatus.locked && lockStatus.held_by_username) {
          setLockedByOther(true);
        } else {
          setLockedByOther(false);
        }
      })
      .catch(() => {});
  }, [open, entry.display_id, entry.status]);

  const isDisabled = !canEdit || lockedByOther || saving;

  const filteredFolders = useMemo(() => {
    return folders.filter(
      (f) =>
        f.id !== entry.folder &&
        (moveSearch === "" ||
          f.path.toLowerCase().includes(moveSearch.toLowerCase())),
    );
  }, [folders, entry.folder, moveSearch]);

  const handleStatusChange = async (newStatus: string) => {
    setStatus(newStatus);
    setStatusError(null);
    setSaving(true);
    try {
      if (entry.type === "entity") {
        await patchEntity(entry.display_id, { status: newStatus });
      } else {
        await patchEntry(entry.display_id, { status: newStatus });
      }
      onMutated();
    } catch (err: unknown) {
      setStatus(entry.status);
      const msg =
        err instanceof Error ? err.message : "Failed to update status";
      setStatusError(msg);
    } finally {
      setSaving(false);
    }
  };

  const handleMove = async (folderId: number | null) => {
    setMoveSearch("");
    setMoveError(null);
    setSaving(true);
    try {
      if (entry.type === "entity") {
        await patchEntity(entry.display_id, { folder: folderId });
      } else {
        await patchEntry(entry.display_id, { folder: folderId });
      }
      onMutated();
    } catch (err: unknown) {
      const msg =
        err instanceof Error ? err.message : "Failed to move entry";
      setMoveError(msg);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`${entry.display_id} \u2014 ${entry.title}`}
    >
      <dl className="space-y-3">
        {projectMeta && (
          <div className="flex items-start justify-between gap-3">
            <dt className="text-sm text-[var(--color-ink-muted-foreground)] shrink-0">
              Project
            </dt>
            <dd className="text-sm text-right flex items-center gap-1.5">
              {projectMeta.icon && (
                <IconBadge
                  iconKey={projectMeta.icon}
                  colorKey={projectMeta.color || "muted"}
                  size="sm"
                />
              )}
              {projectMeta.name}
            </dd>
          </div>
        )}

        {entry.author_info && (
          <div className="flex items-start justify-between gap-3">
            <dt className="text-sm text-[var(--color-ink-muted-foreground)] shrink-0">
              Author
            </dt>
            <dd className="text-sm text-right flex items-center gap-1.5">
              <Avatar
                initials={getInitials(entry.author_info)}
                color={entry.author_info.color}
                size="sm"
              />
              {entry.author_info.username}
            </dd>
          </div>
        )}

        {canEdit && (
          <div className="flex items-start justify-between gap-3">
            <dt className="text-sm text-[var(--color-ink-muted-foreground)] shrink-0 pt-1.5">
              Status
            </dt>
            <dd className="text-sm text-right flex-1 min-w-0">
              <Select
                disabled={isDisabled}
                value={status}
                onChange={(e) => handleStatusChange(e.target.value)}
              >
                {statusOptions.map((opt) => (
                  <option key={opt} value={opt}>
                    {opt}
                  </option>
                ))}
              </Select>
              {statusError && (
                <p className="text-xs text-red-500 mt-1">{statusError}</p>
              )}
              {!statusError && (
                <p className="text-xs text-[var(--color-ink-muted-foreground)] mt-1">
                  Cascades to entities created in this entry
                </p>
              )}
            </dd>
          </div>
        )}

        {canEdit && (
          <div className="flex items-start justify-between gap-3">
            <dt className="text-sm text-[var(--color-ink-muted-foreground)] shrink-0 pt-1.5">
              Move to
            </dt>
            <dd className="text-sm text-right flex-1 min-w-0">
              <input
                type="text"
                disabled={isDisabled}
                className="w-full rounded-md border border-[var(--color-ink-border)] bg-[var(--color-surface)] text-[var(--color-ink)] font-[var(--font-body)] text-base px-3 h-9 placeholder:text-[var(--color-ink-muted-foreground)] outline-none transition-colors focus:border-[var(--color-primary)] focus:ring-2 focus:ring-[var(--color-focus-ring)] disabled:opacity-50 disabled:cursor-not-allowed"
                placeholder="Search folders..."
                value={moveSearch}
                onChange={(e) => setMoveSearch(e.target.value)}
              />
              {moveError && (
                <p className="text-xs text-red-500 mt-1">{moveError}</p>
              )}
              <div className="max-h-32 overflow-y-auto mt-1 border border-[var(--color-ink-hairline)] rounded-md">
                {entry.folder !== null && (moveSearch === "" || "project root".includes(moveSearch.toLowerCase())) && (
                  <button
                    type="button"
                    disabled={isDisabled}
                    className="w-full text-left px-3 py-1.5 text-sm hover:bg-[var(--color-surface)] focus:outline-none focus:ring-2 focus:ring-[var(--color-focus-ring)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    onClick={() => handleMove(null)}
                  >
                    Project root
                  </button>
                )}
                {filteredFolders.map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    disabled={isDisabled}
                    className="w-full text-left px-3 py-1.5 text-sm hover:bg-[var(--color-surface)] focus:outline-none focus:ring-2 focus:ring-[var(--color-focus-ring)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    onClick={() => handleMove(f.id)}
                  >
                    {f.path}
                  </button>
                ))}
                {filteredFolders.length === 0 && (
                  <p className="px-3 py-1.5 text-xs text-[var(--color-ink-muted-foreground)]">
                    No matching folders
                  </p>
                )}
              </div>
            </dd>
          </div>
        )}

        <div className="flex items-start justify-between gap-3">
          <dt className="text-sm text-[var(--color-ink-muted-foreground)] shrink-0">
            Created
          </dt>
          <dd className="text-sm text-right">{formatDate(entry.created_at)}</dd>
        </div>

        <div className="flex items-start justify-between gap-3">
          <dt className="text-sm text-[var(--color-ink-muted-foreground)] shrink-0">
            Updated
          </dt>
          <dd className="text-sm text-right">{formatDate(entry.updated_at)}</dd>
        </div>
      </dl>
    </Modal>
  );
}
