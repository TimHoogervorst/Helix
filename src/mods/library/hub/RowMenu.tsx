import { EllipsisVertical } from "lucide-react";
import { Menu } from "../../../shell/src/shared/primitives/Menu";
import { IconButton } from "../../../shell/src/shared/primitives/IconButton";

interface RowMenuProps {
  onProperties: () => void;
}

function RowMenu({ onProperties }: RowMenuProps) {
  return (
    <div className="opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
      <Menu
        trigger={
          <IconButton aria-label="Row actions">
            <EllipsisVertical className="h-5 w-5" aria-hidden="true" />
          </IconButton>
        }
        items={[
          {
            id: "properties",
            label: "Properties",
            onSelect: onProperties,
          },
        ]}
      />
    </div>
  );
}

export default RowMenu;
