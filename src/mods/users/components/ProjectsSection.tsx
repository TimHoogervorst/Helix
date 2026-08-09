import { FolderKanban } from "lucide-react";

/**
 * Placeholder card for Projects on the profile page.
 * Will be replaced with real data in a future phase.
 */
export function ProjectsSection() {
  return (
    <section className="rounded-lg border border-border bg-card p-5">
      <div className="mb-4 flex items-center gap-2">
        <FolderKanban
          className="h-4 w-4 text-muted-foreground"
          aria-hidden="true"
        />
        <h2 className="font-[--font-label] text-lg font-semibold tracking-tight">
          Projects
        </h2>
      </div>
      <p className="text-base text-muted-foreground">
        No projects to display yet.
      </p>
    </section>
  );
}
