import { Modal } from "../../../shell/src/shared/primitives/Modal";
import { Avatar, getInitials } from "../../../shell/src/shared/Avatar";
import { formatDate } from "../../../shell/src/shared/format";
import { IconBadge } from "../../../shell/src/shared/components/IconBadge";
import type { LibraryEntryItem } from "../types";

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
}

export function EntryPropertiesModal({
  open,
  onClose,
  entry,
  projectMeta,
}: EntryPropertiesModalProps) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`${entry.display_id} — ${entry.title}`}
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
