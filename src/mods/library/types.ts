import type { Tag } from "../tags/types";

/** Public user info returned by the API for author/editor display. */
export interface AuthorInfo {
  id: number;
  username: string;
  first_name: string;
  last_name: string;
  color: string;
}

/** A folder row in the Library mixed table. */
export interface LibraryFolderItem {
  type: "folder";
  id: number;
  name: string;
  parent: number | null;
  created_at: string;
}

/** An entry row in the Library mixed table. */
export interface LibraryEntryItem {
  type: "entry";
  id: number;
  /** The workspace this entry belongs to, e.g. "eln". */
  workspace_id: string;
  display_id: string;
  title: string;
  folder: number | null;
  folder_name: string | null;
  author_username: string | null;
  author_info: AuthorInfo | null;
  status: string;
  description: string;
  tags: Tag[];
  editors: string[];
  samples_count: number | null;
  attachments_count: number | null;
  property_fields: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export type LibraryItem = LibraryFolderItem | LibraryEntryItem;

export interface LibraryContentsResponse {
  count: number;
  next: string | null;
  previous: string | null;
  results: LibraryItem[];
  /** The ID of the folder at the current path, or null for root. */
  current_folder_id: number | null;
}
