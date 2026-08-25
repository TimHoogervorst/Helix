import { useEffect, useRef, useState } from "react";
import type { KeyboardEvent as ReactKeyboardEvent } from "react";
import { createPortal } from "react-dom";
import type { Editor } from "@tiptap/core";
import type { BlockBinding } from "../../mod-system/types";

export interface BlockPopoverProps {
  editor: Editor;
  bindings: BlockBinding[];
  position: { top: number; left: number };
  onClose: () => void;
  paragraphPosition?: number;
  initialQuery?: string;
  showSearch?: boolean;
  onSelect?: (binding: BlockBinding) => void;
}

function fuzzyMatch(text: string, query: string) {
  let index = 0;
  const value = text.toLowerCase();
  for (const character of query.toLowerCase()) {
    index = value.indexOf(character, index);
    if (index === -1) return false;
    index += 1;
  }
  return true;
}

export function BlockPopover({
  editor,
  bindings,
  position,
  onClose,
  paragraphPosition,
  initialQuery = "",
  showSearch = true,
  onSelect,
}: BlockPopoverProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState(initialQuery);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const items = bindings.filter((binding) =>
    fuzzyMatch(`${binding.label} ${binding.id} ${(binding.tags ?? []).join(" ")}`, query),
  );

  useEffect(() => {
    if (showSearch) inputRef.current?.focus();
    const handleOutsideClick = (event: MouseEvent) => {
      if (!panelRef.current?.contains(event.target as Node)) onClose();
    };
    const handleKeyDown = (event: globalThis.KeyboardEvent) => {
      if (!showSearch && (event.key === "ArrowDown" || event.key === "ArrowUp")) {
        event.preventDefault();
        setSelectedIndex((index) => {
          const length = Math.max(items.length, 1);
          return event.key === "ArrowDown"
            ? (index + 1) % length
            : (index - 1 + length) % length;
        });
      } else if (!showSearch && (event.key === "Enter" || event.key === "Tab") && items[selectedIndex]) {
        event.preventDefault();
        selectBlock(items[selectedIndex]);
      }
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      }
    };
    document.addEventListener("mousedown", handleOutsideClick);
    document.addEventListener("keydown", handleKeyDown, true);
    return () => {
      document.removeEventListener("mousedown", handleOutsideClick);
      document.removeEventListener("keydown", handleKeyDown, true);
    };
  }, [items, onClose, selectedIndex, showSearch]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  useEffect(() => {
    setQuery(initialQuery);
  }, [initialQuery]);

  const selectBlock = (binding: BlockBinding) => {
    if (onSelect) {
      onSelect(binding);
      return;
    }
    if (paragraphPosition === undefined) {
      onClose();
      return;
    }
    const node = editor.state.doc.nodeAt(paragraphPosition);
    if (!node || node.type.name !== "paragraph" || node.content.size !== 0) {
      onClose();
      return;
    }
    editor
      .chain()
      .focus()
      .insertContentAt(
        { from: paragraphPosition, to: paragraphPosition + node.nodeSize },
        {
          type: binding.id,
          attrs: { content: binding.serialize(binding.defaultState) },
        },
      )
      .run();
    editor.commands.setNodeSelection(paragraphPosition);
    onClose();
  };

  const handleInputKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setSelectedIndex((index) => (index + 1) % Math.max(items.length, 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setSelectedIndex((index) => (index - 1 + Math.max(items.length, 1)) % Math.max(items.length, 1));
    } else if (event.key === "Enter" && items[selectedIndex]) {
      event.preventDefault();
      selectBlock(items[selectedIndex]);
    }
  };

  return createPortal(
    <div
      ref={panelRef}
      className="block-popover"
      data-testid="block-popover"
      style={{ position: "fixed", top: position.top, left: position.left }}
    >
      {showSearch ? (
        <input
          ref={inputRef}
          type="text"
          aria-label="Search blocks"
          className="block-popover-search"
          placeholder="Search blocks"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={handleInputKeyDown}
        />
      ) : null}
      <div role="listbox" aria-label="Blocks">
        {items.length === 0 ? (
          <div className="block-popover-empty" data-testid="block-popover-no-results">No blocks found.</div>
        ) : (
          items.map((binding, index) => (
            <button
              key={binding.id}
              type="button"
              role="option"
              aria-selected={index === selectedIndex}
              className={`block-popover-item focus-visible:ring-2 focus-visible:ring-[var(--color-focus-ring)] focus-visible:ring-offset-1${index === selectedIndex ? " is-selected" : ""}`}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => selectBlock(binding)}
            >
              <span>{binding.label}</span>
              {binding.tags?.length ? <small>{binding.tags.join(", ")}</small> : null}
            </button>
          ))
        )}
      </div>
    </div>,
    document.body,
  );
}
