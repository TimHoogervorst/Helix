import { FlaskConical, FileText, Thermometer, AlertTriangle } from "lucide-react";
import { useCurrentUser } from "../../shell/src/user/CurrentUserProvider";

// ── Decorative Header ────────────────────────────────────────────────────────

/**
 * Thin decorative bar with a bottom border at the top of the content area.
 * Purely visual — no text or interactive elements.
 */
function DecorativeHeader() {
  return <div className="h-1.5 border-b border-hairline" aria-hidden="true" />;
}

// ── Greeting Section ─────────────────────────────────────────────────────────

/** Placeholder subtitle shown below the greeting. */
const GREETING_SUBTITLE = "Here's what's happening in your lab today.";

/**
 * Full-viewport-width greeting section with a grid-paper background.
 * Greets the current user by first name, styled in italic primary color.
 */
function GreetingSection() {
  const { user } = useCurrentUser();
  const firstName = user?.first_name ?? "there";

  return (
    <section className="grid-paper w-full px-6 py-12">
      <div className="mx-auto max-w-4xl">
        <h2 className="font-serif text-2xl font-semibold tracking-tight">
          Good morning,{" "}
          <span className="italic text-primary">{firstName}</span>
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">
          {GREETING_SUBTITLE}
        </p>
      </div>
    </section>
  );
}

// ── Stats Bar ────────────────────────────────────────────────────────────────

interface StatTileData {
  icon: React.ReactNode;
  label: string;
  value: string;
  subtitle: string;
}

/** Hardcoded placeholder metrics for the stats bar. */
const STAT_TILES: StatTileData[] = [
  {
    icon: <FlaskConical className="h-4 w-4" aria-hidden="true" />,
    label: "Experiments running",
    value: "3",
    subtitle: "Across 2 labs",
  },
  {
    icon: <FileText className="h-4 w-4" aria-hidden="true" />,
    label: "Entries this week",
    value: "12",
    subtitle: "Last 7 days",
  },
  {
    icon: <Thermometer className="h-4 w-4" aria-hidden="true" />,
    label: "Freezer",
    value: "−79.4 °C",
    subtitle: "All systems normal",
  },
  {
    icon: <AlertTriangle className="h-4 w-4" aria-hidden="true" />,
    label: "Reagents low",
    value: "2",
    subtitle: "Reorder soon",
  },
];

/**
 * A single stat tile with icon, uppercase label, large serif value, and mono subtitle.
 */
function StatTile({ icon, label, value, subtitle }: StatTileData) {
  return (
    <div className="flex flex-col items-start gap-1.5 rounded-lg border border-hairline bg-background p-4">
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
function StatsBar() {
  return (
    <section className="px-6 py-8">
      <div className="mx-auto max-w-4xl">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {STAT_TILES.map((tile) => (
            <StatTile key={tile.label} {...tile} />
          ))}
        </div>
      </div>
    </section>
  );
}

// ── HomePage ─────────────────────────────────────────────────────────────────

/**
 * HomePage — the Home hub dashboard.
 *
 * Composed of three visible sections:
 *  1. Decorative header (thin bar with bottom border)
 *  2. Greeting section (grid-paper background, greets user by first name)
 *  3. Stats bar (4-column grid of placeholder metrics)
 */
function HomePage() {
  return (
    <div className="flex flex-col">
      <DecorativeHeader />
      <GreetingSection />
      <StatsBar />
    </div>
  );
}

export default HomePage;
