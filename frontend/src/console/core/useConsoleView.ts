import { useState, useCallback, useEffect } from "react";
import type { ViewState } from "../../types/console";
import { useConsole } from "./ConsoleProvider";

export interface ConsoleViewState {
  /** Current view state. */
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
  /** Raw viewState setter that syncs to ConsoleProvider context. */
  updateViewState: (state: ViewState) => void;
}

/**
 * Shared View State machine hook for console pages (LIMS, Library).
 *
 * Each console page calls this once and wires the returned transition
 * functions to its row click handlers.  The hook syncs viewState to the
 * top-level ConsoleProvider so Layout can hide the search bar in Expanded
 * state.
 */
export function useConsoleView(): ConsoleViewState {
  const [viewState, setViewState] = useState<ViewState>("list");
  const [isExiting, setIsExiting] = useState(false);
  const [isDetailExiting, setIsDetailExiting] = useState(false);

  const { setViewState: setContextViewState } = useConsole();

  const updateViewState = useCallback(
    (state: ViewState) => {
      setViewState(state);
      setContextViewState(state);
    },
    [setContextViewState],
  );

  // Sync initial "list" state to context on mount so navigating between
  // console pages always resets the Layout nav bar.
  useEffect(() => {
    setContextViewState("list");
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const goToDetail = useCallback(() => {
    setIsExiting(false);
    setIsDetailExiting(false);
    updateViewState("detail");
  }, [updateViewState]);

  const goToExpanded = useCallback(() => {
    setIsExiting(false);
    setIsDetailExiting(false);
    updateViewState("expanded");
  }, [updateViewState]);

  const collapseFromExpanded = useCallback(() => {
    setIsExiting(true);
    setTimeout(() => {
      updateViewState("detail");
      setIsExiting(false);
    }, 250);
  }, [updateViewState]);

  const closeAll = useCallback(() => {
    if (viewState === "expanded") {
      setIsExiting(true);
      setTimeout(() => {
        updateViewState("list");
        setIsExiting(false);
      }, 250);
    } else if (viewState === "detail") {
      setIsDetailExiting(true);
      setTimeout(() => {
        updateViewState("list");
        setIsDetailExiting(false);
      }, 250);
    } else {
      updateViewState("list");
    }
  }, [viewState, updateViewState]);

  return {
    viewState,
    isExiting,
    isDetailExiting,
    goToDetail,
    goToExpanded,
    collapseFromExpanded,
    closeAll,
    updateViewState,
  };
}
