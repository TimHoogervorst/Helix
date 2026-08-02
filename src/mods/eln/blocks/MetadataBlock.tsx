/**
 * MetadataBlock — slot-system block for the ELN sidebar.
 *
 * Registered as `eln.metadata`, rendered by SlotSidebar in the
 * `eln.sidebar` slot. Reads entry data and editor actions from
 * {@link SlotContext.entry}, which ElnWorkspace populates with an
 * {@link ElnSidebarData} shape.
 *
 * Renders the same metadata section that was previously hardcoded in
 * ElnWorkspace's `<aside>`: author, last editor, project/folder,
 * started date, status dropdown, and folder dropdown.
 */
import { useState, useEffect } from "react";
import type { BlockComponentProps } from "../../../shell/src/mod-system/types";
import type { ElnSidebarData } from "./sidebarData";
import { Avatar, getInitials } from "../../../shell/src/shared/Avatar";
import { listDropdowns } from "../../dropdowns/api";

/** Format a snake_case status value for display (e.g. "in_progress" → "In Progress"). */
function formatStatusLabel(status: string): string {
  return status
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export function MetadataBlock({ context }: BlockComponentProps) {
  const data = context.entry as ElnSidebarData | undefined;
  const entry = data?.entry ?? null;

  // ── Fetch status options from the dropdowns API ──────────────────────────
  const [statusOptions, setStatusOptions] = useState<string[]>([
    "in_progress",
    "finished",
  ]);

  useEffect(() => {
    let cancelled = false;
    listDropdowns()
      .then((dropdowns) => {
        if (cancelled) return;
        const statusDropdown = dropdowns.find((d) => d.name === "Status");
        if (statusDropdown && statusDropdown.options.length > 0) {
          setStatusOptions(statusDropdown.options);
        }
      })
      .catch(() => {
        // Keep defaults on error.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <section>
      <dl className="space-y-2.5 text-[13px]">
        <div className="flex items-start justify-between gap-3">
          <dt className="text-muted-foreground">Author</dt>
          <dd className="text-right">
            {entry?.author_info ? (
              <span className="inline-flex items-center gap-1.5">
                <Avatar
                  initials={getInitials(entry.author_info)}
                  color={entry.author_info.color}
                  size="sm"
                />
                {entry.author_info.username}
              </span>
            ) : (
              entry?.author_username || "—"
            )}
          </dd>
        </div>
        <div className="flex items-start justify-between gap-3">
          <dt className="text-muted-foreground">Last editor</dt>
          <dd className="text-right">
            {data?.lastEditor ? (
              <span className="inline-flex items-center gap-1.5">
                <Avatar
                  initials={getInitials(data.lastEditor)}
                  color={data.lastEditor.color}
                  size="sm"
                />
                {data.lastEditor.username}
              </span>
            ) : (
              "—"
            )}
          </dd>
        </div>
        <div className="flex items-start justify-between gap-3">
          <dt className="text-muted-foreground">Project</dt>
          <dd className="text-right">
            {entry?.folder_name || "—"}
          </dd>
        </div>
        <div className="flex items-start justify-between gap-3">
          <dt className="text-muted-foreground">Started</dt>
          <dd className="text-right">
            {entry
              ? new Date(entry.created_at).toLocaleDateString(
                  "en-CA",
                ) +
                " " +
                new Date(entry.created_at).toLocaleTimeString(
                  "en-GB",
                  { hour: "2-digit", minute: "2-digit" },
                )
              : "—"}
          </dd>
        </div>
        <div className="flex items-start justify-between gap-3">
          <dt className="text-muted-foreground">Status</dt>
          <dd className="text-right">
            <select
              value={data?.status ?? "in_progress"}
              onChange={(e) => data?.onStatusChange?.(e.target.value)}
              disabled={data?.isLockedByOther}
              className="!w-auto !min-w-[120px] !py-0.5 !text-xs"
              data-testid="status-select"
            >
              {statusOptions.map((opt) => (
                <option key={opt} value={opt}>
                  {formatStatusLabel(opt)}
                </option>
              ))}
            </select>
          </dd>
        </div>
        <div className="flex items-start justify-between gap-3">
          <dt className="text-muted-foreground">Folder</dt>
          <dd className="text-right">
            <select
              value={data?.folderId ?? ""}
              onChange={(e) =>
                data?.onFolderChange?.(
                  e.target.value ? Number(e.target.value) : null,
                )
              }
              disabled={data?.isLockedByOther}
              className="!w-auto !min-w-[140px] !py-0.5 !text-xs"
              data-testid="folder-select"
            >
              <option value="">Folder…</option>
              {data?.folders.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
            </select>
          </dd>
        </div>
      </dl>
    </section>
  );
}
