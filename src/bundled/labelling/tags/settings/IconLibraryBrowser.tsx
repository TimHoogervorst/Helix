import { useState, useEffect, useMemo, lazy, Suspense, useCallback } from "react";
import type { ComponentType } from "react";
import { Circle, X } from "lucide-react";

let _dynamicIconImports: Record<
  string,
  () => Promise<{ default: ComponentType<{ className?: string }> }>
> | null = null;

function loadDynamicIconImports() {
  if (_dynamicIconImports) return;
  import("lucide-react/dynamicIconImports")
    .then((mod) => {
      _dynamicIconImports = mod.default as unknown as Record<
        string,
        () => Promise<{ default: ComponentType<{ className?: string }> }>
      >;
    })
    .catch(() => {});
}
loadDynamicIconImports();

const ICONS_PER_PAGE = 60;

export interface IconLibraryBrowserProps {
  open: boolean;
  onClose: () => void;
  onSelect: (token: string, label: string) => void;
}

function deriveLabel(token: string): string {
  if (token === "dna") return "DNA";
  const words = token.split("-");
  return words
    .map((w) => {
      if (w.length <= 3 && w === w.toUpperCase()) return w.toUpperCase();
      return w.charAt(0).toUpperCase() + w.slice(1);
    })
    .join(" ");
}

interface IconEntry {
  token: string;
  label: string;
}

function LazyIconPreview({
  token,
}: {
  token: string;
}) {
  const Component = useMemo(() => {
    if (!_dynamicIconImports) return null;
    const importFn = _dynamicIconImports[token];
    if (!importFn) return null;
    return lazy(importFn);
  }, [token]);

  if (!Component) {
    return <Circle className="h-5 w-5" />;
  }

  return (
    <Suspense fallback={<div className="h-5 w-5" />}>
      <Component className="h-5 w-5" />
    </Suspense>
  );
}

export function IconLibraryBrowser({
  open,
  onClose,
  onSelect,
}: IconLibraryBrowserProps) {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const [allIcons, setAllIcons] = useState<IconEntry[]>([]);

  useEffect(() => {
    if (!open) {
      setSearch("");
      setPage(0);
      return;
    }
    if (_dynamicIconImports) {
      const entries: IconEntry[] = Object.keys(_dynamicIconImports).map(
        (token) => ({
          token,
          label: deriveLabel(token),
        }),
      );
      entries.sort((a, b) => a.label.localeCompare(b.label));
      setAllIcons(entries);
    } else {
      const id = setInterval(() => {
        if (_dynamicIconImports) {
          const entries: IconEntry[] = Object.keys(_dynamicIconImports).map(
            (token) => ({
              token,
              label: deriveLabel(token),
            }),
          );
          entries.sort((a, b) => a.label.localeCompare(b.label));
          setAllIcons(entries);
          clearInterval(id);
        }
      }, 100);
      return () => clearInterval(id);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open, onClose]);

  const filteredIcons = useMemo(() => {
    const q = search.toLowerCase();
    return allIcons.filter(
      (ico) =>
        ico.label.toLowerCase().includes(q) ||
        ico.token.toLowerCase().includes(q),
    );
  }, [allIcons, search]);

  const totalPages = Math.max(1, Math.ceil(filteredIcons.length / ICONS_PER_PAGE));
  const pageIcons = filteredIcons.slice(
    page * ICONS_PER_PAGE,
    (page + 1) * ICONS_PER_PAGE,
  );

  const handleSelect = useCallback(
    (token: string, label: string) => {
      onSelect(token, label);
    },
    [onSelect],
  );

  if (!open) return null;

  return (
    <div
      data-testid="lucide-browser"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="flex max-h-[85vh] w-full max-w-5xl flex-col rounded-lg border border-hairline bg-panel shadow-xl">
        <div className="flex items-center justify-between border-b border-hairline px-5 py-3">
          <h2 className="text-sm font-semibold text-foreground">
            Lucide Icon Catalog
          </h2>
          <button
            type="button"
            data-testid="lucide-browser-close"
            className="rounded border-transparent bg-transparent p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            onClick={onClose}
          >
            <X size={16} />
          </button>
        </div>

        <div className="border-b border-hairline px-5 py-2.5">
          <input
            type="search"
            placeholder="Search icons…"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(0);
            }}
            data-testid="lucide-browser-search"
            className="w-full rounded border border-hairline bg-muted px-2.5 py-1.5 text-sm text-foreground placeholder:text-muted-foreground outline-none"
          />
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {pageIcons.length === 0 && (
            <p className="py-12 text-center text-sm text-muted-foreground">
              No icons found.
            </p>
          )}

          {pageIcons.length > 0 && (
            <div className="grid grid-cols-6 gap-2">
              {pageIcons.map((ico) => (
                <button
                  key={ico.token}
                  type="button"
                  data-testid={`lucide-icon-${ico.token}`}
                  className="flex flex-col items-center gap-1 rounded border border-transparent bg-transparent p-2 transition-colors hover:bg-muted"
                  title={ico.label}
                  aria-label={ico.label}
                  onClick={() => handleSelect(ico.token, ico.label)}
                >
                  <LazyIconPreview token={ico.token} />
                  <span className="truncate text-2xs text-muted-foreground max-w-full">
                    {ico.label}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>

        {totalPages > 1 && (
          <div
            data-testid="lucide-browser-pagination"
            className="flex items-center justify-center gap-3 border-t border-hairline px-5 py-2"
          >
            <button
              type="button"
              data-testid="lucide-browser-prev"
              className="lims-tab"
              disabled={page === 0}
              onClick={() => setPage((p) => Math.max(0, p - 1))}
            >
              &lt;
            </button>
            <span className="text-xs text-muted-foreground">
              {page + 1} / {totalPages}
            </span>
            <button
              type="button"
              data-testid="lucide-browser-next"
              className="lims-tab"
              disabled={page >= totalPages - 1}
              onClick={() =>
                setPage((p) => Math.min(totalPages - 1, p + 1))
              }
            >
              &gt;
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
