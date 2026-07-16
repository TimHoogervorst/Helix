/**
 * usePinnedWorkspaces — manages the sidebar's pinned workspace bookmarks.
 *
 * Fetches pins from GET /api/core/pins/ on mount, exposes pin() and unpin()
 * with optimistic updates, and derives the current workspace from the URL.
 *
 * Only the sidebar consumes this hook. If future components need it, the
 * hook can be lifted to React Context.
 */
import { useState, useEffect, useCallback } from "react";
import { useLocation } from "react-router-dom";
import { getPins, createPin, deletePin } from "../api";
import type { PinnedWorkspace, CurrentWorkspace } from "../types";
import { resolveCurrentWorkspace } from "../../../shell/src/mod-system/resolveCurrentWorkspace";

// ── Hook ────────────────────────────────────────────────────────────────────

export interface UsePinnedWorkspacesReturn {
  pins: PinnedWorkspace[];
  current: CurrentWorkspace | null;
  pin: () => Promise<void>;
  unpin: (id: number) => Promise<void>;
  loading: boolean;
}

export function usePinnedWorkspaces(): UsePinnedWorkspacesReturn {
  const [pins, setPins] = useState<PinnedWorkspace[]>([]);
  const [loading, setLoading] = useState(true);
  const location = useLocation();

  const current = resolveCurrentWorkspace(location.pathname);

  // ── Fetch pins on mount ────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    getPins()
      .then((data) => {
        if (!cancelled) {
          setPins(data);
          setLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // ── Pin the current workspace ──────────────────────────────────────────
  const pin = useCallback(async () => {
    if (!current) return;

    // Check if already pinned (belt-and-suspenders)
    const alreadyPinned = pins.some((p) => p.url === current.url);
    if (alreadyPinned) return;

    // No label available from the URL alone — the user can edit the label
    // later, or the pin can be created from a context that provides a name.
    const label = "";

    // Build an optimistic pin
    const optimistic: PinnedWorkspace = {
      id: -Date.now(), // temporary negative id
      display_id: current.displayId,
      label,
      url: current.url,
      created_at: new Date().toISOString(),
    };

    setPins((prev) => [optimistic, ...prev]);

    try {
      const created = await createPin({
        display_id: current.displayId,
        label,
        url: current.url,
      });
      // Replace optimistic pin with server response
      setPins((prev) => prev.map((p) => (p.id === optimistic.id ? created : p)));
    } catch {
      // Rollback on error
      setPins((prev) => prev.filter((p) => p.id !== optimistic.id));
    }
  }, [current, pins]);

  // ── Unpin a workspace ──────────────────────────────────────────────────
  const unpin = useCallback(async (id: number) => {
    const removed = pins.find((p) => p.id === id);
    if (!removed) return;

    setPins((prev) => prev.filter((p) => p.id !== id));

    try {
      await deletePin(id);
    } catch {
      // Rollback on error
      setPins((prev) => {
        // Put it back in its original position (newest first)
        return [...prev, removed].sort(
          (a, b) =>
            new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
        );
      });
    }
  }, [pins]);

  return { pins, current, pin, unpin, loading };
}
