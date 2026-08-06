import { useState, useRef, useEffect, useCallback, type ReactNode } from "react";
import { createPortal } from "react-dom";

interface MenuItemDef {
  id: string;
  label: string;
  icon?: React.ComponentType<{ className?: string }>;
  danger?: boolean;
  disabled?: boolean;
  title?: string;
  onSelect: () => void;
}

interface MenuProps {
  trigger: ReactNode;
  items: MenuItemDef[];
  className?: string;
}

function menuStyle(
  triggerEl: HTMLElement | null,
): { position: "fixed"; top: number; left: number } {
  if (!triggerEl) {
    return { position: "fixed", top: 0, left: 0 };
  }
  const rect = triggerEl.getBoundingClientRect();
  return {
    position: "fixed",
    top: rect.bottom + 4,
    left: rect.left,
  };
}

export function Menu({ trigger, items, className = "" }: MenuProps) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState(() => menuStyle(null));
  const triggerRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<Map<string, HTMLButtonElement>>(new Map());
  const [focusIndex, setFocusIndex] = useState(-1);

  const enabledItems = items.filter((i) => !i.disabled);

  const close = useCallback(() => {
    setOpen(false);
    setFocusIndex(-1);
    if (triggerRef.current) {
      const btn = triggerRef.current.querySelector("button");
      if (btn) btn.focus();
    }
  }, []);

  const handleToggle = useCallback(() => {
    setOpen((prev) => !prev);
  }, []);

  // Reposition on open
  useEffect(() => {
    if (open && triggerRef.current) {
      setPosition(menuStyle(triggerRef.current));
    }
  }, [open]);

  // Scroll / resize repositioning
  useEffect(() => {
    if (!open) return;
    const reposition = () => {
      if (triggerRef.current) {
        setPosition(menuStyle(triggerRef.current));
      }
    };
    window.addEventListener("scroll", reposition, true);
    window.addEventListener("resize", reposition);
    return () => {
      window.removeEventListener("scroll", reposition, true);
      window.removeEventListener("resize", reposition);
    };
  }, [open]);

  // Click-outside dismissal
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        menuRef.current &&
        !menuRef.current.contains(target) &&
        triggerRef.current &&
        !triggerRef.current.contains(target)
      ) {
        close();
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open, close]);

  // Keyboard: Escape to close, arrow keys to navigate
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
          if (prev < 0) {
            return e.key === "ArrowDown" ? 0 : enabledItems.length - 1;
          }
          const delta = e.key === "ArrowDown" ? 1 : -1;
          return (prev + delta + enabledItems.length) % enabledItems.length;
        });
        return;
      }

      if (e.key === "Enter" && focusIndex >= 0) {
        e.preventDefault();
        const item = enabledItems[focusIndex];
        if (item) {
          item.onSelect();
          close();
        }
      }
    };

    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open, close, enabledItems, focusIndex]);

  // Focus the item at focusIndex
  useEffect(() => {
    if (!open || focusIndex < 0 || enabledItems.length === 0) return;
    const item = enabledItems[focusIndex];
    if (!item) return;
    const el = itemRefs.current.get(item.id);
    el?.focus();
  }, [open, focusIndex, enabledItems]);

  const handleItemClick = (item: MenuItemDef) => {
    if (!item.disabled) {
      item.onSelect();
      close();
    }
  };

  return (
    <>
      <div
        ref={triggerRef}
        className={`inline-block ${className}`}
        role="group"
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={handleToggle}
      >
        {trigger}
      </div>
      {open &&
        createPortal(
          <div
            ref={menuRef}
            role="menu"
            className="z-50 min-w-[160px] overflow-hidden rounded-md border border-[var(--color-ink-hairline)] bg-[var(--color-background)] p-1 shadow-lg"
            style={position}
          >
            {items.map((item) => (
              <button
                key={item.id}
                ref={(el) => {
                  if (el) {
                    itemRefs.current.set(item.id, el);
                  } else {
                    itemRefs.current.delete(item.id);
                  }
                }}
                role="menuitem"
                type="button"
                title={item.title}
                className={`border-0 bg-transparent flex w-full items-center gap-2 rounded-sm px-2 py-1.5 font-[var(--font-body)] text-base transition-colors ${
                  item.disabled
                    ? "cursor-not-allowed opacity-50"
                    : item.danger
                      ? "text-[var(--color-destructive)] hover:bg-[var(--color-destructive-subtle)]"
                      : "text-[var(--color-ink)] hover:bg-[var(--color-surface)]"
                }`}
                disabled={item.disabled}
                onClick={() => handleItemClick(item)}
              >
                {item.icon && (
                  <item.icon className="h-3.5 w-3.5" aria-hidden="true" />
                )}
                {item.label}
              </button>
            ))}
          </div>,
          document.body,
        )}
    </>
  );
}
