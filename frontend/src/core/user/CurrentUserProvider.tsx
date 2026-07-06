import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { fetchMe } from "./api";
import type { CurrentUser } from "./types";
import { LoadingScreen } from "./LoadingScreen";
import { AppErrorScreen } from "./AppErrorScreen";

// ── Context ────────────────────────────────────────────────────────────────

interface CurrentUserContextValue {
  user: CurrentUser | null;
  /** True while the initial /me/ request is in flight. */
  isChecking: boolean;
  /** Non-null if the /me/ request failed with a non-401 error. */
  error: string | null;
  /** Re-fetch the current user (e.g. after updating profile). */
  refresh: () => Promise<void>;
}

const CurrentUserContext = createContext<CurrentUserContextValue | null>(null);

// ── Provider ───────────────────────────────────────────────────────────────

interface CurrentUserProviderProps {
  children: ReactNode;
}

export function CurrentUserProvider({ children }: CurrentUserProviderProps) {
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [isChecking, setIsChecking] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = async () => {
    try {
      const me = await fetchMe();
      setUser(me);
      setError(null);
    } catch (err: unknown) {
      // Redirect on 401/403 — other errors (network, 500, etc.) show error UI
      if (
        err instanceof Error &&
        "status" in err &&
        ((err as { status: number }).status === 401 ||
          (err as { status: number }).status === 403)
      ) {
        setUser(null);
        // Silent redirect — don't redirect if already on login/register
        if (
          !window.location.pathname.startsWith("/login") &&
          !window.location.pathname.startsWith("/register")
        ) {
          window.location.href = "/login";
        }
      } else {
        setError(
          err instanceof Error ? err.message : "Failed to load user data.",
        );
      }
    } finally {
      setIsChecking(false);
    }
  };

  useEffect(() => {
    refresh();
  }, []);

  // ── Loading screen ──────────────────────────────────────────────────
  if (isChecking) {
    return <LoadingScreen />;
  }

  // ── Network / server error screen with retry ────────────────────────
  if (error) {
    return <AppErrorScreen message={error} onRetry={refresh} />;
  }

  return (
    <CurrentUserContext.Provider value={{ user, isChecking, error, refresh }}>
      {children}
    </CurrentUserContext.Provider>
  );
}

// ── Hook ───────────────────────────────────────────────────────────────────

export function useCurrentUser(): CurrentUserContextValue {
  const ctx = useContext(CurrentUserContext);
  if (!ctx) {
    throw new Error(
      "useCurrentUser must be used inside <CurrentUserProvider>.",
    );
  }
  return ctx;
}
