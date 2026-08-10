import {
  createContext,
  useContext,
  useState,
  useCallback,
  type ReactNode,
} from "react";
import type { ThemeMode } from "../shared/applyTheme";
import type { Theme } from "./themeStore";
import {
  getThemes,
  getActiveThemeId,
  getThemeForTheme,
  applyTheme as storeApplyTheme,
  saveCustomTheme as storeSaveCustomTheme,
  deleteCustomTheme as storeDeleteCustomTheme,
} from "./themeStore";

interface ThemeContextValue {
  activeThemeId: string;
  themes: Theme[];
  mode: ThemeMode;
  applyTheme: (id: string) => void;
  saveCustomTheme: (theme: Theme) => void;
  deleteCustomTheme: (id: string) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

function getModeForId(id: string): ThemeMode {
  const theme = getThemeForTheme(id);
  return theme?.mode ?? "light";
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const initialId = getActiveThemeId();
  const [activeThemeId, setActiveThemeId] = useState<string>(initialId);
  const [mode, setMode] = useState<ThemeMode>(() => getModeForId(initialId));

  const applyTheme = useCallback((id: string) => {
    storeApplyTheme(id);
    setActiveThemeId(id);
    setMode(getModeForId(id));
  }, []);

  const saveCustomTheme = useCallback(
    (theme: Theme) => {
      const id = storeSaveCustomTheme(theme);
      setActiveThemeId(id);
      setMode(getModeForId(id));
    },
    [],
  );

  const deleteCustomTheme = useCallback((id: string) => {
    storeDeleteCustomTheme(id);
    setActiveThemeId(getActiveThemeId());
    setMode(getModeForId(getActiveThemeId()));
  }, []);

  return (
    <ThemeContext.Provider
      value={{
        activeThemeId,
        themes: getThemes(),
        mode,
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
