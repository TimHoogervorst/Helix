import { Dna } from "lucide-react";

/**
 * Full-page branded loading screen shown while the CurrentUserProvider
 * is checking the user's session (/me/ request in flight).
 *
 * Matches the brand styling used in LoginPage and RegisterPage so the
 * transition from loading → login/register feels seamless.
 */
export function LoadingScreen() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="w-full max-w-sm rounded-lg border border-hairline bg-panel p-8">
        <div className="flex flex-col items-center gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-md bg-primary text-primary-foreground">
            <Dna className="h-5 w-5 animate-pulse" aria-hidden="true" />
          </div>
          <h1 className="font-[var(--font-label)] text-xl font-semibold tracking-tight">
            Helix
          </h1>
          <p className="text-base text-muted-foreground">Loading…</p>
        </div>
      </div>
    </div>
  );
}
