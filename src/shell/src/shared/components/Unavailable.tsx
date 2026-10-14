import type { ReactNode } from "react";

export interface UnavailableProps {
  /** What kind of contribution is unavailable (route, block, workspace, ...). */
  kind: string;
  /** Optional stable identifier, useful when diagnosing persisted content. */
  name?: string;
  children?: ReactNode;
}

/** Consistent, non-fatal rendering for an absent mod contribution. */
export function Unavailable({ kind, name, children }: UnavailableProps) {
  return (
    <div
      className="flex min-h-[8rem] items-center justify-center rounded-lg border border-dashed border-hairline bg-surface p-6 text-center"
      data-testid="unavailable"
      data-unavailable-kind={kind}
    >
      <div>
        <p className="font-[var(--font-label)] text-sm font-medium text-foreground">
          {kind} unavailable
        </p>
        <p className="mt-1 text-sm text-muted-foreground">
          {children ?? (name ? `The contribution “${name}” belongs to a mod that is not installed.` : "The owning mod is not installed.")}
        </p>
      </div>
    </div>
  );
}

export default Unavailable;
