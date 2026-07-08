/**
 * TagPill — single display component for a tag.
 *
 * Minimal mode (read-only): icon + name on a coloured pill — for cards,
 * search results, and anywhere tags are displayed without interaction.
 *
 * Interactive mode: when `onRemove` and/or `onIconChange` props are
 * passed, the pill shows action buttons (remove X, icon change).
 */
import { X } from "lucide-react";
import type { Tag } from "../types";
import { getTagIcon } from "../constants";

export interface TagPillProps {
  tag: Tag;
  /** Show a remove button and call this when clicked. */
  onRemove?: (tagId: number) => void;
  /** Show an icon-change button and call this when an icon is selected. */
  onIconChange?: (tagId: number, icon: string) => void;
}

export function TagPill({ tag, onRemove, onIconChange }: TagPillProps) {
  const iconInfo = getTagIcon(tag.icon);
  const IconComponent = iconInfo.Icon;
  const isInteractive = !!(onRemove || onIconChange);

  return (
    <span
      className={`tag-pill tag-${tag.color}`}
      data-testid="tag-pill"
      data-tag-id={tag.id}
    >
      {isInteractive && onIconChange ? (
        <button
          type="button"
          className="inline-flex h-4 w-4 items-center justify-center rounded-full !p-0 hover:opacity-70"
          onClick={() => onIconChange(tag.id, tag.icon)}
          aria-label={`Change icon for ${tag.name}`}
          title={iconInfo.label}
        >
          <IconComponent className="h-3 w-3" aria-hidden="true" />
        </button>
      ) : (
        <IconComponent className="h-3 w-3 shrink-0" aria-hidden="true" />
      )}
      {tag.name}
      {isInteractive && onRemove && (
        <button
          type="button"
          className="ml-0.5 inline-flex h-3.5 w-3.5 items-center justify-center rounded-full !p-0 hover:opacity-70"
          onClick={() => onRemove(tag.id)}
          aria-label={`Remove tag ${tag.name}`}
        >
          <X className="h-3 w-3" aria-hidden="true" />
        </button>
      )}
    </span>
  );
}
