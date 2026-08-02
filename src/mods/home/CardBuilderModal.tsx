import { useEffect, useState, useCallback } from "react";
import { X, Plus, Trash2, ChevronUp, ChevronDown } from "lucide-react";
import { ModRegistry } from "../../shell/src/mod-system/ModRegistry";
import {
  getMyViews,
  getPublicViews,
} from "../lims/hub/api";
import { get } from "../../shell/src/api/client";
import {
  getMetrics,
  createMetric,
  createCard,
  updateCard,
  forkCard,
} from "./api";
import { IconPicker } from "./IconPicker";
import { ColorPicker } from "./ColorPicker";
import {
  COMPARISON_OPS,
  CARD_ICONS,
  CARD_COLOR_TOKENS,
  CARD_COLOR_CLASSES,
  defaultFormatting,
  defaultRuleColor,
  type ComparisonOp,
  type FormattingConfig,
  type FormattingRule,
  type CardColorToken,
} from "./formatting";
import type { CardData, MetricData, MetricCreatePayload } from "./types";
import type { LimsViewItem, AvailableColumn } from "../lims/types";
import type { BackendColumnType } from "../../shell/src/mod-system/ModRegistry";

// ── Helpers ────────────────────────────────────────────────────────────────

const ALL_AGGREGATE_IDS = [
  "count",
  "count_distinct",
  "sum",
  "avg",
  "min",
  "max",
  "stdev",
];

const AGGREGATE_LABELS: Record<string, string> = {
  count: "Count",
  count_distinct: "Count Distinct",
  sum: "Sum",
  avg: "Average",
  min: "Min",
  max: "Max",
  stdev: "Std Dev",
};

/** Aggregates that require a column selection. */
function aggregateRequiresColumn(fn: string): boolean {
  return fn !== "count";
}

/** Get supported aggregates for a column type from the registry. */
function getAggregatesForColumnType(
  columnType: BackendColumnType | undefined,
): string[] {
  if (!columnType?.aggregates) return [];
  return columnType.aggregates.map((a) => a.id);
}

type BuilderStep = "metric" | "display" | "formatting";
type MetricSource = "existing" | "new";

interface BuilderState {
  card?: CardData;
  metricSource: MetricSource;
  selectedMetricId: number | null;
  selectedViewId: number | null;
  selectedAggregate: string;
  selectedColumn: string | null;
  label: string;
  icon: string;
  formatting: FormattingConfig;
}

// ── CardBuilderModal ───────────────────────────────────────────────────────

interface CardBuilderModalProps {
  editingCard: CardData | null;
  surface: string;
  onClose: () => void;
  onSaved: () => void;
}

