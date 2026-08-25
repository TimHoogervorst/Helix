/**
 * usePinnedWorkspaces — manages the sidebar's pinned workspace bookmarks.
 *
 * Fetches tabs from GET /api/core/tabs/ on mount, exposes pin() and unpin()
 * with optimistic updates, and derives the current workspace from the URL.
 *
 * Only the sidebar consumes this hook. If future components need it, the
 * hook can be lifted to React Context.
 */
import { useState, useEffect, useCallback, useRef } from "react";
import { useLocation } from "react-router-dom";
import { getTabs, createTab, deleteTab, resolveWorkspace, updateTabLabel } from "../api";
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
  const pinsRef = useRef(pins);
  pinsRef.current = pins;

  const current = resolveCurrentWorkspace(location.pathname);

  // ── Fetch tabs on mount ────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    const refresh = () => getTabs()
      .then((data) => {
        if (!cancelled) {
          setPins(data);
          setLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) setLoading(false);
      });
    refresh();
    window.addEventListener("helix-tabs-changed", refresh);
    return () => {
      cancelled = true;
      window.removeEventListener("helix-tabs-changed", refresh);
    };
  }, []);

  // Refresh the stored snapshot label whenever a workspace is visited.
  useEffect(() => {
    if (!current || loading) return;
    let cancelled = false;

    resolveWorkspace(current.displayId)
      .then((resolved) => {
        if (cancelled || !resolved) return;
        const label = resolved.title || "";
        const matching = pinsRef.current.find((pin) => pin.url === current.url);
        if (!matching || matching.label === label) return;

        return updateTabLabel(matching.id, label).then((updated) => {
          if (!cancelled) {
            setPins((previous) =>
              previous.map((pin) => (pin.id === updated.id ? updated : pin)),
            );
          }
        });
      })
      .catch(() => {
        // Resolution is best-effort; the display ID remains usable.
      });

    return () => {
      cancelled = true;
    };
  }, [current?.displayId, current?.url, loading]);

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
      icon: "",
      color: "",
      created_at: new Date().toISOString(),
    };

    setPins((prev) => [optimistic, ...prev]);

    try {
      const created = await createTab({
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
      await deleteTab(id);
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
