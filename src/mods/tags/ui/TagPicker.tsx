/**
 * TagPicker — dropdown: search existing tags → select.
 *
 * No "Create new" option. For filter bars and metadata panels where
 * you only pick from what exists. Supports multi-select.
 */
import { useState, useRef, useCallback } from "react";
import type { Tag } from "../types";
import { useTagSearch } from "../hooks/useTagSearch";
import { getTagIcon } from "../constants";
import { TagPill } from "./TagPill";
import { Input } from "../../../shell/src/shared/primitives";

export interface TagPickerProps {
  /** Currently selected tags. */
  selectedTags: Tag[];
  /** Called when a tag is added to the selection. */
  onTagSelect: (tag: Tag) => void;
  /** Called when a tag is removed from the selection. */
  onTagRemove: (tagId: number) => void;
  /** Placeholder text for the search input. */
  placeholder?: string;
}

export function TagPicker({
  selectedTags,
  onTagSelect,
  onTagRemove,
  placeholder = "Search tags…",
}: TagPickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const attachedIds = selectedTags.map((t) => t.id);

  const {
    query,
    setQuery,
    suggestions,
    clearSearch,
  } = useTagSearch({ attachedTagIds: attachedIds });

  const handleFocus = useCallback(() => {
    setIsOpen(true);
  }, []);

  const handleSelect = useCallback(
    (tag: Tag) => {
      onTagSelect(tag);
      clearSearch();
      inputRef.current?.focus();
    },
    [onTagSelect, clearSearch],
  );

  const handleRemove = useCallback(
    (tagId: number) => {
      onTagRemove(tagId);
    },
    [onTagRemove],
  );

  const handleBlur = useCallback(() => {
    // Delay to allow click on suggestion to register.
    setTimeout(() => {
      setIsOpen(false);
      clearSearch();
    }, 150);
  }, [clearSearch]);

  return (
    <div className="relative" data-testid="tag-picker">
      {/* ── Selected tags ── */}
      <div className="flex flex-wrap items-center gap-1.5">
        {selectedTags.map((tag) => (
          <TagPill key={tag.id} tag={tag} onRemove={handleRemove} />
        ))}

        {/* ── Search input ── */}
        <Input
          ref={inputRef}
          type="text"
          className="!w-36 !py-0.5 !text-xs"
          placeholder={selectedTags.length === 0 ? placeholder : ""}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={handleFocus}
          onBlur={handleBlur}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              setIsOpen(false);
              clearSearch();
            }
          }}
          data-testid="tag-picker-input"
        />
      </div>

      {/* ── Dropdown ── */}
      {isOpen && query.trim() && (
        <div
          className="absolute left-0 top-full z-50 mt-1 min-w-[200px] rounded-md border border-hairline bg-panel py-1 shadow-lg"
          data-testid="tag-picker-dropdown"
        >
          {suggestions.length === 0 ? (
            <div className="px-2.5 py-1.5 text-base text-muted-foreground">
              No matching tags
            </div>
          ) : (
            suggestions.map((t) => {
              const ti = getTagIcon(t.icon);
              const TagIcon = ti.Icon;
              return (
                <button
                  key={t.id}
                  type="button"
                  className="flex w-full items-center gap-2 rounded px-2.5 py-1.5 text-left text-base hover:bg-muted"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    handleSelect(t);
                  }}
                >
                  <TagIcon
                    className="h-3.5 w-3.5 shrink-0 text-muted-foreground"
                    aria-hidden="true"
                  />
                  {t.name}
                </button>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
