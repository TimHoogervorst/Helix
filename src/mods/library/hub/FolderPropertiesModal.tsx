import { Modal } from "../../../shell/src/shared/primitives/Modal";
import { formatDate } from "../../../shell/src/shared/format";
import type { LibraryFolderItem } from "../types";

interface FolderPropertiesModalProps {
  open: boolean;
  onClose: () => void;
  folder: LibraryFolderItem;
}

export function FolderPropertiesModal({
  open,
  onClose,
  folder,
}: FolderPropertiesModalProps) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={folder.name}
    >
      <dl className="space-y-3">
        <div className="flex items-start justify-between gap-3">
          <dt className="text-sm text-[var(--color-ink-muted-foreground)] shrink-0">
            Created
          </dt>
          <dd className="text-sm text-right">{formatDate(folder.created_at)}</dd>
        </div>
      </dl>
    </Modal>
  );
}
