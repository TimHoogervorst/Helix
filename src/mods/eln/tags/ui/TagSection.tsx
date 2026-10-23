import type { Tag } from "../types";
import { TagAutocomplete } from "./TagAutocomplete";
import { TagPill } from "./TagPill";

export interface TagSectionProps {
  tags: Tag[];
  onAddTag?: (tag: Tag) => void;
  onRemoveTag?: (tagId: number) => void;
}

export function TagSection({
  tags,
  onAddTag,
  onRemoveTag,
}: TagSectionProps) {
  if (tags.length === 0 && !onAddTag && !onRemoveTag) return null;

  return (
    <div
      className="mt-3 flex flex-wrap items-center gap-1.5"
      data-testid="tags-section"
    >
      {tags.map((tag) => (
        <TagPill key={tag.id} tag={tag} onRemove={onRemoveTag} />
      ))}

      {onAddTag && (
        <TagAutocomplete
          attachedTagIds={tags.map((tag) => tag.id)}
          onTagSelect={onAddTag}
          allowCreate={false}
          placeholder="Search tags…"
        />
      )}
    </div>
  );
}
