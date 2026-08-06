import { BookOpen } from "lucide-react";

/**
 * Placeholder card for Notebook Activity.
 * Will be replaced with real data in a future phase.
 */
export function NotebookActivity() {
  return (
    <section className="rounded-lg border border-border bg-panel p-5">
      <div className="mb-4 flex items-center gap-2">
        <BookOpen className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
        <h2 className="font-[--font-label] text-lg font-semibold tracking-tight">
          Notebook activity
        </h2>
      </div>
      <p className="text-base text-muted-foreground">
        No recent notebook entries to display.
      </p>
    </section>
  );
}
