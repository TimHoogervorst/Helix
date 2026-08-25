import {
  createContext,
  useContext,
  useState,
  useCallback,
  useMemo,
  useEffect,
  type ReactNode,
} from "react";

// ── Context value ──────────────────────────────────────────────────────────

export interface SidebarContextValue {
  /** Whether the sidebar itself is collapsed. */
  isCollapsed: boolean;
  /** Toggle the sidebar collapse state. */
  toggleSidebar: () => void;
  /** Read-only set of currently collapsed section IDs. */
  collapsedSections: ReadonlySet<string>;
  /** Toggle the collapse state of a single section by ID. */
  toggleSection: (id: string) => void;
  /** Returns true when the section with the given ID is collapsed. */
  isSectionCollapsed: (id: string) => boolean;
}

const SidebarContext = createContext<SidebarContextValue | null>(null);

// ── Provider ───────────────────────────────────────────────────────────────

export interface SidebarProviderProps {
  children: ReactNode;
}

/**
 * Holds sidebar collapse state — both sidebar-level (`isCollapsed`) and
 * section-level (`collapsedSections`).
 *
 * The two dimensions are independent: toggling the sidebar does not modify
 * section collapse state, and toggling a section does not modify sidebar
 * collapse state.
 *
 * Each sidebar should be wrapped in its own provider so multiple sidebars
 * do not interfere with one another.
 */
export function SidebarProvider({ children }: SidebarProviderProps) {
  const [manuallyCollapsed, setManuallyCollapsed] = useState(false);
  const [isBelowLg, setIsBelowLg] = useState(() =>
    typeof window !== "undefined" && typeof window.matchMedia === "function"
      ? window.matchMedia("(max-width: 1023px)").matches
      : false,
  );
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(
    new Set(),
  );

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
      return;
    }

    const mediaQuery = window.matchMedia("(max-width: 1023px)");
    const handleChange = (event: MediaQueryListEvent) => {
      setIsBelowLg(event.matches);
    };

    mediaQuery.addEventListener("change", handleChange);
    return () => mediaQuery.removeEventListener("change", handleChange);
  }, []);

  const toggleSidebar = useCallback(() => {
    if (!isBelowLg) {
      setManuallyCollapsed((prev) => !prev);
    }
  }, [isBelowLg]);

  const toggleSection = useCallback((id: string) => {
    setCollapsedSections((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const isSectionCollapsed = useCallback(
    (id: string) => collapsedSections.has(id),
    [collapsedSections],
  );

  const value = useMemo<SidebarContextValue>(
    () => ({
      isCollapsed: isBelowLg || manuallyCollapsed,
      toggleSidebar,
      collapsedSections,
      toggleSection,
      isSectionCollapsed,
    }),
    [isBelowLg, manuallyCollapsed, toggleSidebar, collapsedSections, toggleSection, isSectionCollapsed],
  );

  return (
    <SidebarContext.Provider value={value}>
      {children}
    </SidebarContext.Provider>
  );
}

// ── Hook ───────────────────────────────────────────────────────────────────

/**
 * Access the sidebar collapse state and toggle methods.
 *
 * Must be used inside a `<SidebarProvider>`.  Throws if no provider is found
 * in the component tree.
 */
export function useSidebar(): SidebarContextValue {
  const ctx = useContext(SidebarContext);
  if (!ctx) {
    throw new Error("useSidebar must be used inside <SidebarProvider>.");
  }
  return ctx;
}
