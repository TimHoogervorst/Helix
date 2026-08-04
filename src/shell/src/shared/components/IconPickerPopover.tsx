import { useState, useRef, useMemo, useCallback, useEffect, lazy, Suspense } from "react";
import type { ComponentType } from "react";
import { Circle } from "lucide-react";
import { IconBadge } from "./IconBadge";
import { useClickOutside } from "../hooks/useClickOutside";
import { ModRegistry } from "../../mod-system/ModRegistry";

let _dynamicIconImports: Record<
  string,
  () => Promise<{ default: ComponentType<{ className?: string }> }>
> | null = null;

function getIconImport(
  token: string,
): (() => Promise<{ default: ComponentType<{ className?: string }> }>) | undefined {
  if (!_dynamicIconImports) return undefined;
  return _dynamicIconImports[token];
}

function loadDynamicIconImports() {
  if (_dynamicIconImports) return;
  import("lucide-react/dynamicIconImports")
    .then((mod) => {
      _dynamicIconImports = mod.default as unknown as Record<
        string,
        () => Promise<{ default: ComponentType<{ className?: string }> }>
      >;
    })
    .catch(() => {
      // dynamic imports unavailable (e.g. test environment) — fall back gracefully
    });
}
loadDynamicIconImports();

const ICONS_PER_PAGE = 20;

interface IconLibraryEntry {
  key: string;
  label: string;
}

interface ColorEntry {
  key: string;
  label: string;
  hex: string;
}

export interface IconPickerPopoverProps {
  iconKey: string;
  colorKey: string;
  size?: "sm" | "md" | "lg";
  onChange: (iconKey: string, colorKey: string) => void;
}

function deriveForeground(hex: string): string {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const rLin = r <= 0.03928 ? r / 12.92 : Math.pow((r + 0.055) / 1.055, 2.4);
  const gLin = g <= 0.03928 ? g / 12.92 : Math.pow((g + 0.055) / 1.055, 2.4);
  const bLin = b <= 0.03928 ? b / 12.92 : Math.pow((b + 0.055) / 1.055, 2.4);
  const luminance = 0.2126 * rLin + 0.7152 * gLin + 0.0722 * bLin;
  return luminance > 0.5 ? "#1a1a1a" : "#ffffff";
}

function LazyIcon({
  token,
  className,
}: {
  token: string;
  className?: string;
}) {
  const Component = useMemo(() => {
    const importFn = getIconImport(token);
    if (!importFn) return null;
    return lazy(importFn);
  }, [token]);

  if (!Component) {
    return <Circle className={className} />;
  }

  return (
    <Suspense fallback={<div className={className} />}>
      <Component className={className} />
    </Suspense>
  );
}

function getIconLibrary(): IconLibraryEntry[] {
  const entries = ModRegistry.getInstance().getIconLibrary();
  if (entries.size === 0) return [];
  return Array.from(entries.values()).map((e) => ({
    key: e.key,
    label: e.label,
  }));
}

function getColorPalette(): ColorEntry[] {
  const entries = ModRegistry.getInstance().getColorPalette();
  if (entries.size === 0) return [];
  return Array.from(entries.values()).map((e) => ({
    key: e.key,
    label: e.label,
    hex: e.hex,
  }));
}

