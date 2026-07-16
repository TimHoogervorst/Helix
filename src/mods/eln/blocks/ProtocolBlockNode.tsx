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
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { NodeViewWrapper, type NodeViewProps } from "@tiptap/react";
import { Circle, CheckCircle, Plus, Loader } from "lucide-react";
import { get } from "../../../core/api/client";
import type { Protocol, ProtocolItem } from "../types";
import { useClickOutside } from "../../../shared/hooks/useClickOutside";
import type { BlockComponentProps } from "../../../core/mod-system/types";

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
  const [pickerPos, setPickerPos] = useState<{
    top: number;
    left: number;
  } | null>(null);
  const addBtnRef = useRef<HTMLButtonElement>(null);
  const pickerRef = useRef<HTMLDivElement>(null);

  // ── Fetch protocols when picker opens ─────────────────────────────────
  const handleOpenPicker = useCallback(async () => {
    setShowPicker(true);
    if (protocols.length === 0) {
      setLoading(true);
      try {
        // Fetch active protocols only
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

  // ── Position picker relative to the button ────────────────────────────
  useEffect(() => {
    if (!showPicker) {
      setPickerPos(null);
      return;
    }
    const recalc = () => {
      const btn = addBtnRef.current;
      if (!btn) return;
      const rect = btn.getBoundingClientRect();
      setPickerPos({
        top: rect.bottom + 4,
        left: rect.left,
      });
    };
    recalc();
    window.addEventListener("scroll", recalc, { capture: true, passive: true });
    window.addEventListener("resize", recalc, { passive: true });
    return () => {
      window.removeEventListener("scroll", recalc, { capture: true });
      window.removeEventListener("resize", recalc);
    };
  }, [showPicker]);

  // ── Close picker on outside click ─────────────────────────────────────
  useClickOutside(
    [addBtnRef, pickerRef],
    () => setShowPicker(false),
    showPicker,
  );

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
        <h2 className="font-serif text-2xl font-semibold tracking-tight">
          Protocol
        </h2>
        <div className="mt-3">
          <button
            ref={addBtnRef}
            type="button"
            className="inline-flex items-center gap-1.5 rounded-md border border-hairline bg-surface px-3 py-1.5 text-sm font-medium text-muted-foreground hover:bg-surface/80 hover:text-foreground transition-colors"
            onClick={handleOpenPicker}
            data-testid="add-protocol-btn"
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
            Add Protocol
          </button>
        </div>

        {/* ── Picker popover — portaled to body ──────────────────────── */}
        {showPicker &&
          pickerPos &&
          createPortal(
            <div
              ref={pickerRef}
              className="z-50 w-72 max-h-60 overflow-y-auto rounded-md border border-hairline bg-popover shadow-lg"
              style={{
                position: "fixed",
                top: pickerPos.top,
                left: pickerPos.left,
              }}
              data-testid="protocol-picker"
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
            </div>,
            document.body,
          )}
      </div>
    );
  }

  // ── Rendered card state ───────────────────────────────────────────────
  const stepCount = items.filter((item) => item.type === "step").length;
  let stepNumber = 0;

  return (
    <div className="my-4" data-testid="protocol-card">
      <h2 className="font-serif text-2xl font-semibold tracking-tight">
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
              <button
                type="button"
                className={`btn-icon mt-0.5 shrink-0 transition-colors ${
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
              </button>

              {/* Step content */}
              <div className="min-w-0 flex-1">
                <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
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

// ── Legacy NodeView wrapper (for existing TipTap node extensions) ───────

function ProtocolBlockNode(props: NodeViewProps) {
  const { node, updateAttributes } = props;

  // ── Read attrs from the TipTap node (source of truth) ─────────────────
  const protocolId = (node.attrs.protocolId as number | null) ?? null;
  const name = (node.attrs.name as string) || "Protocol";
  const items: ProtocolItem[] = (node.attrs.items as ProtocolItem[]) ?? [];
  const stepStates: Record<number, StepState> =
    (node.attrs.stepStates as Record<number, StepState>) ?? {};

  return (
    <NodeViewWrapper
      className="protocol-wrapper"
      contentEditable={false}
    >
      <ProtocolContent
        protocolId={protocolId}
        name={name}
        items={items}
        stepStates={stepStates}
        updateAttrs={updateAttributes}
      />
    </NodeViewWrapper>
  );
}

export default ProtocolBlockNode;

// ── New BlockComponentProps wrapper (for the slot system) ───────────────

/**
 * Slot-system block component for the ELN protocol.
 *
 * Receives `BlockComponentProps` (no NodeViewWrapper — BlockNodeView
 * provides one). Renders the same inner content as the legacy NodeView.
 */
export function ProtocolBlockComponent({ instance }: BlockComponentProps) {
  const attrs = instance.attrs as Record<string, unknown>;
  const protocolId = (attrs.protocolId as number | null) ?? null;
  const name = (attrs.name as string) || "Protocol";
  const items: ProtocolItem[] = (attrs.items as ProtocolItem[]) ?? [];
  const stepStates: Record<number, StepState> =
    (attrs.stepStates as Record<number, StepState>) ?? {};

  return (
    <ProtocolContent
      protocolId={protocolId}
      name={name}
      items={items}
      stepStates={stepStates}
      updateAttrs={instance.updateAttrs}
    />
  );
}
