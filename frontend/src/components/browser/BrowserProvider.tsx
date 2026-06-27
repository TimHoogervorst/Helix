import { createContext, useContext, useState, type ReactNode } from "react";
import type { ViewState, BrowserContextValue } from "../../types/browser";

const BrowserContext = createContext<BrowserContextValue | null>(null);

export function BrowserProvider({ children }: { children: ReactNode }) {
  const [viewState, setViewState] = useState<ViewState>("list");

  return (
    <BrowserContext.Provider value={{ viewState, setViewState }}>
      {children}
    </BrowserContext.Provider>
  );
}

export function useBrowser(): BrowserContextValue {
  const ctx = useContext(BrowserContext);
  if (!ctx) {
    // Fallback when not wrapped in a provider — safe for non-browser pages
    return { viewState: "list", setViewState: () => {} };
  }
  return ctx;
}