export function IconPickerPopover({
  iconKey,
  colorKey,
  size = "md",
  onChange,
}: IconPickerPopoverProps) {
  const [open, setOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<"icons" | "colour">("icons");
  const [search, setSearch] = useState("");
  const [iconPage, setIconPage] = useState(0);

  const containerRef = useRef<HTMLDivElement>(null);

  useClickOutside(containerRef, () => setOpen(false), open);

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open]);

  const toggleOpen = useCallback(() => {
    setOpen((prev) => {
      if (prev) return false;
      setIconPage(0);
      return true;
    });
  }, []);

  const handleIconSelect = useCallback(
    (newIconKey: string) => {
      onChange(newIconKey, colorKey);
      setOpen(false);
    },
    [onChange, colorKey],
  );

  const handleColorSelect = useCallback(
    (newColorKey: string) => {
      onChange(iconKey, newColorKey);
      setOpen(false);
    },
    [onChange, iconKey],
  );

  const iconLibrary = useMemo(() => getIconLibrary(), []);
  const colorPalette = useMemo(() => getColorPalette(), []);

  const filteredIcons = useMemo(() => {
    const q = search.toLowerCase();
    return iconLibrary.filter(
      (i) =>
        i.label.toLowerCase().includes(q) ||
        i.key.toLowerCase().includes(q),
    );
  }, [iconLibrary, search]);

  const filteredColors = useMemo(() => {
    const q = search.toLowerCase();
    return colorPalette.filter(
      (c) =>
        c.label.toLowerCase().includes(q) ||
        c.key.toLowerCase().includes(q),
    );
  }, [colorPalette, search]);

  const totalIconPages = Math.max(
    1,
    Math.ceil(filteredIcons.length / ICONS_PER_PAGE),
  );
  const pageIcons = filteredIcons.slice(
    iconPage * ICONS_PER_PAGE,
    (iconPage + 1) * ICONS_PER_PAGE,
  );

  return (
    <div className="relative inline-block" ref={containerRef}>
      <IconBadge
        iconKey={iconKey}
        colorKey={colorKey}
        size={size}
        onChange={toggleOpen}
      />

      {open && (
        <div
          data-testid="icon-picker-popover"
          className="absolute left-0 top-full z-50 mt-1 w-72 rounded-md border border-hairline bg-panel shadow-lg p-3"
        >
          <input
            type="search"
            placeholder="Search..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setIconPage(0);
            }}
            data-testid="popover-search"
            className="w-full rounded border border-hairline bg-muted px-2 py-1 text-sm text-foreground placeholder:text-muted-foreground outline-none mb-2"
          />

          <div className="lims-tab-bar shrink-0 mb-2">
            <button
              type="button"
              data-testid="tab-icons"
              className={`lims-tab ${activeTab === "icons" ? "is-active" : ""}`}
              onClick={() => setActiveTab("icons")}
            >
              Icons
            </button>
            <button
              type="button"
              data-testid="tab-colour"
              className={`lims-tab ${activeTab === "colour" ? "is-active" : ""}`}
              onClick={() => setActiveTab("colour")}
            >
              Colour
            </button>
          </div>

          {activeTab === "icons" && (
            <div data-testid="icons-grid">
              {pageIcons.length === 0 && (
                <p className="text-muted-foreground text-sm py-4 text-center">
                  No icons found.
                </p>
              )}
              {pageIcons.length > 0 && (
                <div className="grid grid-cols-5 gap-1">
                  {pageIcons.map((ico) => (
                    <button
                      key={ico.key}
                      type="button"
                      data-testid={`icon-option-${ico.key}`}
                      className={`h-10 w-10 rounded border flex items-center justify-center transition-colors hover:bg-muted bg-transparent text-foreground ${
                        iconKey === ico.key
                          ? "border-foreground bg-muted"
                          : "border-transparent"
                      }`}
                      title={ico.label}
                      aria-label={ico.label}
                      onClick={() => handleIconSelect(ico.key)}
                    >
                      <LazyIcon token={ico.key} className="h-5 w-5" />
                    </button>
                  ))}
                </div>
              )}

              {totalIconPages > 1 && (
                <div
                  data-testid="pagination-controls"
                  className="flex items-center justify-center gap-2 mt-2"
                >
                  <button
                    type="button"
                    data-testid="pagination-prev"
                    className="lims-tab"
                    disabled={iconPage === 0}
                    onClick={() => setIconPage((p) => Math.max(0, p - 1))}
                  >
                    &lt;
                  </button>
                  <span className="text-xs text-muted-foreground">
                    {iconPage + 1} / {totalIconPages}
                  </span>
                  <button
                    type="button"
                    data-testid="pagination-next"
                    className="lims-tab"
                    disabled={iconPage >= totalIconPages - 1}
                    onClick={() =>
                      setIconPage((p) => Math.min(totalIconPages - 1, p + 1))
                    }
                  >
                    &gt;
                  </button>
                </div>
              )}
            </div>
          )}

          {activeTab === "colour" && (
            <div data-testid="colour-grid">
              {filteredColors.length === 0 && (
                <p className="text-muted-foreground text-sm py-4 text-center">
                  No colours found.
                </p>
              )}
              {filteredColors.length > 0 && (
                <div className="grid grid-cols-4 gap-2">
                  {filteredColors.map((c) => {
                    const foreground = deriveForeground(c.hex);
                    return (
                      <button
                        key={c.key}
                        type="button"
                        data-testid={`color-option-${c.key}`}
                        className={`h-10 rounded border-2 transition-transform hover:scale-105 flex items-center justify-center text-xs font-medium ${
                          colorKey === c.key
                            ? "border-foreground"
                            : "border-transparent"
                        }`}
                        style={{
                          backgroundColor: c.hex,
                          color: foreground,
                        }}
                        title={c.label}
                        aria-label={c.label}
                        onClick={() => handleColorSelect(c.key)}
                      >
                        {c.label}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
