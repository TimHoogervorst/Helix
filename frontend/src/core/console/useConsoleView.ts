import { useState, useCallback, useEffect } from "react";
import type { ViewState } from "../types/console";
import { useConsole } from "./ConsoleContext";

export interface ConsoleViewState {
  /** Current view state (from ConsoleProvider — single source of truth). */
  viewState: ViewState;
  /** True while the Workspace panel plays its exit animation. */
  isExiting: boolean;
  /** True while the Detail panel plays its exit animation. */
  isDetailExiting: boolean;
  /** Transition to detail view. */
  goToDetail: () => void;
  /** Transition to expanded (Workspace) view. */
  goToExpanded: () => void;
  /** Expanded → Detail with exit animation. */
  collapseFromExpanded: () => void;
  /** Return to list view, with appropriate exit animations. */
  closeAll: () => void;
  /** Raw viewState setter — writes directly to ConsoleProvider context. */
  updateViewState: (state: ViewState) => void;
}

/**
 * Shared View State machine hook for console pages (LIMS, Library).
 *
 * Each console page calls this once and wires the returned transition
 * functions to its row click handlers.  The hook reads viewState from the
 * top-level ConsoleProvider (single source of truth) so Layout and other
 * context consumers always see the same state.  Animation flags (isExiting,
 * isDetailExiting) are kept local because they are transient UI state scoped
 * to panel transitions.
 */
export function useConsoleView(): ConsoleViewState {
  const { viewState, setViewState } = useConsole();
  const [isExiting, setIsExiting] = useState(false);
  const [isDetailExiting, setIsDetailExiting] = useState(false);

  // Reset context to "list" on mount so navigating between console pages
  // always starts fresh (e.g. Layout shows the search bar).
  useEffect(() => {
    setViewState("list");
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const goToDetail = useCallback(() => {
    setIsExiting(false);
    setIsDetailExiting(false);
    setViewState("detail");
  }, [setViewState]);

  const goToExpanded = useCallback(() => {
    setIsExiting(false);
    setIsDetailExiting(false);
    setViewState("expanded");
  }, [setViewState]);

  const collapseFromExpanded = useCallback(() => {
    setIsExiting(true);
    setTimeout(() => {
      setViewState("detail");
      setIsExiting(false);
    }, 250);
  }, [setViewState]);

  const closeAll = useCallback(() => {
    if (viewState === "expanded") {
      setIsExiting(true);
      setTimeout(() => {
        setViewState("list");
        setIsExiting(false);
      }, 250);
    } else if (viewState === "detail") {
      setIsDetailExiting(true);
      setTimeout(() => {
        setViewState("list");
        setIsDetailExiting(false);
      }, 250);
    } else {
      setViewState("list");
    }
  }, [viewState, setViewState]);

  return {
    viewState,
    isExiting,
    isDetailExiting,
    goToDetail,
    goToExpanded,
    collapseFromExpanded,
    closeAll,
    updateViewState: setViewState,
  };
}
