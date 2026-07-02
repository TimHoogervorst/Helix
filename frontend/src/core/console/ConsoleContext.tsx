import { createContext, useContext, useState, type ReactNode } from "react";
import type { ViewState, ConsoleContextValue } from "../types/console";

const ConsoleContext = createContext<ConsoleContextValue | null>(null);

export function ConsoleProvider({ children }: { children: ReactNode }) {
  const [viewState, setViewState] = useState<ViewState>("list");

  return (
    <ConsoleContext.Provider value={{ viewState, setViewState }}>
      {children}
    </ConsoleContext.Provider>
  );
}

export function useConsole(): ConsoleContextValue {
  const ctx = useContext(ConsoleContext);
  if (!ctx) {
    // Fallback when not wrapped in a provider — safe for non-console pages
    return { viewState: "list", setViewState: () => {} };
  }
  return ctx;
}
