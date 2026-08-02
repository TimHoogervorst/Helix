import { useEffect, useState, useCallback, useRef } from "react";
import {
  AlertTriangle,
  Loader2,
  Plus,
  Pencil,
} from "lucide-react";
import { useCurrentUser } from "../../../user/CurrentUserProvider";
import { getCards, getMetricValue } from "./api";
import {
  resolveFormatting,
  applyValueTemplate,
  resolveIcon,
  CARD_COLOR_CLASSES,
  type FormattingConfig,
  type CardColorToken,
  type FormattingStyle,
} from "./formatting";
import type { CardState, CardData } from "./types";
import { CardBuilderModal } from "./CardBuilderModal";

// ── Loading Skeleton ───────────────────────────────────────────────────────

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

// ── Card Tile ──────────────────────────────────────────────────────────────

interface CardTileProps {
  state: CardState;
  onEdit: (card: CardData) => void;
}

function CardTile({ state, onEdit }: CardTileProps) {
  const { card, value, valueLoading, valueError } = state;

  const formatting = card.formatting as FormattingConfig | undefined;
  const style: FormattingStyle = resolveFormatting(value, formatting);
  const colorKey = style.color as CardColorToken;
  const colorClasses = CARD_COLOR_CLASSES[colorKey] ?? CARD_COLOR_CLASSES.muted;

  const Icon = resolveIcon(style.icon);
  const label = card.label || card.metric_name;
  const subtitle = applyValueTemplate(style.text, value);

  return (
    <div className="group relative flex-shrink-0 w-1/4 min-w-[180px] flex flex-col items-start gap-1.5 bg-card px-5 py-3">
      {/* Hover edit button */}
      <button
        type="button"
        className="btn-icon absolute right-2 top-2 opacity-0 group-hover:opacity-100 transition-opacity"
        onClick={() => onEdit(card)}
        title="Edit card"
        aria-label="Edit card"
      >
        <Pencil className="h-3.5 w-3.5" />
      </button>

      <span className={colorClasses.text}>
        <Icon className="h-4 w-4" aria-hidden="true" />
      </span>
      <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </span>

      {valueLoading ? (
        <span className="font-serif text-2xl font-semibold tracking-tight text-muted-foreground flex items-center gap-1">
          <Loader2
            className="h-5 w-5 animate-spin"
            aria-label="Loading value"
          />
        </span>
      ) : valueError ? (
        <span className="flex items-center gap-1.5 text-muted-foreground">
          <AlertTriangle className="h-4 w-4" aria-hidden="true" />
          <span className="font-mono text-[11px]">Failed to load</span>
        </span>
      ) : (
        <span className={`font-serif text-2xl font-semibold tracking-tight ${
          colorKey !== "muted" ? colorClasses.text : "text-foreground"
        }`}>
          {value !== null ? value : "\u2014"}
        </span>
      )}

      <span className="font-mono text-[11px] text-muted-foreground">
        {subtitle ?? ""}
      </span>
    </div>
  );
}

// ── Empty State ────────────────────────────────────────────────────────────

function EmptyState({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="flex-1 px-5 py-6 text-center">
      <p className="text-sm text-muted-foreground">
        Pin a metric to see it here.
      </p>
      <button
        type="button"
        className="btn-ghost mt-2"
        onClick={onAdd}
      >
        <Plus className="h-4 w-4" />
        Add card
      </button>
    </div>
  );
}

// ── Metric Cards Bar ───────────────────────────────────────────────────────

export interface MetricCardsBarProps {
  surface?: string;
}

export function MetricCardsBar({ surface = "home" }: MetricCardsBarProps) {
  const { user } = useCurrentUser();
  const [cardStates, setCardStates] = useState<CardState[]>([]);
  const [cardsLoading, setCardsLoading] = useState(true);
  const [builderOpen, setBuilderOpen] = useState(false);
  const [editingCard, setEditingCard] = useState<CardData | null>(null);
  const cancelledRef = useRef(false);

  const loadCards = useCallback(() => {
    cancelledRef.current = false;
    setCardsLoading(true);

    getCards(surface)
      .then((cards) => {
        if (cancelledRef.current) return;

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
              if (cancelledRef.current) return;
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
              if (cancelledRef.current) return;
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
        if (cancelledRef.current) return;
        setCardsLoading(false);
        setCardStates([]);
      });
  }, [surface, user?.username]);

  useEffect(() => {
    loadCards();
    return () => {
      cancelledRef.current = true;
    };
  }, [loadCards]);

  const openBuilder = useCallback((card: CardData | null) => {
    setEditingCard(card);
    setBuilderOpen(true);
  }, []);

  const closeBuilder = useCallback(() => {
    setBuilderOpen(false);
    setEditingCard(null);
  }, []);

  const handleSaved = useCallback(() => {
    loadCards();
  }, [loadCards]);

  return (
    <section className="border-y-1 border-border bg-surface">
      <div className="mx-auto max-w-4xl">
        <div className="flex gap-px overflow-x-auto items-stretch">
          {cardsLoading ? (
            <LoadingSkeleton />
          ) : cardStates.length === 0 ? (
            <EmptyState onAdd={() => openBuilder(null)} />
          ) : (
            <>
              {cardStates.map((state) => (
                <CardTile
                  key={state.card.id}
                  state={state}
                  onEdit={openBuilder}
                />
              ))}
              {/* Add card button */}
              <button
                type="button"
                className="flex-shrink-0 w-1/4 min-w-[180px] flex flex-col items-center justify-center gap-1 bg-card px-5 py-3 group hover:bg-muted/50 transition"
                onClick={() => openBuilder(null)}
                title="Add card"
                aria-label="Add card"
              >
                <span className="text-muted-foreground group-hover:text-foreground transition-colors">
                  <Plus
                    className="h-5 w-5"
                    aria-hidden="true"
                  />
                </span>
                <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                  Add card
                </span>
              </button>
            </>
          )}
        </div>
      </div>

      {builderOpen && (
        <CardBuilderModal
          editingCard={editingCard}
          surface={surface}
          onClose={closeBuilder}
          onSaved={handleSaved}
        />
      )}
    </section>
  );
}
