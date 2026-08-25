import { useCallback, useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { resolveWorkspace } from "../api";
import { resolveCurrentWorkspace } from "../../../shell/src/mod-system/resolveCurrentWorkspace";

const STORAGE_KEY = "helix-workspace-history";
const MAX_HISTORY_ITEMS = 20;

export interface WorkspaceHistoryItem {
  displayId: string;
  name: string;
  url: string;
  icon: string;
}

function readHistory(): WorkspaceHistoryItem[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return [];
    const parsed: unknown = JSON.parse(stored);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (item): item is WorkspaceHistoryItem =>
        typeof item === "object" &&
        item !== null &&
        typeof item.displayId === "string" &&
        typeof item.name === "string" &&
        typeof item.url === "string" &&
        typeof item.icon === "string",
    ).slice(0, MAX_HISTORY_ITEMS);
  } catch {
    return [];
  }
}

function writeHistory(items: WorkspaceHistoryItem[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  } catch {
    // Storage may be unavailable in privacy mode.
  }
}

function addToHistory(
  items: WorkspaceHistoryItem[],
  item: WorkspaceHistoryItem,
): WorkspaceHistoryItem[] {
  return [item, ...items.filter((entry) => entry.url !== item.url)].slice(
    0,
    MAX_HISTORY_ITEMS,
  );
}

export function useWorkspaceHistory() {
  const [history, setHistory] = useState<WorkspaceHistoryItem[]>(readHistory);
  const location = useLocation();
  const current = resolveCurrentWorkspace(location.pathname);

  useEffect(() => {
    if (!current) return;

    setHistory((previous) => {
      const url = `${location.pathname}${location.search}${location.hash}`;
      const existing = previous.find((item) => item.url === url);
      const fallback: WorkspaceHistoryItem = {
        displayId: current.displayId,
        name: existing?.name || current.displayId,
        url,
        icon: existing?.icon || current.icon,
      };
      const next = addToHistory(previous, fallback);
      writeHistory(next);
      return next;
    });

    let cancelled = false;
    resolveWorkspace(current.displayId)
      .then((resolved) => {
        if (cancelled || !resolved) return;
        setHistory((previous) => {
          const next = previous.map((item) =>
            item.url === `${location.pathname}${location.search}${location.hash}`
              ? {
                  ...item,
                  name: resolved.title || item.displayId,
                  icon: resolved.icon || item.icon,
                }
              : item,
          );
          writeHistory(next);
          return next;
        });
      })
      .catch(() => {
        // Resolution is best-effort; the display ID remains usable.
      });

    return () => {
      cancelled = true;
    };
  }, [current?.displayId, current?.url, current?.icon, location.search, location.hash]);

  const remove = useCallback((url: string) => {
    setHistory((previous) => {
      const currentUrl = `${location.pathname}${location.search}${location.hash}`;
      const next = previous.filter((item) => item.url !== url);
      if (url === currentUrl) {
        const currentItem = previous.find((item) => item.url === url);
        if (currentItem) next.unshift(currentItem);
      }
      writeHistory(next);
      return next;
    });
  }, [location.hash, location.pathname, location.search]);

  return { history, remove };
}
