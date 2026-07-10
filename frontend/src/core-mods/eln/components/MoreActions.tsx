/**
 * MoreActions — portaled dropdown menu for toolbar overflow actions.
 *
 * Renders an "…" trigger icon button that opens a portaled dropdown menu.
 * Handles click-outside dismissal, Escape to close, focus return, arrow-key
 * item navigation, and scroll/resize repositioning.
 * Follows existing .btn-icon toolbar conventions.
 */
import { useState, useRef, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { Ellipsis } from "lucide-react";
import { useClickOutside } from "../../../shared/hooks/useClickOutside";

export interface MoreActionsItem {
  key: string;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  onClick: () => void;
  /** Accessible tooltip shown as title attribute on the menu item. */
  tooltip?: string;
  /** When true, the item is non-interactive. */
  disabled?: boolean;
  /** When true, the item is styled with destructive (red) styling. */
  destructive?: boolean;
}

interface MoreActionsProps {
  items: MoreActionsItem[];
}

/** Compute fixed-position style for the menu, anchored to the trigger. */
function menuStyle(
  triggerEl: HTMLElement | null,
): { position: "fixed"; top: number; right: number } {
  if (!triggerEl) {
    return { position: "fixed", top: 0, right: 0 };
  }
  const rect = triggerEl.getBoundingClientRect();
  return {
    position: "fixed",
    top: rect.bottom + 4,
    right: window.innerWidth - rect.right,
  };
}

function MoreActions({ items }: MoreActionsProps) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState(() => menuStyle(null));
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<Map<string, HTMLButtonElement>>(new Map());
  const [focusIndex, setFocusIndex] = useState(-1);

  // Filter out disabled items for keyboard navigation (they are skipped).
  const enabledItems = items.filter((i) => !i.disabled);

  const close = useCallback(() => {
    setOpen(false);
    setFocusIndex(-1);
    triggerRef.current?.focus();
  }, []);

  // ── Reposition on open ──
  useEffect(() => {
    if (open && triggerRef.current) {
      setPosition(menuStyle(triggerRef.current));
    }
  }, [open]);

  // ── Scroll / resize repositioning ──
  useEffect(() => {
    if (!open) return;

    const reposition = () => {
      if (triggerRef.current) {
        setPosition(menuStyle(triggerRef.current));
      }
    };

    window.addEventListener("scroll", reposition, true); // capture phase for scrollable ancestors
    window.addEventListener("resize", reposition);

    return () => {
      window.removeEventListener("scroll", reposition, true);
      window.removeEventListener("resize", reposition);
    };
  }, [open]);

  // ── Click-outside dismissal ──
  useClickOutside([menuRef, triggerRef], close, open);

  // ── Keyboard: Escape to close, arrow keys to navigate ──
  useEffect(() => {
    if (!open) return;

    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        close();
        return;
      }

      if (enabledItems.length === 0) return;

      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        setFocusIndex((prev) => {
          // No item focused yet — start at first (ArrowDown) or last (ArrowUp).
          if (prev < 0) {
            return e.key === "ArrowDown" ? 0 : enabledItems.length - 1;
          }
          const delta = e.key === "ArrowDown" ? 1 : -1;
          return (prev + delta + enabledItems.length) % enabledItems.length;
        });
        return;
      }
    };

    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open, close, enabledItems]);

  // ── Focus the item at focusIndex ──
  useEffect(() => {
    if (!open || focusIndex < 0 || enabledItems.length === 0) return;
    const item = enabledItems[focusIndex];
    if (!item) return;
    const el = itemRefs.current.get(item.key);
    el?.focus();
  }, [open, focusIndex, enabledItems]);

  const handleItemClick = (item: MoreActionsItem) => {
    close();
    item.onClick();
  };

  return (
    <>
      <button
        ref={triggerRef}
        className="btn-icon rounded-md"
        aria-label="More actions"
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => setOpen((prev) => !prev)}
      >
        <Ellipsis className="h-4 w-4" aria-hidden="true" />
      </button>

      {open &&
        createPortal(
          <div
            ref={menuRef}
            role="menu"
            className="z-50 min-w-[160px] overflow-hidden rounded-md border border-hairline bg-panel p-1 shadow-lg"
            style={position}
          >
            {items.map((item) => (
              <button
                key={item.key}
                ref={(el) => {
                  if (el) {
                    itemRefs.current.set(item.key, el);
                  } else {
                    itemRefs.current.delete(item.key);
                  }
                }}
                role="menuitem"
                disabled={item.disabled}
                title={item.tooltip}
                className={`flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-[13px] transition-colors hover:bg-background ${
                  item.disabled
                    ? "cursor-not-allowed opacity-50"
                    : item.destructive
                      ? "text-destructive hover:text-destructive-foreground"
                      : "text-foreground"
                }`}
                onClick={() => handleItemClick(item)}
              >
                <item.icon className="h-3.5 w-3.5" aria-hidden="true" />
                {item.label}
              </button>
            ))}
          </div>,
          document.body,
        )}
    </>
  );
}

export default MoreActions;