export function CardBuilderModal({
  editingCard,
  surface,
  onClose,
  onSaved,
}: CardBuilderModalProps) {
  const isEditing = editingCard !== null;
  const isGlobal = editingCard?.is_global ?? false;

  const [step, setStep] = useState<BuilderStep>("metric");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [forked, setForked] = useState(false);

  // Fork state for global cards
  const [showForkPrompt, setShowForkPrompt] = useState(isGlobal);

  // ── Metric Tab State ──────────────────────────────────────────────────
  const [metrics, setMetrics] = useState<MetricData[]>([]);
  const [metricsLoading, setMetricsLoading] = useState(false);
  const [views, setViews] = useState<LimsViewItem[]>([]);
  const [viewsLoading, setViewsLoading] = useState(false);
  const [availableColumns, setAvailableColumns] = useState<AvailableColumn[]>(
    [],
  );
  const [columnsLoading, setColumnsLoading] = useState(false);

  const [metricSource, setMetricSource] = useState<MetricSource>(
    isEditing ? "existing" : "existing",
  );
  const [selectedMetricId, setSelectedMetricId] = useState<number | null>(
    editingCard?.metric ?? null,
  );
  const [selectedViewId, setSelectedViewId] = useState<number | null>(null);
  const [selectedAggregate, setSelectedAggregate] = useState("count");
  const [selectedColumn, setSelectedColumn] = useState<string | null>(null);

  // ── Display Tab State ─────────────────────────────────────────────────
  const [label, setLabel] = useState(editingCard?.label ?? "");
  const [icon, setIcon] = useState(editingCard?.icon ?? "flask-conical");

  // ── Formatting Tab State ──────────────────────────────────────────────
  const [formatting, setFormatting] = useState<FormattingConfig>(
    () =>
      (editingCard?.formatting as FormattingConfig) ?? defaultFormatting(),
  );

  // ── Data Fetching ─────────────────────────────────────────────────────

  const loadMetrics = useCallback(async () => {
    setMetricsLoading(true);
    try {
      const data = await getMetrics();
      setMetrics(data ?? []);
    } catch {
      setMetrics([]);
    } finally {
      setMetricsLoading(false);
    }
  }, []);

  const loadViews = useCallback(async () => {
    setViewsLoading(true);
    try {
      const [myViews, publicViews] = await Promise.all([
        getMyViews(),
        getPublicViews(),
      ]);
      const myIds = new Set(myViews.map((v) => v.id));
      const dedupedPublic = publicViews.filter((v) => !myIds.has(v.id));
      setViews([...myViews, ...dedupedPublic]);
    } catch {
      // silently fails
    } finally {
      setViewsLoading(false);
    }
  }, []);

  const loadColumns = useCallback(async (view: LimsViewItem) => {
    setColumnsLoading(true);
    setAvailableColumns([]);
    try {
      const params = new URLSearchParams({ size: "1" });
      if (view.filter_state?.schema_type) {
        params.set("schema_type", view.filter_state.schema_type);
      }
      if (view.filter_state?.schema) {
        params.set("schema", view.filter_state.schema);
      }
      const rawRes = await get<{
        available_columns: AvailableColumn[];
      }>(`/registry/entities/?${params.toString()}`);
      setAvailableColumns(rawRes.available_columns ?? []);
    } catch {
      setAvailableColumns([]);
    } finally {
      setColumnsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadMetrics();
  }, [loadMetrics]);

  // ── Derived Data ──────────────────────────────────────────────────────

  const registry = ModRegistry.getInstance();

  // Filter columns by aggregate support
  const filterableColumns = availableColumns.filter((col) => {
    if (!aggregateRequiresColumn(selectedAggregate)) return true;
    const ct = registry.getColumnType(col.type);
    if (!ct) return false;
    return ct.aggregates?.some((a) => a.id === selectedAggregate) ?? false;
  });

  // ── Fork Flow ─────────────────────────────────────────────────────────

  const handleFork = async () => {
    if (!editingCard) return;
    setSaving(true);
    setError(null);
    try {
      const forkedCard = await forkCard(editingCard.id);
      // Now we're editing the forked (personal) copy
      setForked(true);
      setShowForkPrompt(false);
      // Reset state to the forked card's values
      setSelectedMetricId(forkedCard.metric);
      setLabel(forkedCard.label);
      setIcon(forkedCard.icon);
      setFormatting(
        (forkedCard.formatting as FormattingConfig) ?? defaultFormatting(),
      );
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Failed to fork card",
      );
    } finally {
      setSaving(false);
    }
  };

  // ── Save ──────────────────────────────────────────────────────────────

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      let metricId = selectedMetricId;

      // Create new metric if needed
      if (metricSource === "new") {
        if (!selectedViewId) {
          setError("Please select a View.");
          setSaving(false);
          return;
        }
        const payload: MetricCreatePayload = {
          view: selectedViewId,
          aggregate_function: selectedAggregate,
          column: aggregateRequiresColumn(selectedAggregate)
            ? selectedColumn || undefined
            : undefined,
        };
        const newMetric = await createMetric(payload);
        metricId = newMetric.id;
      }

      if (!metricId) {
        setError("Please select or create a Metric.");
        setSaving(false);
        return;
      }

      // Use existing card id if editing (non-global / forked)
      const cardId = isEditing && (!isGlobal || forked) ? editingCard.id : undefined;

      if (cardId) {
        await updateCard(cardId, {
          metric: metricId,
          surface,
          label,
          icon,
          formatting,
        });
      } else {
        await createCard({
          metric: metricId,
          surface,
          label,
          icon,
          formatting,
        });
      }

      onSaved();
      onClose();
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Failed to save card",
      );
    } finally {
      setSaving(false);
    }
  };

  // ── Rule Helpers ──────────────────────────────────────────────────────

  const addRule = () => {
    setFormatting((prev) => ({
      ...prev,
      rules: [
        ...prev.rules,
        {
          when: { op: "lt" as ComparisonOp, value: 5 },
          color: defaultRuleColor(),
        },
      ],
    }));
  };

  const removeRule = (index: number) => {
    setFormatting((prev) => ({
      ...prev,
      rules: prev.rules.filter((_, i) => i !== index),
    }));
  };

  const updateRule = (index: number, update: Partial<FormattingRule>) => {
    setFormatting((prev) => ({
      ...prev,
      rules: prev.rules.map((r, i) =>
        i === index ? { ...r, ...update } : r,
      ),
    }));
  };

  const moveRule = (index: number, direction: -1 | 1) => {
    setFormatting((prev) => {
      const rules = [...prev.rules];
      const target = index + direction;
      if (target < 0 || target >= rules.length) return prev;
      [rules[index], rules[target]] = [rules[target], rules[index]];
      return { ...prev, rules };
    });
  };

  // ── Render ────────────────────────────────────────────────────────────

  if (showForkPrompt) {
    return (
      <ModalShell onClose={onClose}>
        <div className="flex flex-col items-center gap-4 p-8 text-center">
          <h3 className="font-serif text-lg font-semibold tracking-tight">
            Global Card
          </h3>
          <p className="text-sm text-muted-foreground max-w-sm">
            This is a global card and cannot be edited directly. Fork it to
            create your own personal copy that you can customise.
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              className="btn-ghost"
              onClick={onClose}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleFork}
              disabled={saving}
            >
              {saving ? "Forking…" : "Fork to edit"}
            </button>
          </div>
          {error && (
            <p className="text-sm text-warn-foreground bg-warn rounded px-3 py-1.5">
              {error}
            </p>
          )}
        </div>
      </ModalShell>
    );
  }

  return (
    <ModalShell onClose={onClose}>
      <div className="flex flex-col h-[520px]">
        {/* Tabs */}
        <div className="lims-tab-bar shrink-0 px-4 pt-3">
          {(["metric", "display", "formatting"] as BuilderStep[]).map(
            (s) => (
              <button
                key={s}
                type="button"
                className={`lims-tab ${step === s ? "is-active" : ""}`}
                onClick={() => setStep(s)}
              >
                {s === "metric"
                  ? "Metric"
                  : s === "display"
                    ? "Display"
                    : "Formatting"}
              </button>
            ),
          )}
        </div>

        {/* Step Content */}
        <div className="flex-1 overflow-y-auto px-4 py-4">
          {step === "metric" && (
            <MetricStep
              metricSource={metricSource}
              onMetricSourceChange={setMetricSource}
              metrics={metrics}
              metricsLoading={metricsLoading}
              onRefreshMetrics={loadMetrics}
              selectedMetricId={selectedMetricId}
              onSelectMetric={setSelectedMetricId}
              views={views}
              viewsLoading={viewsLoading}
              onLoadViews={loadViews}
              selectedViewId={selectedViewId}
              onSelectView={(viewId) => {
                setSelectedViewId(viewId);
                const view = views.find((v) => v.id === viewId);
                if (view) loadColumns(view);
              }}
              selectedAggregate={selectedAggregate}
              onSelectAggregate={(fn) => {
                setSelectedAggregate(fn);
                if (!aggregateRequiresColumn(fn)) {
                  setSelectedColumn(null);
                }
              }}
              selectedColumn={selectedColumn}
              onSelectColumn={setSelectedColumn}
              availableColumns={filterableColumns}
              columnsLoading={columnsLoading}
              showColumnPicker={aggregateRequiresColumn(selectedAggregate)}
            />
          )}

          {step === "display" && (
            <DisplayStep
              label={label}
              onLabelChange={setLabel}
              icon={icon}
              onIconChange={setIcon}
            />
          )}

          {step === "formatting" && (
            <FormattingStep
              formatting={formatting}
              onAddRule={addRule}
              onRemoveRule={removeRule}
              onUpdateRule={updateRule}
              onMoveRule={moveRule}
              onUpdateDefault={(d) =>
                setFormatting((prev) => ({
                  ...prev,
                  default: { ...prev.default, ...d },
                }))
              }
            />
          )}
        </div>

        {/* Footer */}
        <div className="shrink-0 border-t border-hairline px-4 py-3 flex items-center justify-between">
          <div className="flex gap-2">
            {isEditing && !isGlobal && (
              <button
                type="button"
                className="btn-ghost text-destructive hover:bg-warn/20"
                onClick={async () => {
                  const { deleteCard } = await import("./api");
                  if (confirm("Delete this card?")) {
                    try {
                      await deleteCard(editingCard.id);
                      onSaved();
                      onClose();
                    } catch {
                      // ignore
                    }
                  }
                }}
                title="Delete card"
                aria-label="Delete card"
              >
                <Trash2 className="h-4 w-4" />
                Delete
              </button>
            )}
          </div>
          <div className="flex items-center gap-2">
            {error && (
              <p className="text-sm text-warn-foreground">{error}</p>
            )}
            <button type="button" className="btn-ghost" onClick={onClose}>
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
            >
              {saving
                ? "Saving…"
                : isEditing
                  ? "Save"
                  : "Create card"}
            </button>
          </div>
        </div>
      </div>
    </ModalShell>
  );
}

