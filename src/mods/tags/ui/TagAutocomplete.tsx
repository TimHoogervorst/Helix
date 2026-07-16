/**
 * TagAutocomplete — dropdown: search existing tags (limit: 2 matches)
 * + "Create new" option at the bottom.
 *
 * On "Create new", a colour picker slides in. On colour click, the tag
 * is created with the icon defaulting to `circle`. The icon can be
 * changed via the icon picker row before clicking a colour.
 *
 * For editors and anywhere you need to create tags inline.
 */
import { useState, useRef, useCallback } from "react";
import { Circle, X } from "lucide-react";
import type { Tag } from "../types";
import { useTagSearch } from "../hooks/useTagSearch";
import { getTagIcon } from "../constants";
import { TagColorPicker } from "./TagColorPicker";
import { TagIconPicker } from "./TagIconPicker";

export interface TagAutocompleteProps {
  /** IDs of tags already attached (filtered out of suggestions). */
  attachedTagIds: number[];
  /** Called when an existing tag is selected from suggestions. */
  onTagSelect: (tag: Tag) => void;
  /** Called when a new tag is created via the create-new flow. */
  onTagCreated?: (tag: Tag) => void;
  /** Placeholder text for the search input. */
  placeholder?: string;
  /** Maximum number of matching suggestions to show. Default 2. */
  suggestionLimit?: number;
}

export function TagAutocomplete({
  attachedTagIds,
  onTagSelect,
  onTagCreated,
  placeholder = "Search tags…",
  suggestionLimit = 2,
}: TagAutocompleteProps) {
  const [isOpen, setIsOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const {
    query,
    setQuery,
    suggestions,
    isCreating,
    pendingName,
    pendingColor,
    pendingIcon,
    startCreate,
    pickColor,
    pickIcon,
    cancelCreate,
    clearSearch,
  } = useTagSearch({
    attachedTagIds,
    onTagCreated,
  });

  const handleFocus = useCallback(() => {
    setIsOpen(true);
  }, []);

  const handleSelect = useCallback(
    (tag: Tag) => {
      onTagSelect(tag);
      clearSearch();
      setIsOpen(false);
    },
    [onTagSelect, clearSearch],
  );

  const handleColorPick = useCallback(
    async (color: string) => {
      const tag = await pickColor(color);
      if (tag) {
        setIsOpen(false);
      }
    },
    [pickColor],
  );

  const handleBlur = useCallback(() => {
    setTimeout(() => {
      if (!isCreating) {
        setIsOpen(false);
        clearSearch();
      }
    }, 150);
  }, [isCreating, clearSearch]);

  const limited = suggestions.slice(0, suggestionLimit);

  const showCreateNew =
    query.trim() &&
    !isCreating &&
    // Only show "Create new" if there isn't an exact match in suggestions
    !suggestions.some(
      (t) => t.name.toLowerCase() === query.trim().toLowerCase(),
    );

  return (
    <div className="relative" data-testid="tag-autocomplete">
      {/* ── Search input ── */}
      <input
        ref={inputRef}
        type="text"
        className="!w-36 !py-0.5 !text-xs !bg-transparent !border-0"
        placeholder={placeholder}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onFocus={handleFocus}
        onBlur={handleBlur}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            if (isCreating) {
              cancelCreate();
            } else {
              setIsOpen(false);
              clearSearch();
            }
          }
        }}
        data-testid="tag-autocomplete-input"
      />

      {/* ── Dropdown ── */}
      {isOpen && query.trim() && !isCreating && (
        <div
          className="absolute left-0 top-full z-50 mt-1 min-w-[200px] rounded-md border border-hairline bg-panel py-1 shadow-lg"
          data-testid="tag-autocomplete-dropdown"
        >
          {/* Existing tag suggestions (limit: 2) */}
          {limited.map((t) => {
            const ti = getTagIcon(t.icon);
            const TagIcon = ti.Icon;
            return (
              <button
                key={t.id}
                type="button"
                className="flex w-full items-center gap-2 rounded px-2.5 py-1.5 text-left text-[13px] border-transparent bg-transparent text-foreground hover:bg-muted"
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
          })}

          {/* "Create new" row */}
          {showCreateNew && (
            <button
              type="button"
              className="flex w-full items-center gap-2 rounded px-2.5 py-1.5 text-left text-[13px] border-transparent bg-transparent text-foreground hover:bg-muted"
              onMouseDown={(e) => {
                e.preventDefault();
                startCreate(query.trim());
              }}
            >
              <Circle className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
              {query.trim()}
              <span className="text-muted-foreground">— Create new</span>
            </button>
          )}
        </div>
      )}

      {/* ── Create-new panel (replaces dropdown when isCreating) ── */}
      {isOpen && isCreating && pendingName && (
        <div
          className="absolute left-0 top-full z-50 mt-1 min-w-[260px] rounded-md border border-hairline bg-panel p-3 shadow-lg"
          data-testid="tag-create-panel"
        >
          <div className="flex items-center justify-between mb-2">
            <span className="font-mono text-[0.7rem] text-muted-foreground">
              New tag: &ldquo;{pendingName}&rdquo;
            </span>
            <button
              type="button"
              className="text-muted-foreground hover:text-foreground"
              onClick={cancelCreate}
              aria-label="Cancel tag creation"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>

          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <span className="font-mono text-[0.65rem] text-muted-foreground w-8">
                Color
              </span>
              <TagColorPicker
                value={pendingColor}
                onChange={handleColorPick}
                size="xs"
              />
            </div>
            <div className="flex items-center gap-2">
              <span className="font-mono text-[0.65rem] text-muted-foreground w-8">
                Icon
              </span>
              <TagIconPicker
                value={pendingIcon}
                onChange={pickIcon}
                size="xs"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
