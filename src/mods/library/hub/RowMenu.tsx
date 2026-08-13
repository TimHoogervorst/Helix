import { EllipsisVertical, Trash2 } from "lucide-react";
import { Menu } from "../../../shell/src/shared/primitives/Menu";
import { IconButton } from "../../../shell/src/shared/primitives/IconButton";

interface RowMenuProps {
  onProperties: () => void;
  canDelete?: boolean;
  onDelete?: () => void;
}

function RowMenu({ onProperties, canDelete, onDelete }: RowMenuProps) {
  const items = [
    {
      id: "properties",
      label: "Properties",
      onSelect: onProperties,
    },
  ];

  if (canDelete && onDelete) {
    items.push({
      id: "delete",
      label: "Delete",
      icon: Trash2,
      danger: true,
      onSelect: onDelete,
    });
  }

  return (
    <div
      className="opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity"
      onClick={(event) => event.stopPropagation()}
    >
      <Menu
        trigger={
          <IconButton aria-label="Row actions">
            <EllipsisVertical className="h-5 w-5" aria-hidden="true" />
          </IconButton>
        }
        items={items}
      />
    </div>
  );
}

export default RowMenu;
