import { Dna, AlertTriangle } from "lucide-react";

interface AppErrorScreenProps {
  /** The error message to display. */
  message: string;
  /** Callback to retry loading (re-fetches /me/). */
  onRetry: () => void;
}

/**
 * Full-page error screen shown when the initial /me/ request fails with
 * a non-401 error (e.g. network failure, 500).
 *
 * Provides a "Try again" button and a link to /login as a fallback.
 */
export function AppErrorScreen({ message, onRetry }: AppErrorScreenProps) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="w-full max-w-sm rounded-lg border border-hairline bg-panel p-8">
        {/* Brand */}
        <div className="mb-6 flex flex-col items-center gap-2">
          <div className="grid h-10 w-10 place-items-center rounded-md bg-primary text-primary-foreground">
            <Dna className="h-5 w-5" aria-hidden="true" />
          </div>
          <h1 className="font-serif text-xl font-semibold tracking-tight">
            Helix
          </h1>
        </div>

        {/* Error state */}
        <div className="flex flex-col gap-4">
          <div className="flex items-start gap-2.5 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2.5">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" aria-hidden="true" />
            <p className="text-[13px] text-destructive">{message}</p>
          </div>

          <button
            type="button"
            onClick={onRetry}
            className="btn-primary rounded-md py-2 text-[13px] font-medium"
          >
            Try again
          </button>

          <a
            href="/login"
            className="text-center text-[13px] text-primary hover:underline"
          >
            Go to login
          </a>
        </div>
      </div>
    </div>
  );
}
