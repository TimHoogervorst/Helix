/**
 * AttachmentsBlock — slot-system block for the ELN sidebar.
 *
 * Registered as `eln.attachments`, rendered by SlotSidebar in the
 * `eln.sidebar` slot. Renders placeholder attachment entries (hardcoded
 * mock data, same as the original `<aside>` section).
 *
 * Future PRDs will wire this to real attachment data.
 */
import { Paperclip } from "lucide-react";
import type { BlockComponentProps } from "../../../shell/src/mod-system/types";

/** Placeholder attachment entries. */
const PLACEHOLDER_ATTACHMENTS = [
  { name: "raw_gel_2026-06-30.tif", size: "4.2 MB" },
  { name: "plate_layout.xlsx", size: "18 KB" },
  { name: "sequencing_reads.fastq.gz", size: "112 MB" },
] as const;

export function AttachmentsBlock(_props: BlockComponentProps) {
  return (
    <section>
      <div className="space-y-1.5 text-[13px]">
        {PLACEHOLDER_ATTACHMENTS.map((file) => (
          <div
            key={file.name}
            className="flex items-center gap-2 rounded-md border border-hairline bg-panel px-2.5 py-1.5"
          >
            <Paperclip
              className="h-3.5 w-3.5 shrink-0 text-muted-foreground"
              aria-hidden="true"
            />
            <span className="min-w-0 flex-1 truncate font-mono">
              {file.name}
            </span>
            <span className="shrink-0 text-[11px] text-muted-foreground">
              {file.size}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}
