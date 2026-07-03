/** A notebook entry displayed in the Library console and ELN workspace. */
export interface ElnEntry {
  type: "entry";
  id: number;
  display_id: string;
  title: string;
  folder: number | null;
  folder_name: string | null;
  author_username: string | null;
  created_at: string;
  updated_at: string;
}

// TODO: Add full ELN types when the ELN mod is fully implemented (#85):
// - EntryDetail (TipTap doc, tags, mentions)
// - Tag
// - Mention
// - TipTapDoc
