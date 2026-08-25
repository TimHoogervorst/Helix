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
import { getTabs, getTabFolders, createTab, deleteTab, putTabLayout, resolveWorkspace, updateTabLabel, createTabFolder, updateTabFolder, deleteTabFolder } from "../api";
import type { PinnedWorkspace, CurrentWorkspace, TabFolder, TabLayout } from "../types";
import { resolveCurrentWorkspace } from "../../../shell/src/mod-system/resolveCurrentWorkspace";
import { moveLayoutItem, reorderRootTabs, type LayoutDropTarget } from "../layoutTransition";

// ── Hook ────────────────────────────────────────────────────────────────────

export interface UsePinnedWorkspacesReturn {
  pins: PinnedWorkspace[];
  folders: TabFolder[];
  current: CurrentWorkspace | null;
  pin: () => Promise<void>;
  unpin: (id: number) => Promise<void>;
  reorder: (activeId: number, overId: number) => Promise<void>;
  move: (activeId: number, target: number | "root" | `folder:${number}` | LayoutDropTarget) => Promise<void>;
  createFolder: (name: string) => Promise<TabFolder | null>;
  renameFolder: (id: number, name: string) => Promise<void>;
  removeFolder: (id: number) => Promise<void>;
  toggleFolder: (id: number) => Promise<void>;
  loading: boolean;
}

export function usePinnedWorkspaces(): UsePinnedWorkspacesReturn {
  const [pins, setPins] = useState<PinnedWorkspace[]>([]);
  const [folders, setFolders] = useState<TabFolder[]>([]);
  const [loading, setLoading] = useState(true);
  const location = useLocation();
  const pinsRef = useRef(pins);
  pinsRef.current = pins;

  const current = resolveCurrentWorkspace(location.pathname);

  // ── Fetch tabs on mount ────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    const refresh = () => Promise.all([getTabs(), getTabFolders()])
      .then(([data, folderData]) => {
        if (!cancelled) {
          setPins(data);
          setFolders(folderData);
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

  const reorder = useCallback(async (activeId: number, overId: number) => {
    const rootPins = pins.filter((pin) => pin.folder == null);
    const reorderedRoots = reorderRootTabs(rootPins, activeId, overId);
    if (reorderedRoots === rootPins) return;

    const reordered = [
      ...reorderedRoots,
      ...pins.filter((pin) => pin.folder != null),
    ];
    setPins(reordered);

    try {
      const layout: TabLayout = {
        folders: folders.map((folder) => ({
          id: folder.id,
          order: folder.order,
          expanded: folder.expanded,
          tab_ids: reordered.filter((pin) => pin.folder === folder.id).map((pin) => pin.id),
        })),
        tabs: reordered.map((pin, order) => ({
          id: pin.id,
          order,
          folder: pin.folder ?? null,
        })),
      };
      const response = await putTabLayout(layout);
      setPins(response.tabs);
    } catch {
      setPins(pins);
    }
  }, [pins, folders]);

  const persist = useCallback(async (nextPins: PinnedWorkspace[], nextFolders: TabFolder[]) => {
    const layoutItems = [
      ...nextFolders.map((folder) => ({ kind: "folder" as const, id: folder.id, order: folder.order })),
      ...nextPins.map((pin) => ({ kind: "tab" as const, id: pin.id, folder: pin.folder ?? null, order: pin.order ?? 0 })),
    ].sort((a, b) => a.order - b.order);
    const orderById = new Map(layoutItems.map((item, order) => [item.kind + item.id, order]));
    const response = await putTabLayout({
      folders: nextFolders.map((folder) => ({ id: folder.id, order: orderById.get("folder" + folder.id) ?? 0, expanded: folder.expanded, tab_ids: nextPins.filter((pin) => pin.folder === folder.id).sort((a, b) => (a.order ?? 0) - (b.order ?? 0)).map((pin) => pin.id) })),
      tabs: nextPins.map((pin) => ({ id: pin.id, order: orderById.get("tab" + pin.id) ?? 0, folder: pin.folder ?? null })),
    });
    setPins(response.tabs);
    setFolders(response.folders);
  }, []);

  const move = useCallback(async (activeId: number, overId: number | "root" | `folder:${number}` | LayoutDropTarget) => {
    const flat = [...folders.map((folder) => ({ kind: "folder" as const, id: folder.id, order: folder.order })), ...pins.map((pin) => ({ kind: "tab" as const, id: pin.id, folder: pin.folder ?? null, order: pin.order ?? 0 }))].sort((a, b) => a.order - b.order).map(({ order: _order, ...item }) => item);
    const target: LayoutDropTarget = typeof overId === "number" ? { kind: "tab", id: overId } : typeof overId === "object" ? overId : overId === "root" ? { kind: "top-edge", position: "after" } : { kind: "folder", id: Number(overId.slice(7)) };
    const next = moveLayoutItem(flat, activeId, target);
    if (next === flat) return;
    const folderById = new Map(folders.map((folder) => [folder.id, folder]));
    const nextFolders = next.filter((item): item is { kind: "folder"; id: number } => item.kind === "folder").map((item) => ({ ...folderById.get(item.id)!, order: next.indexOf(item) }));
    const nextPins = next.filter((item): item is { kind: "tab"; id: number; folder: number | null } => item.kind === "tab").map((item) => ({ ...pins.find((pin) => pin.id === item.id)!, folder: item.folder, order: next.indexOf(item) }));
    setPins(nextPins);
    setFolders(nextFolders);
    try { await persist(nextPins, nextFolders); } catch { setPins(pins); setFolders(folders); }
  }, [folders, pins, persist]);

  const createFolder = useCallback(async (name: string) => {
    try { const folder = await createTabFolder(name); setFolders((prev) => [...prev, folder]); return folder; } catch { return null; }
  }, []);
  const renameFolder = useCallback(async (id: number, name: string) => {
    try {
      const folder = await updateTabFolder(id, { name });
      setFolders((prev) => prev.map((item) => item.id === id ? folder : item));
    } catch {
      // Keep the existing name when the server rejects the edit.
    }
  }, []);
  const removeFolder = useCallback(async (id: number) => {
    try {
      await deleteTabFolder(id);
      setFolders((prev) => prev.filter((folder) => folder.id !== id));
      setPins((prev) => prev.filter((pin) => pin.folder !== id));
    } catch {
      // Keep the folder and its tabs when deletion fails.
    }
  }, []);
  const toggleFolder = useCallback(async (id: number) => {
    const folder = folders.find((item) => item.id === id);
    if (!folder) return;
    const next = { ...folder, expanded: !folder.expanded };
    setFolders((prev) => prev.map((item) => item.id === id ? next : item));
    try { await updateTabFolder(id, { expanded: next.expanded }); } catch { setFolders(folders); }
  }, [folders]);

  return { pins, folders, current, pin, unpin, reorder, move, createFolder, renameFolder, removeFolder, toggleFolder, loading };
}
