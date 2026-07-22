import { Clock } from "lucide-react";

/**
 * Placeholder card for Availability on the profile page.
 * Will be replaced with real data in a future phase.
 */
export function AvailabilitySection() {
  return (
    <section className="rounded-lg border border-border bg-panel p-5">
      <div className="mb-4 flex items-center gap-2">
        <Clock className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
        <h2 className="font-serif text-lg font-semibold tracking-tight">
          Availability
        </h2>
      </div>
      <p className="text-[13px] text-muted-foreground">
        Availability information not yet configured.
      </p>
    </section>
  );
}