// ── Modal Shell ─────────────────────────────────────────────────────────────

function ModalShell({
  children,
  onClose,
}: {
  children: React.ReactNode;
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center"
      role="dialog"
      aria-modal="true"
    >
      <div
        className="absolute inset-0 bg-black/30"
        onClick={onClose}
        aria-hidden="true"
      />
      <div className="relative z-10 w-full max-w-lg rounded-lg border border-border bg-panel shadow-xl">
        <button
          type="button"
          className="btn-icon absolute right-2 top-2"
          onClick={onClose}
          title="Close"
          aria-label="Close"
        >
          <X className="h-4 w-4" />
        </button>
        {children}
      </div>
    </div>
  );
}

// ── Metric Step ────────────────────────────────────────────────────────────

interface MetricStepProps {
  metricSource: MetricSource;
  onMetricSourceChange: (s: MetricSource) => void;
  metrics: MetricData[];
  metricsLoading: boolean;
  onRefreshMetrics: () => void;
  selectedMetricId: number | null;
  onSelectMetric: (id: number) => void;
  views: LimsViewItem[];
  viewsLoading: boolean;
  onLoadViews: () => void;
  selectedViewId: number | null;
  onSelectView: (id: number) => void;
  selectedAggregate: string;
  onSelectAggregate: (fn: string) => void;
  selectedColumn: string | null;
  onSelectColumn: (col: string | null) => void;
  availableColumns: AvailableColumn[];
  columnsLoading: boolean;
  showColumnPicker: boolean;
}

