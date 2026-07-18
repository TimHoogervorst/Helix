/**
 * LinkedEntitiesBlock — slot-system block for the ELN sidebar.
 *
 * Registered as `eln.linked-entities-block`, rendered by SlotSidebar in the
 * `eln.sidebar` slot. Reads entry mentions and resolution data from
 * {@link SlotContext.entry} (cast to {@link ElnSidebarData}).
 *
 * Renders linked entities exactly as the hardcoded section in ElnWorkspace's
 * `<aside>` did: clickable buttons that navigate to each linked entity.
 */
import { FlaskConical } from "lucide-react";
import type { BlockComponentProps } from "../../../shell/src/mod-system/types";
import type { ElnSidebarData } from "./sidebarData";

export function LinkedEntitiesBlock({ context }: BlockComponentProps) {
  const data = context.entry as ElnSidebarData | undefined;
  const mentions = data?.mentions ?? [];
  const resolutionMap = data?.resolutionMap ?? new Map();
  const navigate = data?.navigate;

  return (
    <section>
      <h3 className="mb-2 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
        Linked entities
      </h3>
      <div className="space-y-1.5 text-[13px]">
        {mentions.length > 0 ? (
          mentions.map((mention) => {
            const displayId = mention.target_display_id;
            const resolved = displayId
              ? resolutionMap.get(displayId)
              : undefined;
            const title =
              resolved?.title || mention.target_title || "Unknown";
            const workspaceId = resolved?.workspaceId;
            const IconComponent = FlaskConical;
            return (
              <button
                key={mention.id}
                className="flex w-full items-center gap-2 rounded-md border border-hairline bg-panel px-2.5 py-1.5 text-left hover:bg-background transition-colors"
                aria-label={`View ${title}`}
                onClick={() => {
                  if (displayId && workspaceId) {
                    navigate?.(`/${workspaceId}/${displayId}`);
                  } else if (displayId) {
                    navigate?.(`/lims/${displayId}`);
                  }
                }}
                disabled={!displayId}
              >
                <IconComponent
                  className="h-3.5 w-3.5 shrink-0 text-muted-foreground"
                  aria-hidden="true"
                />
                <span className="min-w-0 flex-1 truncate">
                  {title}
                </span>
                {displayId && (
                  <span className="shrink-0 font-mono text-[11px] text-muted-foreground">
                    {displayId}
                  </span>
                )}
              </button>
            );
          })
        ) : (
          <p className="text-muted-foreground/60 text-[12px] italic px-0.5">
            No linked entities
          </p>
        )}
      </div>
    </section>
  );
}
