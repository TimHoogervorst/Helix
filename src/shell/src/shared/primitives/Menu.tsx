import { useState, useRef, useEffect, type ReactNode } from "react";

interface MenuItemDef {
  id: string;
  label: string;
  danger?: boolean;
  disabled?: boolean;
  onSelect: () => void;
}

interface MenuProps {
  trigger: ReactNode;
  items: MenuItemDef[];
  className?: string;
}

export function Menu({ trigger, items, className = "" }: MenuProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open]);

  return (
    <div ref={ref} className={`relative inline-block ${className}`}>
      <div onClick={() => setOpen(!open)}>{trigger}</div>
      {open && (
        <div className="absolute z-40 mt-1.5 min-w-[160px] rounded-lg border border-[var(--color-ink-hairline)] bg-[var(--color-background)] py-1 shadow-lg">
          {items.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`border-0 bg-transparent w-full text-left px-3.5 py-1.5 font-[var(--font-body)] text-[13px] rounded transition-colors ${
                item.danger
                  ? "text-[var(--color-destructive)] hover:bg-[var(--color-destructive-subtle)]"
                  : "text-[var(--color-ink)] hover:bg-[var(--color-surface)]"
              } ${item.disabled ? "opacity-50 cursor-not-allowed" : ""}`}
              disabled={item.disabled}
              onClick={() => {
                if (!item.disabled) {
                  item.onSelect();
                  setOpen(false);
                }
              }}
            >
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
