import { createContext, useContext, useState, type ReactNode } from "react";
import type { ViewState } from "../types/lims";

interface LibraryViewContextValue {
  viewState: ViewState;
  setViewState: (state: ViewState) => void;
}

const LibraryViewContext = createContext<LibraryViewContextValue | null>(null);

export function LibraryViewProvider({ children }: { children: ReactNode }) {
  const [viewState, setViewState] = useState<ViewState>("list");

  return (
    <LibraryViewContext.Provider value={{ viewState, setViewState }}>
      {children}
    </LibraryViewContext.Provider>
  );
}

export function useLibraryView(): LibraryViewContextValue {
  const ctx = useContext(LibraryViewContext);
  if (!ctx) {
    return { viewState: "list", setViewState: () => {} };
  }
  return ctx;
}
