import { Activity } from "lucide-react";

/**
 * Placeholder card for Recent Activity on the profile page.
 * Will be replaced with real data in a future phase.
 */
export function RecentActivity() {
  return (
    <section className="rounded-lg border border-border bg-panel p-5">
      <div className="mb-4 flex items-center gap-2">
        <Activity className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
        <h2 className="font-[--font-label] text-lg font-semibold tracking-tight">
          Recent activity
        </h2>
      </div>
      <p className="text-base text-muted-foreground">
        No recent activity to display yet.
      </p>
    </section>
  );
}
