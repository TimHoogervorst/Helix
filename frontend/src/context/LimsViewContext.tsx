import { createContext, useContext, useState, type ReactNode } from "react";
import type { ViewState } from "../types/lims";

interface LimsViewContextValue {
  viewState: ViewState;
  setViewState: (state: ViewState) => void;
}

const LimsViewContext = createContext<LimsViewContextValue | null>(null);

export function LimsViewProvider({ children }: { children: ReactNode }) {
  const [viewState, setViewState] = useState<ViewState>("list");

  return (
    <LimsViewContext.Provider value={{ viewState, setViewState }}>
      {children}
    </LimsViewContext.Provider>
  );
}

export function useLimsView(): LimsViewContextValue {
  const ctx = useContext(LimsViewContext);
  if (!ctx) {
    // Fallback when not wrapped in a provider — safe for non-LIMS pages
    return { viewState: "list", setViewState: () => {} };
  }
  return ctx;
}
