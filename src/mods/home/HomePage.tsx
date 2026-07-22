import {
  FlaskConical,
  FileText,
  Thermometer,
  AlertTriangle,
  ArrowRight,
  Beaker,
} from "lucide-react";
import { Link } from "react-router-dom";
import { useCurrentUser } from "../../shell/src/user/CurrentUserProvider";
import { ModRegistry } from "../../shell/src/mod-system/ModRegistry";
import type { HubConfig } from "../../shell/src/mod-system/types";

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

// ── Jump Back In ────────────────────────────────────────────────────────────

/** The hub ID for the home hub — excluded from the card grid. */
const HOME_HUB_ID = "home";

/** Color tokens cycled through per hub card: flask → enzyme → solvent → repeat. */
const HUB_COLOR_TOKENS = ["flask", "enzyme", "solvent"] as const;
type HubColorToken = (typeof HUB_COLOR_TOKENS)[number];

/** Tailwind classes for each hub color token (static lookup — dynamic classes won't tree-shake). */
const HUB_COLOR_CLASSES: Record<
  HubColorToken,
  { bg: string; text: string }
> = {
  flask: { bg: "bg-flask", text: "text-flask-foreground" },
  enzyme: { bg: "bg-enzyme", text: "text-enzyme-foreground" },
  solvent: { bg: "bg-solvent", text: "text-solvent-foreground" },
};

function getHubColor(index: number): HubColorToken {
  return HUB_COLOR_TOKENS[index % HUB_COLOR_TOKENS.length];
}

/** Placeholder stats line shown on every hub card. */
const PLACEHOLDER_STATS = "2 active · 14 entries";

/**
 * A single hub card showing:
 *  - colored icon square (flask / enzyme / solvent)
 *  - arrow icon that shifts on hover
 *  - serif heading (hub label)
 *  - muted description text
 *  - hardcoded placeholder stats in mono
 *  - footer with status chip and timestamp
 *
 * The entire card is a link to the hub's route.
 */
function HubCard({
  hub,
  colorToken,
}: {
  hub: HubConfig;
  colorToken: HubColorToken;
}) {
  const Icon = hub.icon;
  const colorClasses = HUB_COLOR_CLASSES[colorToken];

  return (
    <Link
      to={hub.route}
      className="group flex flex-col rounded-lg border border-border bg-panel p-5 transition hover:border-primary/40 hover:shadow-sm"
    >
      {/* Top row: coloured icon square + arrow */}
      <div className="flex items-center justify-between">
        <span
          className={`grid h-9 w-9 place-items-center rounded-md ${colorClasses.bg} ${colorClasses.text}`}
        >
          <Icon className="h-5 w-5" aria-hidden="true" />
        </span>
        <ArrowRight className="h-4 w-4 text-muted-foreground transition group-hover:translate-x-0.5 group-hover:text-primary" />
      </div>

      {/* Hub label */}
      <h3 className="mt-4 font-serif text-lg font-semibold tracking-tight">
        {hub.label}
      </h3>

      {/* Placeholder stats line (mono) */}
      <p className="font-mono text-[11px] text-muted-foreground">
        {PLACEHOLDER_STATS}
      </p>

      {/* Description (muted) */}
      {hub.description && (
        <p className="mt-2 text-[13px] leading-relaxed text-muted-foreground">
          {hub.description}
        </p>
      )}

      {/* Footer: status chip + timestamp */}
      <div className="mt-4 flex items-center justify-between border-t border-hairline pt-3 text-[11px] text-muted-foreground">
        <span className="chip">
          <Beaker className="h-3 w-3" aria-hidden="true" /> open
        </span>
        <span className="font-mono">edited 8 min ago</span>
      </div>
    </Link>
  );
}

/**
 * "Jump Back In" section — heading with hub count, grid of hub cards.
 *
 * Reads all registered hubs from {@link ModRegistry}, excludes the `home`
 * hub, and renders one card per remaining hub. Cards are inline-mapped
 * (no slot system).
 */
function JumpBackIn() {
  const registry = ModRegistry.getInstance();
  const nonHomeHubs = Array.from(registry.getHubs())
    .filter(([id]) => id !== HOME_HUB_ID)
    .map(([, hub], index) => ({ hub, index }));

  return (
    <section className="px-6 py-12">
      <div className="mx-auto max-w-4xl">
        {/* Section heading */}
        <div className="mb-5 flex items-baseline justify-between">
          <h2 className="font-serif text-2xl font-semibold tracking-tight">
            Jump back in
          </h2>
          <span className="text-[12px] text-muted-foreground">
            {nonHomeHubs.length}{" "}
            {nonHomeHubs.length === 1 ? "workspace" : "workspaces"}
          </span>
        </div>

        {/* Card grid */}
        {nonHomeHubs.length > 0 ? (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {nonHomeHubs.map(({ hub, index }) => (
              <HubCard
                key={hub.id}
                hub={hub}
                colorToken={getHubColor(index)}
              />
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            No other workspaces available.
          </p>
        )}
      </div>
    </section>
  );
}

// ── HomePage ─────────────────────────────────────────────────────────────────

/**
 * HomePage — the Home hub dashboard.
 *
 * Composed of four visible sections:
 *  1. Decorative header (thin bar with bottom border)
 *  2. Greeting section (grid-paper background, greets user by first name)
 *  3. Stats bar (4-column grid of placeholder metrics)
 *  4. Jump Back In (grid of hub cards for quick navigation)
 */
function HomePage() {
  return (
    <div className="flex flex-col">
      <DecorativeHeader />
      <GreetingSection />
      <StatsBar />
      <JumpBackIn />
    </div>
  );
}

export default HomePage;
