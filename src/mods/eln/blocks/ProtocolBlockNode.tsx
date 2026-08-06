/**
 * React NodeView for the elnProtocol TipTap node.
 *
 * Three states:
 * 1. **Placeholder** (protocolId === null): "Protocol" heading + "Add Protocol"
 *    button that opens a picker dropdown.
 * 2. **Picker open**: a popover lists active protocols fetched from the API.
 *    Selecting one snapshots its name and items into the node.
 * 3. **Rendered card**: protocol name as `<h2>`, ordered list of items —
 *    steps with toggleable circle/check icons and completion timestamps,
 *    notes without checkboxes, visually distinct.
 */
import { useCallback, useState } from "react";
import { createBlockAdapter } from "../../../shell/src/mod-system/createBlockAdapter";
import { Circle, CheckCircle, Plus, Loader } from "lucide-react";
import { get } from "../../../shell/src/api/client";
import type { Protocol, ProtocolItem } from "../types";
import { usePickerPortal } from "../../../shell/src/shared/hooks/usePickerPortal";
import { PickerPortal } from "../../../shell/src/shared/components/PickerPortal";
import { IconButton } from "../../../shell/src/shared/primitives/IconButton";

// ── Types ───────────────────────────────────────────────────────────────

export interface StepState {
  completed: boolean;
  completedAt?: string; // ISO 8601 timestamp
}

interface ProtocolContentProps {
  protocolId: number | null;
  name: string;
  items: ProtocolItem[];
  stepStates: Record<number, StepState>;
  updateAttrs: (attrs: Record<string, unknown>) => void;
}

// ── Helpers ─────────────────────────────────────────────────────────────

/** Format an ISO timestamp to a short time string like "14:22". */
function formatTime(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
  } catch {
    return "";
  }
}

/** Pad a 1-based index to two digits: 1 → "01", 12 → "12". */
function padStepNumber(n: number): string {
  return String(n).padStart(2, "0");
}

// ── Inner Content Component (shared by old + new wrappers) ──────────────

/**
 * Pure rendering logic for the protocol block.
 *
 * Decoupled from TipTap's NodeViewWrapper so it can be reused by both
 * the legacy `ProtocolBlockNode` (NodeViewProps → NodeViewWrapper) and
 * the new `ProtocolBlockComponent` (BlockComponentProps, no wrapper —
 * BlockNodeView provides it).
 */
