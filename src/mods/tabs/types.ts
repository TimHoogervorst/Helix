/** A user-pinned workspace bookmark as returned by the API. */
export interface PinnedWorkspace {
  id: number;
  display_id: string;
  label: string;
  url: string;
  icon: string;
  color: string;
  created_at: string;
}

/** Re-exported from core/mod-system/types so both tabs and mentions share it. */
export type { CurrentWorkspace } from "../../shell/src/mod-system/types";
