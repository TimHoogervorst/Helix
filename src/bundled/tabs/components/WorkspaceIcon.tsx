import { Box } from "lucide-react";
import { ModRegistry } from "../../../shell/src/mod-system/ModRegistry";
import { IconBadge } from "../../../shell/src/shared/components/IconBadge";

/** Render the configured schema icon for a workspace, with a generic fallback. */
export function WorkspaceIcon({ workspaceId }: { workspaceId: string }) {
  const config = ModRegistry.getInstance().getWorkspaces().get(workspaceId);
  const iconKey = config?.schemaType?.icon;

  if (iconKey) {
    return <IconBadge iconKey={iconKey} colorKey="muted" size="sm" />;
  }

  if (config?.icon) {
    const Icon = config.icon;
    return <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />;
  }

  return <Box className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />;
}