function MetricStep({
  metricSource,
  onMetricSourceChange,
  metrics,
  metricsLoading,
  selectedMetricId,
  onSelectMetric,
  views,
  viewsLoading,
  onLoadViews,
  selectedViewId,
  onSelectView,
  selectedAggregate,
  onSelectAggregate,
  selectedColumn,
  onSelectColumn,
  availableColumns,
  columnsLoading,
  showColumnPicker,
}: MetricStepProps) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex gap-2">
        <button
          type="button"
          className={`lims-tab ${metricSource === "existing" ? "is-active" : ""}`}
          onClick={() => onMetricSourceChange("existing")}
        >
          Existing metric
        </button>
        <button
          type="button"
          className={`lims-tab ${metricSource === "new" ? "is-active" : ""}`}
          onClick={() => {
            onMetricSourceChange("new");
            onLoadViews();
          }}
        >
          Create new
        </button>
      </div>

      {metricSource === "existing" ? (
        <div className="flex flex-col gap-2">
          <label className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
            Select metric
          </label>
          {metricsLoading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : metrics.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No metrics found. Create one first.
            </p>
          ) : (
            <select
              className="w-full"
              value={selectedMetricId ?? ""}
              onChange={(e) => onSelectMetric(Number(e.target.value))}
            >
              <option value="" disabled>
                Choose a metric…
              </option>
              {metrics.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name || `${m.aggregate_function} — ${m.view_name}`}
                </option>
              ))}
            </select>
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {/* View Picker */}
          <div className="flex flex-col gap-1.5">
            <label className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
              View
            </label>
            {viewsLoading ? (
              <p className="text-sm text-muted-foreground">Loading views…</p>
            ) : (
              <select
                className="w-full"
                value={selectedViewId ?? ""}
                onChange={(e) => onSelectView(Number(e.target.value))}
              >
                <option value="" disabled>
                  Choose a View…
                </option>
                {views.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name}
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* Aggregate Picker */}
          <div className="flex flex-col gap-1.5">
            <label className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
              Aggregate
            </label>
            <select
              className="w-full"
              value={selectedAggregate}
              onChange={(e) => onSelectAggregate(e.target.value)}
            >
              {ALL_AGGREGATE_IDS.map((id) => (
                <option key={id} value={id}>
                  {AGGREGATE_LABELS[id] ?? id}
                </option>
              ))}
            </select>
          </div>

          {/* Column Picker */}
          {showColumnPicker && (
            <div className="flex flex-col gap-1.5">
              <label className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                Column
              </label>
              {!selectedViewId ? (
                <p className="text-sm text-muted-foreground">
                  Select a View first.
                </p>
              ) : columnsLoading ? (
                <p className="text-sm text-muted-foreground">
                  Loading columns…
                </p>
              ) : availableColumns.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No compatible columns for this aggregate.
                </p>
              ) : (
                <select
                  className="w-full"
                  value={selectedColumn ?? ""}
                  onChange={(e) =>
                    onSelectColumn(e.target.value || null)
                  }
                >
                  <option value="" disabled>
                    Choose a column…
                  </option>
                  {availableColumns.map((col) => (
                    <option key={col.key} value={col.key}>
                      {col.label}
                    </option>
                  ))}
                </select>
              )}
            </div>
          )}

          {!showColumnPicker && selectedViewId && (
            <p className="text-xs text-muted-foreground">
              Count does not require a column — it counts all rows in the
              View.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

// ── Display Step ───────────────────────────────────────────────────────────

interface DisplayStepProps {
  label: string;
  onLabelChange: (v: string) => void;
  icon: string;
  onIconChange: (v: string) => void;
}

function DisplayStep({
  label,
  onLabelChange,
  icon,
  onIconChange,
}: DisplayStepProps) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <label
          htmlFor="card-label"
          className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground"
        >
          Label
        </label>
        <input
          id="card-label"
          type="text"
          value={label}
          onChange={(e) => onLabelChange(e.target.value)}
          placeholder="e.g. In-progress entries"
        />
        <p className="text-xs text-muted-foreground">
          Leave empty to use the metric name.
        </p>
      </div>

      <div className="flex flex-col gap-1.5">
        <label className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
          Icon
        </label>
        <IconPicker value={icon} onChange={onIconChange} />
      </div>
    </div>
  );
}

