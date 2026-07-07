/** A tag attached to a library entry. */
export interface LibraryEntryTag {
  name: string;
  color: string;
  icon: string;
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
  display_id: string;
  title: string;
  folder: number | null;
  folder_name: string | null;
  author_username: string | null;
  status: string;
  description: string;
  tags: LibraryEntryTag[];
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