export function ProtocolContent({
  protocolId,
  name,
  items,
  stepStates,
  updateAttrs,
}: ProtocolContentProps) {
  // ── Picker state ──────────────────────────────────────────────────────
  const [showPicker, setShowPicker] = useState(false);
  const [protocols, setProtocols] = useState<Protocol[]>([]);
  const [loading, setLoading] = useState(false);

  const { triggerRef, panelRef, position } = usePickerPortal({
    open: showPicker,
    onClose: () => setShowPicker(false),
  });

  // ── Fetch protocols when picker opens ─────────────────────────────────
  const handleOpenPicker = useCallback(async () => {
    setShowPicker(true);
    if (protocols.length === 0) {
      setLoading(true);
      try {
        const data = await get<{ results: Protocol[] }>(
          "/eln/protocols/?is_active=true",
        );
        setProtocols(data.results);
      } catch {
        // silently leave list empty
      } finally {
        setLoading(false);
      }
    }
  }, [protocols.length]);

  // ── Select a protocol → snapshot into node attrs ──────────────────────
  const handleSelectProtocol = useCallback(
    (protocol: Protocol) => {
      updateAttrs({
        protocolId: protocol.id,
        name: protocol.name,
        items: protocol.items,
        stepStates: {},
      });
      setShowPicker(false);
    },
    [updateAttrs],
  );

  // ── Toggle step completion ────────────────────────────────────────────
  const handleToggleStep = useCallback(
    (index: number) => {
      const current = stepStates[index];
      const wasCompleted = current?.completed ?? false;

      if (wasCompleted) {
        // Uncheck: clear the entry from stepStates entirely
        const { [index]: _, ...rest } = stepStates;
        updateAttrs({ stepStates: rest });
      } else {
        // Check: set completed with ISO 8601 timestamp
        const updated: Record<number, StepState> = {
          ...stepStates,
          [index]: { completed: true, completedAt: new Date().toISOString() },
        };
        updateAttrs({ stepStates: updated });
      }
    },
    [stepStates, updateAttrs],
  );

  // ── Placeholder state ─────────────────────────────────────────────────
  if (protocolId === null) {
    return (
      <div
        className="rounded-lg border border-hairline bg-panel p-4"
        data-testid="protocol-placeholder"
      >
        <h2 className="font-[var(--font-label)] text-2xl font-semibold tracking-tight">
          Protocol
        </h2>
        <div className="mt-3">
          <button
            ref={triggerRef}
            type="button"
            className="inline-flex items-center gap-1.5 rounded-md border border-hairline bg-surface px-3 py-1.5 text-sm font-medium text-muted-foreground hover:bg-surface/80 hover:text-foreground transition-colors"
            onClick={handleOpenPicker}
            data-testid="add-protocol-btn"
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
            Add Protocol
          </button>
        </div>

        {/* ── Picker popover ────────────────────────────────────────── */}
        {showPicker && (
          <PickerPortal
            position={position}
            panelRef={panelRef}
            testId="protocol-picker"
          >
            {loading ? (
              <div className="flex items-center justify-center gap-2 px-3 py-4 text-sm text-muted-foreground">
                <Loader className="h-4 w-4 animate-spin" aria-hidden="true" />
                Loading protocols…
              </div>
            ) : protocols.length === 0 ? (
              <div className="px-3 py-4 text-sm text-muted-foreground">
                No protocols available. Create one in Settings → Protocols.
              </div>
            ) : (
              protocols.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  className="w-full px-3 py-2 text-left text-sm text-foreground hover:bg-surface/60 transition-colors first:rounded-t-md last:rounded-b-md"
                  onClick={() => handleSelectProtocol(p)}
                  data-testid={`protocol-option-${p.id}`}
                >
                  {p.name}
                </button>
              ))
            )}
          </PickerPortal>
        )}
      </div>
    );
  }

  // ── Rendered card state ───────────────────────────────────────────────
  const stepCount = items.filter((item) => item.type === "step").length;
  let stepNumber = 0;

  return (
    <div className="my-4" data-testid="protocol-card">
      <h2 className="font-[var(--font-label)] text-2xl font-semibold tracking-tight">
        {name}
      </h2>
      <ol className="mt-4 space-y-2">
        {items.map((item, index) => {
          if (item.type === "note") {
            return (
              <li
                key={index}
                className="rounded-md border border-hairline bg-panel px-3 py-2.5"
                data-testid={`protocol-note-${index}`}
              >
                <p className="text-[14px] leading-relaxed text-muted-foreground italic">
                  {item.text}
                </p>
              </li>
            );
          }

          // Step item
          stepNumber++;
          const stepIndex = stepNumber - 1;
          const state = stepStates[stepIndex];
          const completed = state?.completed ?? false;
          const completedAt = state?.completedAt;

          return (
            <li
              key={index}
              className={`flex items-start gap-3 rounded-md border border-hairline bg-panel px-3 py-2.5 transition-colors ${
                completed ? "border-hairline/50" : ""
              }`}
              data-testid={`protocol-step-${stepIndex}`}
            >
              {/* Toggle button — ghost icon-only */}
              <IconButton
                className={`mt-0.5 shrink-0 ${
                  completed
                    ? "text-success hover:text-success/80"
                    : "text-muted-foreground hover:text-foreground"
                }`}
                onClick={() => handleToggleStep(stepIndex)}
                aria-label={
                  completed
                    ? `Mark step ${stepNumber} incomplete`
                    : `Mark step ${stepNumber} complete`
                }
                data-testid={`step-toggle-${stepIndex}`}
              >
                {completed ? (
                  <CheckCircle className="h-5 w-5" aria-hidden="true" />
                ) : (
                  <Circle className="h-5 w-5" aria-hidden="true" />
                )}
              </IconButton>

              {/* Step content */}
              <div className="min-w-0 flex-1">
                <div className="text-[10px] font-[var(--font-label)] uppercase tracking-widest text-muted-foreground">
                  Step {padStepNumber(stepNumber)}
                  {completed && completedAt && (
                    <span className="ml-2 text-success-foreground">
                      ✓ complete · {formatTime(completedAt)}
                    </span>
                  )}
                </div>
                <p
                  className={`text-[14px] leading-relaxed ${
                    completed
                      ? "line-through decoration-muted-foreground/40 text-muted-foreground/60"
                      : ""
                  }`}
                >
                  {item.text}
                </p>
              </div>
            </li>
          );
        })}
      </ol>
      {/* Only show the step count if there's at least one step */}
      {stepCount === 0 && items.length > 0 && (
        <p className="mt-3 text-xs text-muted-foreground italic">
          This protocol has notes only.
        </p>
      )}
      {items.length === 0 && (
        <p className="mt-3 text-xs text-muted-foreground italic">
          This protocol has no items.
        </p>
      )}
    </div>
  );
}
/**
 * Slot-system block component for the ELN protocol.
 *
 * Receives `BlockComponentProps` (no NodeViewWrapper — BlockNodeView
 * provides one). Renders the same inner content as the legacy NodeView.
 */
export const ProtocolBlockComponent = createBlockAdapter(
  ProtocolContent,
  ({ instance }) => {
    const attrs = instance.attrs as Record<string, unknown>;
    return {
      protocolId: (attrs.protocolId as number | null) ?? null,
      name: (attrs.name as string) || "Protocol",
      items: (attrs.items as ProtocolItem[]) ?? [],
      stepStates:
        (attrs.stepStates as Record<number, StepState>) ?? {},
      updateAttrs: instance.updateAttrs,
    };
  },
);
