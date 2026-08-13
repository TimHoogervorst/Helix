/**
 * Data shape passed through {@link SlotContext.entry} to ELN sidebar blocks.
 *
 * Populated by ElnWorkspace and read by blocks bound into `eln.sidebar`.
 * Kept in a separate file so blocks can import it without pulling in
 * ElnWorkspace's transitive dependencies.
 */
import type { EntryDetail, ActionUser, Mention } from "../types";
import type { Folder } from "../hooks/useEntryFolder";

export interface ElnSidebarData {
  /** The full entry from the editor, or `null` for new entries. */
  entry: EntryDetail | null;
  /** Most recent action's performer (derived from the Activity API). */
  lastEditor: ActionUser | null;
  /** Current status value ("in_progress" | "finished"). */
  status: string;
  /** Folder list for the folder dropdown. */
  folders: Folder[];
  /** Currently selected folder ID, or `null`. */
  folderId: number | null;
  /** Numeric project ID containing the current ELN entry. */
  projectId: number | null;
  /** Whether the entry is locked by another user. */
  isLockedByOther: boolean;
  /** Callback: change the entry status. */
  onStatusChange: (status: string) => void;
  /** Callback: change the entry folder. */
  onFolderChange: (folderId: number | null) => void;
  /** Resolved mention data (target_display_id → title, workspaceId). */
  resolutionMap: Map<string, { title?: string; workspaceId?: string }>;
  /** List of mentions from the entry. */
  mentions: Mention[];
  /** Navigate callback for linked entity clicks. */
  navigate: (path: string) => void;
}
