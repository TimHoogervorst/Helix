/** A user-pinned workspace bookmark as returned by the API. */
export interface PinnedWorkspace {
  id: number;
  display_id: string;
  label: string;
  url: string;
  icon: string;
  color: string;
  created_at: string;
  order?: number;
  folder?: number | null;
  folder_expanded?: boolean | null;
}

export interface TabLayoutFolder {
  id: number;
  order: number;
  expanded: boolean;
  tab_ids: number[];
}

export interface TabFolder {
  id: number;
  name: string;
  order: number;
  expanded: boolean;
}

export interface TabLayoutTab {
  id: number;
  order: number;
  folder: number | null;
}

export interface TabLayout {
  folders: TabLayoutFolder[];
  tabs: TabLayoutTab[];
}

export interface TabLayoutResponse {
  folders: TabFolder[];
  tabs: PinnedWorkspace[];
}

/** Re-exported from core/mod-system/types so both tabs and mentions share it. */
export type { CurrentWorkspace } from "../../shell/src/mod-system/types";
