import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  type ReactNode,
} from "react";
import type { Theme } from "./themeStore";
import {
  getThemes,
  getActiveThemeId,
  applyTheme as storeApplyTheme,
  bootActiveTheme,
  saveCustomTheme as storeSaveCustomTheme,
  deleteCustomTheme as storeDeleteCustomTheme,
} from "./themeStore";

interface ThemeContextValue {
  activeThemeId: string;
  themes: Theme[];
  applyTheme: (id: string) => void;
  saveCustomTheme: (theme: Theme) => void;
  deleteCustomTheme: (id: string) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [activeThemeId, setActiveThemeId] = useState<string>(() =>
    getActiveThemeId(),
  );

  useEffect(() => {
    bootActiveTheme();
  }, []);

  const applyTheme = useCallback((id: string) => {
    storeApplyTheme(id);
    setActiveThemeId(id);
  }, []);

  const saveCustomTheme = useCallback(
    (theme: Theme) => {
      const id = storeSaveCustomTheme(theme);
      setActiveThemeId(id);
    },
    [],
  );

  const deleteCustomTheme = useCallback((id: string) => {
    storeDeleteCustomTheme(id);
    setActiveThemeId(getActiveThemeId());
  }, []);

  return (
    <ThemeContext.Provider
      value={{
        activeThemeId,
        themes: getThemes(),
        applyTheme,
        saveCustomTheme,
        deleteCustomTheme,
      }}
    >
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error("useTheme must be used within a ThemeProvider");
  }
  return ctx;
}
