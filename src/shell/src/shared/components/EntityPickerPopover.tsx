/**
 * Shared entity picker popover — extracted from ReferenceCell.
 *
 * Renders a portaled search popover that queries the entity hub registry
 * endpoint.  Supports schema-scoped searches (when `referenceSchemaId` is
 * set) and open / un-scoped searches (when it is not).
 *
 * Both ReferenceCell, the filter bar ValueInput, and UserCell will use this
 * component.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Loader } from "lucide-react";
import { useClickOutside } from "../hooks/useClickOutside";
import { get } from "../../api/client";

// ── Types ─────────────────────────────────────────────────────────────────

/** A single entity result returned by the registry search endpoint. */
export interface EntitySearchResult {
  display_id: string;
  name: string;
  icon: string;
  color: string;
  schema_name: string;
  workspace_id: string;
}

export interface EntityPickerPopoverProps {
  /** When set, scopes the search to entities of the given Schema PK. */
  referenceSchemaId?: number;
  /** The workspace the consuming cell belongs to (metadata only). */
  workspaceId?: string;
  /** Whether the popover is visible. */
  open: boolean;
  /** Called when the popover should close. */
  onOpenChange: (open: boolean) => void;
  /** Called with the selected entity's display_id. */
  onSelect: (displayId: string) => void;
  /** Called when the user clears the reference (optional — omit to hide the clear row). */
  onClear?: () => void;
}

// ── Component ────────────────────────────────────────────────────────────

export function EntityPickerPopover({
  referenceSchemaId,
  open,
  onOpenChange,
  onSelect,
  onClear,
}: EntityPickerPopoverProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<EntitySearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useClickOutside(popoverRef, () => onOpenChange(false), open);

  // ── Focus input & reset state when popover opens ──────────────────────
  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 50);
      setQuery("");
      setResults([]);
    }
  }, [open]);

  // ── Search entities as user types ─────────────────────────────────────
  const handleSearch = useCallback(
    async (q: string) => {
      setQuery(q);
      if (q.trim().length < 1) {
        setResults([]);
        return;
      }
      setLoading(true);
      try {
        const params = new URLSearchParams();
        params.set("search", q);
        params.set("size", "10");
        if (referenceSchemaId !== undefined) {
          params.set("schema", String(referenceSchemaId));
        }
        const qs = params.toString();
        const data = await get<{ results: EntitySearchResult[] }>(
          `/registry/entities/?${qs}`,
        );
        setResults(data.results.slice(0, 10));
      } catch {
        setResults([]);
      } finally {
        setLoading(false);
      }
    },
    [referenceSchemaId],
  );

  // ── Select an entity ──────────────────────────────────────────────────
  const handleSelect = useCallback(
    (displayId: string) => {
      onSelect(displayId);
      onOpenChange(false);
    },
    [onSelect, onOpenChange],
  );

  if (!open) return null;

  return createPortal(
    <div
      ref={popoverRef}
      className="z-50 w-72 rounded-md border border-hairline bg-popover shadow-lg"
      style={{ position: "fixed" }}
      data-testid="ref-popover"
    >
      <div className="p-2 border-b border-hairline">
        <input
          ref={inputRef}
          type="text"
          className="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          placeholder="Search entities…"
          value={query}
          onChange={(e) => handleSearch(e.target.value)}
          data-testid="ref-search-input"
        />
      </div>
      <div className="max-h-48 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center gap-2 px-3 py-4 text-sm text-muted-foreground">
            <Loader className="h-4 w-4 animate-spin" />
            Searching…
          </div>
        ) : results.length === 0 ? (
          <div className="px-3 py-4 text-sm text-muted-foreground">
            {query.length > 0
              ? "No entities found."
              : "Type to search entities."}
          </div>
        ) : (
          results.map((r) => (
            <button
              key={r.display_id}
              type="button"
              className="w-full px-3 py-2 text-left text-sm hover:bg-surface/60 transition-colors first:rounded-t-md last:rounded-b-md"
              onClick={() => handleSelect(r.display_id)}
              data-testid={`ref-result-${r.display_id}`}
            >
              <span className="font-medium">{r.display_id}</span>
              {r.name && (
                <span className="ml-2 text-xs text-muted-foreground">
                  {r.name}
                </span>
              )}
            </button>
          ))
        )}
      </div>
      {onClear && (
        <div className="border-t border-hairline p-1">
          <button
            type="button"
            className="w-full text-left px-2 py-1 text-xs text-destructive hover:bg-surface/60 rounded"
            onClick={() => {
              onClear();
              onOpenChange(false);
            }}
            data-testid="ref-clear-option"
          >
            Clear reference
          </button>
        </div>
      )}
    </div>,
    document.body,
  );
}
