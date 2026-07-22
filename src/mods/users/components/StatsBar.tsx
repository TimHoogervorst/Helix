import { FlaskConical, FileText, Thermometer, Users } from "lucide-react";

interface StatTileData {
  icon: React.ReactNode;
  label: string;
  value: string;
  subtitle: string;
}

/** Hardcoded placeholder metrics for the profile stats bar. */
const STAT_TILES: StatTileData[] = [
  {
    icon: <FlaskConical className="h-4 w-4" aria-hidden="true" />,
    label: "Experiments",
    value: "7",
    subtitle: "Across 3 projects",
  },
  {
    icon: <FileText className="h-4 w-4" aria-hidden="true" />,
    label: "Publications",
    value: "12",
    subtitle: "Last updated Jun 2026",
  },
  {
    icon: <Thermometer className="h-4 w-4" aria-hidden="true" />,
    label: "Notebook entries",
    value: "143",
    subtitle: "Last 30 days",
  },
  {
    icon: <Users className="h-4 w-4" aria-hidden="true" />,
    label: "Collaborators",
    value: "8",
    subtitle: "Across 4 labs",
  },
];

/**
 * A single stat tile matching the HomePage StatsBar card style.
 */
function StatTile({ icon, label, value, subtitle }: StatTileData) {
  return (
    <div className="flex flex-col items-start gap-1.5 bg-card px-5 py-3">
      <span className="text-muted-foreground">{icon}</span>
      <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </span>
      <span className="font-serif text-2xl font-semibold tracking-tight text-foreground">
        {value}
      </span>
      <span className="font-mono text-[11px] text-muted-foreground">
        {subtitle}
      </span>
    </div>
  );
}

/**
 * A 4-column grid of stat tiles with hardcoded placeholder metrics.
 */
export function StatsBar() {
  return (
    <section className="border-b border-hairline bg-surface">
      <div className="mx-auto max-w-6xl">
        <div className="grid grid-cols-1 gap-px overflow-hidden sm:grid-cols-2 lg:grid-cols-4">
          {STAT_TILES.map((tile) => (
            <StatTile key={tile.label} {...tile} />
          ))}
        </div>
      </div>
    </section>
  );
}
