import { EllipsisVertical } from "lucide-react";
import { Menu } from "../../../shell/src/shared/primitives/Menu";
import { IconButton } from "../../../shell/src/shared/primitives/IconButton";

export interface MoreActionsItem {
  key: string;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  onClick: () => void;
  tooltip?: string;
  disabled?: boolean;
  destructive?: boolean;
}

interface MoreActionsProps {
  items: MoreActionsItem[];
}

function MoreActions({ items }: MoreActionsProps) {
  return (
    <Menu
      trigger={
        <IconButton aria-label="More actions">
          <EllipsisVertical className="h-5 w-5" aria-hidden="true" />
        </IconButton>
      }
      items={items.map((item) => ({
        id: item.key,
        label: item.label,
        icon: item.icon,
        danger: item.destructive,
        disabled: item.disabled,
        title: item.tooltip,
        onSelect: item.onClick,
      }))}
    />
  );
}

export default MoreActions;
