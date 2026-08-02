import { useEffect, useState } from "react";
import {
  FlaskConical,
  ScrollText,
  TestTubes,
  AlertTriangle,
  Activity,
  BarChart3,
  Beaker,
  CircleDollarSign,
  Clock,
  FileText,
  Thermometer,
  TrendingUp,
  Loader2,
  type LucideIcon,
} from "lucide-react";
import { useCurrentUser } from "../../shell/src/user/CurrentUserProvider";
import { getCards, getMetricValue } from "./api";
import type { CardState } from "./types";

// ── Icon Resolution ──────────────────────────────────────────────────────────

const ICON_MAP: Record<string, LucideIcon> = {
  "flask-conical": FlaskConical,
  "scroll-text": ScrollText,
  "test-tubes": TestTubes,
  "alert-triangle": AlertTriangle,
  activity: Activity,
  "bar-chart-3": BarChart3,
  beaker: Beaker,
  "circle-dollar-sign": CircleDollarSign,
  clock: Clock,
  "file-text": FileText,
  thermometer: Thermometer,
  "trending-up": TrendingUp,
};

function resolveIcon(token: string): LucideIcon {
  return ICON_MAP[token] ?? FlaskConical;
}

// ── Loading Skeleton ─────────────────────────────────────────────────────────

/** Four placeholder tiles shown while cards are loading. */
function LoadingSkeleton() {
  return (
    <>
      {Array.from({ length: 4 }).map((_, i) => (
        <div
          key={i}
          className="flex-shrink-0 w-1/4 min-w-[180px] flex flex-col items-start gap-1.5 bg-card px-5 py-3"
        >
          <span className="h-4 w-4 animate-pulse rounded bg-muted" />
          <span className="h-3 w-24 animate-pulse rounded bg-muted" />
          <span className="h-8 w-16 animate-pulse rounded bg-muted" />
          <span className="h-3 w-20 animate-pulse rounded bg-muted" />
        </div>
      ))}
    </>
  );
}

// ── Card Tile ────────────────────────────────────────────────────────────────

/**
 * A single metric card tile — same visual language as the original StatTile:
 * icon, uppercase label, large serif value, empty mono subtitle slot.
 */
function CardTile({ state }: { state: CardState }) {
  const { card, value, valueLoading, valueError } = state;
  const Icon = resolveIcon(card.icon);
  const label = card.label || card.metric_name;

  return (
    <div
      className="flex-shrink-0 w-1/4 min-w-[180px] flex flex-col items-start gap-1.5 bg-card px-5 py-3"
    >
      <span className="text-muted-foreground">
        <Icon className="h-4 w-4" aria-hidden="true" />
      </span>
      <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </span>

      {valueLoading ? (
        <span className="font-serif text-2xl font-semibold tracking-tight text-muted-foreground flex items-center gap-1">
          <Loader2 className="h-5 w-5 animate-spin" aria-label="Loading value" />
        </span>
      ) : valueError ? (
        <span className="flex items-center gap-1.5 text-muted-foreground">
          <AlertTriangle className="h-4 w-4" aria-hidden="true" />
          <span className="font-mono text-[11px]">Failed to load</span>
        </span>
      ) : (
        <span className="font-serif text-2xl font-semibold tracking-tight text-foreground">
          {value !== null ? value : "\u2014"}
        </span>
      )}

      <span className="font-mono text-[11px] text-muted-foreground">
        {/* subtitle slot — empty until conditional formatting lands */}
      </span>
    </div>
  );
}

// ── Empty State ──────────────────────────────────────────────────────────────

function EmptyState() {
  return (
    <div className="flex-1 px-5 py-6 text-center">
      <p className="text-sm text-muted-foreground">
        Pin a metric to see it here.
      </p>
    </div>
  );
}

// ── Metric Cards Bar ─────────────────────────────────────────────────────────

/**
 * Live Metric Cards bar — fetches cards for a surface, fires parallel
 * value requests, and renders each card with its icon, label, and live value.
 *
 * At most 4 cards are visible at once; additional cards scroll horizontally.
 */
export function MetricCardsBar({ surface = "home" }: { surface?: string }) {
  const { user } = useCurrentUser();
  const [cardStates, setCardStates] = useState<CardState[]>([]);
  const [cardsLoading, setCardsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    setCardsLoading(true);

    getCards(surface)
      .then((cards) => {
        if (cancelled) return;

        const initial: CardState[] = cards.map((card) => ({
          card,
          value: null,
          valueLoading: true,
          valueError: false,
        }));
        setCardStates(initial);
        setCardsLoading(false);

        const identity = user?.username;

        initial.forEach((cs, index) => {
          getMetricValue(cs.card.metric, identity)
            .then((res) => {
              if (cancelled) return;
              setCardStates((prev) => {
                const next = [...prev];
                if (next[index]) {
                  next[index] = {
                    ...next[index],
                    value: res.value,
                    valueLoading: false,
                  };
                }
                return next;
              });
            })
            .catch(() => {
              if (cancelled) return;
              setCardStates((prev) => {
                const next = [...prev];
                if (next[index]) {
                  next[index] = {
                    ...next[index],
                    valueLoading: false,
                    valueError: true,
                  };
                }
                return next;
              });
            });
        });
      })
      .catch(() => {
        if (cancelled) return;
        setCardsLoading(false);
        setCardStates([]);
      });

    return () => {
      cancelled = true;
    };
  }, [surface, user?.username]);

  return (
    <section className="border-y-1 border-border bg-surface">
      <div className="mx-auto max-w-4xl">
        <div className="flex gap-px overflow-x-auto">
          {cardsLoading ? (
            <LoadingSkeleton />
          ) : cardStates.length === 0 ? (
            <EmptyState />
          ) : (
            cardStates.map((state) => (
              <CardTile key={state.card.id} state={state} />
            ))
          )}
        </div>
      </div>
    </section>
  );
}
