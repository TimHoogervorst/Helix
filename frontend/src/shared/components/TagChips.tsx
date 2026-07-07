/**
 * Tag display used on cards and in detail views.
 *
 * Extracted from BaseCard — renders a list of colored tag chips.
 */

// ── Types ──────────────────────────────────────────────────────────────────

export interface TagChip {
  name: string;
  color: string;
}

export interface TagChipsProps {
  tags: TagChip[];
}

// ── Component ──────────────────────────────────────────────────────────────

export function TagChips({ tags }: TagChipsProps) {
  if (tags.length === 0) return null;

  return (
    <div className="card-tags">
      {tags.map((tag) => (
        <span key={tag.name} className={`tag-chip tag-${tag.color}`}>
          {tag.name}
        </span>
      ))}
    </div>
  );
}
