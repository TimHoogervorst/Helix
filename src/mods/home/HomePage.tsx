import {
  ArrowRight,
  Beaker,
  Eye,
  FileText,
  Pencil,
  Flag,
  MessageSquare,
  TrendingUp,
} from "lucide-react";
import { Link } from "react-router-dom";
import { useCurrentUser } from "../../shell/src/user/CurrentUserProvider";
import { ModRegistry } from "../../shell/src/mod-system/ModRegistry";
import type { HubConfig } from "../../shell/src/mod-system/types";
import { MetricCardsBar } from "../../shell/src/shared/components/MetricCards";

// ── Decorative Header ────────────────────────────────────────────────────────

/**
 * Thin decorative bar with a bottom border at the top of the content area.
 * Purely visual — no text or interactive elements.
 */
function DecorativeHeader() {
  return (
    <div className="border-b-1 border-border" aria-hidden="true">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-6" />
    </div>
  );
}

// ── Greeting Section ─────────────────────────────────────────────────────────

/** Placeholder subtitle shown below the greeting. */
const GREETING_SUBTITLE = "Here's what's happening in your lab today.";

/**
 * Full-viewport-width greeting section with a grid-paper background.
 * Greets the current user by username, styled in italic primary color.
 */
function GreetingSection() {
  const { user } = useCurrentUser();
  const userName = user?.username ?? "there";

  return (
    <section className="grid-paper w-full px-6 py-10">
      <div className="mx-auto max-w-4xl">
        <h1 className="mt-3 font-[--font-label] text-lg font-semibold leading-[1.05] tracking-tight md:text-[4rem]">
          Good morning,{" "}
          <span className="italic text-primary">{userName}</span>
          .<br />
          Your bench is warm.
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {GREETING_SUBTITLE}
        </p>
      </div>
    </section>
  );
}

// ── Jump Back In ────────────────────────────────────────────────────────────

/** The hub ID for the home hub — excluded from the card grid. */
const HOME_HUB_ID = "home.home";

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

/** All semantic color tokens used for icon badges (includes warn). */
type SemanticColorToken = HubColorToken | "warn";

/** Tailwind classes for all semantic color tokens (flask, enzyme, solvent, warn). */
const SEMANTIC_COLOR_CLASSES: Record<
  SemanticColorToken,
  { bg: string; text: string }