// ── Formatting Step ────────────────────────────────────────────────────────

interface FormattingStepProps {
  formatting: FormattingConfig;
  onAddRule: () => void;
  onRemoveRule: (index: number) => void;
  onUpdateRule: (index: number, update: Partial<FormattingRule>) => void;
  onMoveRule: (index: number, direction: -1 | 1) => void;
  onUpdateDefault: (update: Partial<FormattingRule>) => void;
}

function FormattingStep({
  formatting,
  onAddRule,
  onRemoveRule,
  onUpdateRule,
  onMoveRule,
  onUpdateDefault,
}: FormattingStepProps) {
  return (
    <div className="flex flex-col gap-5">
      {/* Rules */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <label className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
            Rules
          </label>
          <button
            type="button"
            className="btn-ghost text-xs"
            onClick={onAddRule}
            title="Add rule"
            aria-label="Add rule"
          >
            <Plus className="h-3.5 w-3.5" />
            Add rule
          </button>
        </div>

        {formatting.rules.length === 0 ? (
          <p className="text-sm text-muted-foreground py-2">
            No rules. The default style will be used for all values.
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            {formatting.rules.map((rule, index) => (
              <RuleEditor
                key={index}
                rule={rule}
                index={index}
                total={formatting.rules.length}
                onChange={(u) => onUpdateRule(index, u)}
                onRemove={() => onRemoveRule(index)}
                onMoveUp={() => onMoveRule(index, -1)}
                onMoveDown={() => onMoveRule(index, 1)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Default Style */}
      <div className="flex flex-col gap-3 border-t border-hairline pt-4">
        <label className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
          Default style
        </label>
        <div className="flex flex-col gap-2">
          <div className="flex flex-col gap-1.5">
            <span className="text-xs text-muted-foreground">Colour</span>
            <ColorPicker
              value={formatting.default.color}
              onChange={(c) => onUpdateDefault({ color: c })}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <span className="text-xs text-muted-foreground">Icon</span>
            <IconPicker
              value={formatting.default.icon}
              onChange={(i) => onUpdateDefault({ icon: i })}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label
              htmlFor="default-text"
              className="text-xs text-muted-foreground"
            >
              Text
            </label>
            <input
              id="default-text"
              type="text"
              value={formatting.default.text ?? ""}
              onChange={(e) =>
                onUpdateDefault({
                  text: e.target.value || null,
                })
              }
              placeholder='Use {"{"}value{"}"} for the live value'
            />
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Rule Editor ────────────────────────────────────────────────────────────

interface RuleEditorProps {
  rule: FormattingRule;
  index: number;
  total: number;
  onChange: (update: Partial<FormattingRule>) => void;
  onRemove: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
}

function RuleEditor({
  rule,
  index,
  total,
  onChange,
  onRemove,
  onMoveUp,
  onMoveDown,
}: RuleEditorProps) {
  const colorToken = CARD_COLOR_TOKENS.includes(rule.color as CardColorToken)
    ? (rule.color as CardColorToken)
    : null;
  const colorClasses = colorToken ? CARD_COLOR_CLASSES[colorToken] : null;

  const iconDef = CARD_ICONS.find((i) => i.key === rule.icon);
  const IconComp = iconDef?.Icon;

  return (
    <div className="rounded border border-border bg-card p-3">
      <div className="flex items-center gap-2 mb-2">
        <span className="text-xs font-medium text-muted-foreground">
          Rule {index + 1}
        </span>
        <div className="flex-1" />
        <button
          type="button"
          className="btn-icon"
          onClick={onMoveUp}
          disabled={index === 0}
          title="Move up"
          aria-label="Move up"
        >
          <ChevronUp className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          className="btn-icon"
          onClick={onMoveDown}
          disabled={index === total - 1}
          title="Move down"
          aria-label="Move down"
        >
          <ChevronDown className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          className="btn-icon text-destructive"
          onClick={onRemove}
          title="Remove rule"
          aria-label="Remove rule"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="flex flex-col gap-2">
        {/* When */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground shrink-0">When</span>
          <select
            className="w-16 text-xs"
            value={rule.when.op}
            onChange={(e) =>
              onChange({
                when: {
                  ...rule.when,
                  op: e.target.value as ComparisonOp,
                },
              })
            }
          >
            {COMPARISON_OPS.map((op) => (
              <option key={op.value} value={op.value}>
                {op.label}
              </option>
            ))}
          </select>
          <input
            type="number"
            className="w-20 text-xs"
            value={rule.when.value}
            onChange={(e) =>
              onChange({
                when: { ...rule.when, value: Number(e.target.value) },
              })
            }
          />
        </div>

        {/* Style */}
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-1">
            <span className="text-xs text-muted-foreground">Colour</span>
            <select
              className="text-xs"
              value={rule.color ?? ""}
              onChange={(e) =>
                onChange({ color: e.target.value || undefined })
              }
            >
              <option value="">Default</option>
              {CARD_COLOR_TOKENS.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-1">
            <span className="text-xs text-muted-foreground">Icon</span>
            <select
              className="text-xs"
              value={rule.icon ?? ""}
              onChange={(e) =>
                onChange({ icon: e.target.value || undefined })
              }
            >
              <option value="">Default</option>
              {CARD_ICONS.map(({ key, label: lbl }) => (
                <option key={key} value={key}>
                  {lbl}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Text */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground shrink-0">
            Text
          </span>
          <input
            type="text"
            className="flex-1 text-xs"
            value={rule.text ?? ""}
            onChange={(e) =>
              onChange({ text: e.target.value || null })
            }
            placeholder='Use {"{"}value{"}"} for the live value'
          />
        </div>

        {/* Preview */}
        {(colorClasses || IconComp) && (
          <div className="flex items-center gap-2 mt-1">
            <span className="text-[10px] text-muted-foreground">Preview:</span>
            {colorClasses && (
              <span
                className={`h-3 w-3 rounded-sm ${colorClasses.bg}`}
                aria-hidden="true"
              />
            )}
            {IconComp && (
              <IconComp
                className="h-3 w-3 text-muted-foreground"
                aria-hidden="true"
              />
            )}
            {rule.text && (
              <span className="text-[10px] text-foreground">
                {rule.text.replace(/\{value\}/g, "42")}
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
