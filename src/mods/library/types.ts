import type { Tag } from "../tags/types";

/** Public user info returned by the API for author/editor display. */
export interface AuthorInfo {
  id: number;
  username: string;
  first_name: string;
  last_name: string;
  color: string;
}

/** A target project in a share summary. */
export interface ShareTargetProject {
  id: number;
  name: string;
  icon_key: string;
  color_key: string;
}

/** Share summary present on owned folders when shared out. */
export interface ShareSummary {
  shared: true;
  target_projects: ShareTargetProject[];
}

/** A folder row in the Library mixed table. */
export interface LibraryFolderItem {
  type: "folder";
  id: number;
  name: string;
  parent: number | null;
  created_at: string;
  is_shared?: boolean;
  source_project_id?: number;
  source_project_name?: string;
  source_project_icon?: string;
  source_project_color?: string;
  share_summary?: ShareSummary;
  children_count?: number;
  depth?: number;
}

/** An entry row in the Library mixed table. */
export interface LibraryEntryItem {
  type: "entry" | "entity";
  id: number;
  /** The workspace this entry belongs to, e.g. "eln". */
  workspace_id: string;
  display_id: string;
  title: string;
  source_type: number;
  source_type_name: string;
  source_id: number;
  author_username: string | null;
  author_info: AuthorInfo | null;
  status: string;
  description: string;
  tags: Tag[];
  editors: string[];
  samples_count: number | null;
  attachments_count: number | null;
  icon: string;
  color: string;
  property_fields: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  children_count?: number;
  depth?: number;
}

export type LibraryItem = LibraryFolderItem | LibraryEntryItem;

export interface LibraryContentsResponse {
  count: number;
  next: string | null;
  previous: string | null;
  results: LibraryItem[];
  current_project_id?: number | null;
  project_uid?: string;
  project_name?: string;
  project_is_archived?: boolean;
  project_icon?: string;
  project_color?: string;
  breadcrumb_path?: string;
}

/** A project as shown in the Library root listing. */
export interface LibraryProjectItem {
  type: "project";
  id: number;
  uid: string;
  name: string;
  icon_key: string;
  color_key: string;
  is_archived: boolean;
  current_user_role: "read" | "edit" | null;
}

/** A flat folder entry for the move picker. */
export interface LibraryFolderPath {
  id: number | null;
  name: string;
  path: string;
}