> = {
  ...HUB_COLOR_CLASSES,
  warn: { bg: "bg-warn", text: "text-warn-foreground" },
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
      className="group flex flex-col rounded-lg border border-border bg-card p-5 transition hover:border-primary/40 hover:shadow-sm"
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
      <h3 className="mt-4 font-[--font-body] text-lg font-semibold tracking-tight">
        {hub.label}
      </h3>

      {/* Placeholder stats line (mono) */}
      <p className="font-mono text-xs text-muted-foreground">
        {PLACEHOLDER_STATS}
      </p>

      {/* Description (muted) */}
      {hub.description && (
        <p className="mt-2 text-base leading-relaxed text-muted-foreground">
          {hub.description}
        </p>
      )}

      {/* Footer: status chip + timestamp */}
      <div className="mt-4 flex items-center justify-between border-t border-hairline pt-3 text-xs text-muted-foreground">
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
    <section className="px-6 py-6">
      <div className="mx-auto max-w-4xl">
        {/* Section heading */}
        <div className="mb-5 flex items-baseline justify-between">
          <h2 className="font-[--font-label] text-2xl font-semibold tracking-tight">
            Jump back in
          </h2>
          <span className="text-sm text-muted-foreground">
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

// ── Recent Activity ──────────────────────────────────────────────────────────

interface RecentActivityItem {
  icon: React.ReactNode;
  colorToken: SemanticColorToken;
  person: string;
  action: string;
  target: string;
  timestamp: string;
  filePath: string;
}

/** Hardcoded placeholder activity items for the Recent Activity panel. */
const RECENT_ACTIVITY_ITEMS: RecentActivityItem[] = [
  {
    icon: <Eye className="h-3.5 w-3.5" aria-hidden="true" />,
    colorToken: "flask",
    person: "Mira Kato",
    action: "witnessed",
    target: "PCR run #142",
    timestamp: "2 min ago",
    filePath: "/eln/notebooks/lab-a/pcr-142",
  },
  {
    icon: <Pencil className="h-3.5 w-3.5" aria-hidden="true" />,
    colorToken: "enzyme",
    person: "James Chen",
    action: "edited",
    target: "Buffer prep SOP",
    timestamp: "18 min ago",
    filePath: "/library/sops/buffer-prep-v3",
  },
  {
    icon: <FileText className="h-3.5 w-3.5" aria-hidden="true" />,
    colorToken: "solvent",
    person: "Priya Sharma",
    action: "logged",
    target: "Cell culture passage",
    timestamp: "47 min ago",
    filePath: "/eln/notebooks/lab-b/cell-culture",
  },
  {
    icon: <Flag className="h-3.5 w-3.5" aria-hidden="true" />,
    colorToken: "warn",
    person: "Alex Müller",
    action: "flagged",
    target: "Incubator temperature",
    timestamp: "1 hour ago",
    filePath: "/lims/equipment/incubator-3",
  },
  {
    icon: <MessageSquare className="h-3.5 w-3.5" aria-hidden="true" />,
    colorToken: "flask",
    person: "Sarah Okafor",
    action: "commented",
    target: "Western blot results",
    timestamp: "2 hours ago",
    filePath: "/eln/notebooks/lab-a/western-blot-089",
  },
];

/**
 * A single activity row: colored icon badge, bold person name, action + target,
 * and a monospaced timestamp with file path.
 */
function ActivityRow({ item }: { item: RecentActivityItem }) {
  const colorClasses = SEMANTIC_COLOR_CLASSES[item.colorToken];

  return (
    <div className="flex items-start gap-3 py-3 first:pt-0 last:pb-0">
      {/* Colored icon badge */}
      <span
        className={`mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-md ${colorClasses.bg} ${colorClasses.text}`}
      >
        {item.icon}
      </span>

      {/* Description + timestamp */}
      <div className="min-w-0 flex-1">
        <p className="text-base leading-snug text-foreground">
          <span className="font-semibold">{item.person}</span>{" "}
          {item.action}{" "}
          <span className="font-medium">{item.target}</span>
        </p>
        <p className="mt-0.5 font-mono text-xs text-muted-foreground">
          {item.timestamp} — {item.filePath}
        </p>
      </div>
    </div>
  );
}

/**
 * "Recent activity" panel — bordered card with a heading, a "live" chip,
 * and five hardcoded activity items.
 */
function RecentActivity() {
  return (
    <section className="rounded-lg border border-border bg-card p-5">
      {/* Heading row */}
      <div className="mb-4 flex items-center gap-2">
        <h2 className="font-[--font-label] text-lg font-semibold tracking-tight">
          Recent activity
        </h2>
        <span className="chip">
          <span className="mr-1 inline-block h-1.5 w-1.5 rounded-full bg-green-500" />
          live
        </span>
      </div>

      {/* Activity list */}
      <div className="divide-y divide-hairline">
        {RECENT_ACTIVITY_ITEMS.map((item, index) => (
          <ActivityRow key={index} item={item} />
        ))}
      </div>
    </section>
  );
}

// ── Today in the Lab ────────────────────────────────────────────────────────

interface TimelineEntry {
  time: string;
  colorToken: SemanticColorToken;
  description: string;
}

/** Hardcoded placeholder timeline entries for the Today in the Lab panel. */
const TIMELINE_ENTRIES: TimelineEntry[] = [
  {
    time: "09:15",
    colorToken: "flask",
    description: "Daily instrument calibration completed across all labs.",
  },
  {
    time: "10:30",
    colorToken: "enzyme",
    description: "New reagent batch QC passed — ready for distribution.",
  },
  {
    time: "13:45",
    colorToken: "solvent",
    description: "Safety inspection walkthrough starting in Lab B.",
  },
  {
    time: "15:00",
    colorToken: "warn",
    description: "Freezer −80 °C defrost cycle scheduled for tonight.",
  },
];

/**
 * A single timeline row: monospaced time label, a small colored dot,
 * and a text description.
 */
function TimelineRow({ entry }: { entry: TimelineEntry }) {
  const colorClasses = SEMANTIC_COLOR_CLASSES[entry.colorToken];

  return (
    <div className="flex items-start gap-3 py-2.5 first:pt-0 last:pb-0">
      {/* Time label */}
      <span className="font-mono text-xs text-muted-foreground shrink-0 w-10">
        {entry.time}
      </span>

      {/* Colored dot */}
      <span
        className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${colorClasses.bg}`}
        aria-hidden="true"
      />

      {/* Description */}
      <p className="text-base leading-snug text-foreground">
        {entry.description}
      </p>
    </div>
  );
}

/**
 * "Today in the lab" panel — bordered card with a heading, a trending icon,
 * and four hardcoded timeline entries.
 */
function TodayInTheLab() {
  return (
    <section className="rounded-lg border border-border bg-card p-5">
      {/* Heading row */}
      <div className="mb-4 flex items-center gap-2">
        <h2 className="font-[--font-label] text-lg font-semibold tracking-tight">
          Today in the lab
        </h2>
        <TrendingUp
          className="h-4 w-4 text-muted-foreground"
          aria-hidden="true"
        />
      </div>

      {/* Timeline */}
      <div className="divide-y divide-hairline">
        {TIMELINE_ENTRIES.map((entry, index) => (
          <TimelineRow key={index} entry={entry} />
        ))}
      </div>
    </section>
  );
}

// ── HomePage ─────────────────────────────────────────────────────────────────

/**
 * HomePage — the Home hub dashboard.
 *
 * Composed of six visible sections:
 *  1. Decorative header (thin bar with bottom border)
 *  2. Greeting section (grid-paper background, greets user by username)
 *  3. Metric Cards bar (live metric values from the Cards API)
 *  4. Jump Back In (grid of hub cards for quick navigation)
 *  5. Recent Activity + Today in the Lab (2/3 + 1/3 side-by-side panels)
 */
function HomePage() {
  return (
    <div className="flex flex-1 flex-col overflow-y-auto">
      {/* <DecorativeHeader /> */}
      <GreetingSection />
      <MetricCardsBar />
      <JumpBackIn />
      <section className="px-6 py-6">
        <div className="mx-auto grid max-w-4xl gap-5 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <RecentActivity />
          </div>
          <div className="lg:col-span-1">
            <TodayInTheLab />
          </div>
        </div>
      </section>
    </div>
  );
}

export default HomePage;
