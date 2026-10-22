import { useState } from "react";
import type { ReactNode } from "react";
import type { ComponentType } from "react";
import type { ActionContractDefinition, ContractReference, ContractType } from "./contracts";
import { get, post } from "./api";
import type {
  ActionStepContext,
  ActionInvocationOutcome as PlatformInvocationOutcome,
  ActionInvocationRequest as PlatformInvocationRequest,
} from "../../shell/src/mod-system/types";

/** A value retained with the exact type notation that interprets it. */
export interface TypedValue {
  readonly type: ContractType;
  readonly value: unknown;
}

export type PortableInputSource =
  | { readonly kind: "literal"; readonly value: TypedValue }
  | {
      readonly kind: "record";
      readonly reference: {
        readonly mode: "current" | "exact";
        readonly entityId: string;
        readonly groupId?: string;
        readonly revisionId?: string;
        readonly fieldId?: string;
      };
    }
  | { readonly kind: "block"; readonly blockId: string; readonly path: readonly string[] }
  | { readonly kind: "step"; readonly stepId: string; readonly port: string };

/** One exact Action binding. Port maps come from the Action Contract. */
export interface PortableActionStep {
  readonly id: string;
  readonly action: { readonly kind: "action"; readonly id: string; readonly version: string };
  readonly inputs: Readonly<Record<string, PortableInputSource>>;
  readonly parameters: Readonly<Record<string, TypedValue>>;
  readonly targets: Readonly<Record<string, unknown>>;
  /** Actual results from a committed invocation, keyed by declared output port. */
  readonly outputs?: Readonly<Record<string, TypedValue>>;
}

export interface PortableBlockContent {
  /** Stable identity within its containing document. */
  readonly id: string;
  readonly content?: TypedValue;
  readonly actionSequence?: {
    /** Fingerprint of the retained complete sequence declaration. */
    readonly fingerprint: string;
    readonly steps: readonly PortableActionStep[];
  };
}

export type ActionInvocationRequest = PlatformInvocationRequest;
export type InvocationOutcome = PlatformInvocationOutcome;

/** Public readonly Block context resolved by the Platform host per step. */
export type PortableActionContext = ActionStepContext;

export type PortableActionContextResolver = (stepId: string) => PortableActionContext;

export interface PortableActionAvailability {
  readonly available: boolean;
  readonly provider?: string;
  readonly reason?: string;
}

export interface PortableInputValueResolvers {
  readonly record?: (source: Extract<PortableInputSource, { kind: "record" }>) => TypedValue | undefined;
  readonly block?: (source: Extract<PortableInputSource, { kind: "block" }>) => TypedValue | undefined;
}

function equalJson(left: unknown, right: unknown): boolean {
  if (left === right) return true;
  if (left === null || right === null || typeof left !== "object" || typeof right !== "object") return false;
  if (Array.isArray(left) || Array.isArray(right)) {
    return Array.isArray(left) && Array.isArray(right) && left.length === right.length && left.every((item, index) => equalJson(item, right[index]));
  }
  const leftObject = left as Record<string, unknown>;
  const rightObject = right as Record<string, unknown>;
  const leftKeys = Object.keys(leftObject).sort();
  const rightKeys = Object.keys(rightObject).sort();
  return leftKeys.length === rightKeys.length && leftKeys.every((key, index) => key === rightKeys[index] && equalJson(leftObject[key], rightObject[key]));
}

function freezeJson<T>(value: T): T {
  if (Array.isArray(value)) return Object.freeze(value.map((child) => freezeJson(child))) as T;
  if (value && typeof value === "object") {
    const copy = Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, child]) => [key, freezeJson(child)]));
    return Object.freeze(copy) as T;
  }
  return value;
}

/** Resolve one saved step into immutable, typed named ports for Block code. */
export function resolvePortableActionContext(
  block: PortableBlockContent,
  stepId: string,
  definitions: Readonly<Record<string, ActionContractDefinition>>,
  availability: PortableActionAvailability,
  resolvers: PortableInputValueResolvers = {},
): ActionStepContext {
  const steps = block.actionSequence?.steps ?? [];
  const stepIndex = steps.findIndex((step) => step.id === stepId);
  const step = stepIndex < 0 ? undefined : steps[stepIndex];
  if (!step) return freezeJson({ inputs: {}, parameters: {}, outputs: {}, available: false, reason: `Action step '${stepId}' is not saved on this Block.` });
  if (!block.actionSequence?.fingerprint || steps.filter((candidate) => candidate.id === stepId).length !== 1) {
    return freezeJson({ action: step.action, inputs: {}, parameters: {}, outputs: {}, available: false, reason: "The saved Action Sequence fingerprint or step identity is invalid." });
  }

  const definition = definitions[contractKey(step.action)];
  if (!definition) return freezeJson({
    action: step.action,
    inputs: {}, parameters: {}, outputs: {}, available: false,
    reason: `Exact Action definition ${step.action.id}@${step.action.version} is unavailable.`,
  });

  let reason = availability.reason;
  const unexpectedInputs = Object.keys(step.inputs).filter((port) => !(port in definition.inputs));
  const unexpectedParameters = Object.keys(step.parameters).filter((port) => !(port in definition.parameters));
  const unexpectedOutputs = Object.keys(step.outputs ?? {}).filter((port) => !(port in definition.outputs));
  if (unexpectedInputs.length) reason ??= `Saved inputs contain undeclared ports: ${unexpectedInputs.join(", ")}.`;
  if (unexpectedParameters.length) reason ??= `Saved parameters contain undeclared ports: ${unexpectedParameters.join(", ")}.`;
  if (unexpectedOutputs.length) reason ??= `Saved results contain undeclared output ports: ${unexpectedOutputs.join(", ")}.`;
  const declaredRoles = Array.isArray(definition.targets)
    ? definition.targets.filter((role): role is string => typeof role === "string")
    : Object.keys(definition.targets);
  const boundRoles = Object.keys(step.targets);
  if (declaredRoles.length && (declaredRoles.length !== boundRoles.length || declaredRoles.some((role) => !boundRoles.includes(role)))) {
    reason ??= "Saved target roles do not match the exact Action Contract.";
  }
  const inputs: Record<string, { type: unknown; value?: unknown; source?: unknown }> = {};
  for (const [port, type] of Object.entries(definition.inputs)) {
    const source = step.inputs[port];
    let typedValue: TypedValue | undefined;
    if (!source) {
      reason ??= `Required input '${port}' is not bound.`;
    } else if (source.kind === "literal") {
      typedValue = source.value;
    } else if (source.kind === "record") {
      if (source.reference.mode === "exact" && (!source.reference.groupId || !source.reference.revisionId)) {
        reason ??= `Exact Record Reference for input '${port}' is missing its group or Revision ID.`;
      }
      typedValue = resolvers.record?.(source);
    } else if (source.kind === "block") {
      typedValue = resolvers.block?.(source);
    } else {
      const producerIndex = steps.findIndex((candidate) => candidate.id === source.stepId);
      if (producerIndex < 0 || producerIndex >= stepIndex) {
        reason ??= `Input '${port}' must reference a preceding saved Action step.`;
      } else {
        typedValue = steps[producerIndex].outputs?.[source.port];
      }
    }
    if (source && !typedValue) reason ??= `Input '${port}' could not be resolved from its saved source.`;
    if (typedValue && !equalJson(typedValue.type, type)) reason ??= `Input '${port}' has a type incompatible with its exact Action Contract.`;
    inputs[port] = { type, value: typedValue?.value, source };
  }

  const parameters: Record<string, { type: unknown; value?: unknown }> = {};
  for (const [port, type] of Object.entries(definition.parameters)) {
    const value = step.parameters[port];
    if (!value) reason ??= `Required parameter '${port}' is not saved.`;
    if (value && !equalJson(value.type, type)) reason ??= `Parameter '${port}' has a type incompatible with its exact Action Contract.`;
    parameters[port] = { type, value: value?.value };
  }

  const outputs: Record<string, { type: unknown; declared: true; recorded?: unknown }> = {};
  for (const [port, type] of Object.entries(definition.outputs)) {
    const recorded = step.outputs?.[port];
    if (recorded && !equalJson(recorded.type, type)) reason ??= `Recorded output '${port}' does not match its retained Action Contract.`;
    outputs[port] = { type, declared: true, recorded: recorded?.value };
  }

  return freezeJson({
    action: step.action,
    inputs,
    parameters,
    outputs,
    available: availability.available && reason === undefined,
    ...(availability.provider ? { provider: availability.provider } : {}),
    ...(reason ? { reason } : {}),
  } as ActionStepContext & { provider?: string });
}

/** Execute through the Platform transaction boundary. */
export function invokeAction(request: ActionInvocationRequest): Promise<InvocationOutcome> {
  return post<InvocationOutcome>("/action-invocations/", request);
}

/** Recover an actor-scoped committed invocation through the Platform API. */
export function getActionInvocation(invocationId: string, signal?: AbortSignal) {
  return get<InvocationOutcome>(`/action-invocations/${encodeURIComponent(invocationId)}/`, signal);
}

export interface PortableBlockViewProps {
  readonly block: PortableBlockContent;
  readonly actionDefinitions?: Readonly<Record<string, ActionContractDefinition>>;
  readonly actionContext: PortableActionContextResolver;
  /** Build a request from the host's saved state and exact provider selection. */
  readonly buildInvocation: (stepId: string) => ActionInvocationRequest;
  readonly invokeAction: (request: ActionInvocationRequest) => Promise<InvocationOutcome>;
  /** Optional exact compatible viewer; Actions are rendered independently. */
  readonly viewer?: ComponentType<{ readonly value: TypedValue }>;
  /** Host callback must create a fresh instance using the registered preserve-list policy. */
  readonly onDuplicate?: () => void | Promise<void>;
  readonly duplicateReason?: string;
  readonly readOnly?: boolean;
}

function contractKey(reference: ContractReference): string {
  return `${reference.kind}:${reference.id}@${reference.version}`;
}

function renderGenericValue(value: unknown, key = "value"): ReactNode {
  if (value === null || typeof value !== "object") return <span>{String(value)}</span>;
  if (Array.isArray(value)) {
    return <ol>{value.map((child, index) => <li key={`${key}.${index}`}>{renderGenericValue(child, `${key}.${index}`)}</li>)}</ol>;
  }
  return <dl>{Object.entries(value as Record<string, unknown>).map(([name, child]) => (
    <div key={`${key}.${name}`}><dt>{name}</dt><dd>{renderGenericValue(child, `${key}.${name}`)}</dd></div>
  ))}</dl>;
}

/**
 * Platform-owned view for a retained Block when its specialized viewer is
 * absent. It inspects saved content and Action declarations without invoking
 * them; compatible Actions remain independently invokable by explicit click.
 */
export function PortableBlockView({
  block,
  actionDefinitions = {},
  actionContext,
  buildInvocation,
  invokeAction: runAction,
  viewer: Viewer,
  onDuplicate,
  duplicateReason = "No compatible fresh-instance duplication policy is available.",
  readOnly = false,
}: PortableBlockViewProps) {
  const [pendingStep, setPendingStep] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function invoke(stepId: string) {
    const context = actionContext(stepId);
    setPendingStep(stepId);
    setMessage(null);
    try {
      const outcome = await runAction(buildInvocation(stepId));
      setMessage(outcome.replayed ? `Recovered saved result for ${stepId}.` : `${stepId} completed and was saved.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : `Action ${stepId} failed.`);
    } finally {
      setPendingStep(null);
    }
  }

  return <article className="helix-portable-block" data-portable-block-id={block.id}>
    <h3>{block.id}</h3>
    {block.content && (Viewer
      ? <section aria-label="Specialized Block view"><Viewer value={block.content} /></section>
      : <section aria-label="Generic retained content">
          <p>Generic value · {JSON.stringify(block.content.type)}</p>
          {renderGenericValue(block.content.value)}
        </section>)}
    {!block.content && <p>No saved content.</p>}
    {block.actionSequence && <section aria-label="Action sequence">
      <p>Action Sequence · {block.actionSequence.fingerprint}</p>
      {block.actionSequence.steps.map((step) => {
        const context = actionContext(step.id);
        const definition = actionDefinitions[contractKey(step.action)];
        const declared = Object.keys(definition?.outputs ?? {});
        const recorded = Object.keys(step.outputs ?? {});
        return <article key={step.id} data-action-step={step.id}>
          <h4>{step.id} · {step.action.id}@{step.action.version}</h4>
          {context.provider && <p>Selected provider · {context.provider}</p>}
          <dl aria-label={`${step.id} named bindings`}>
            {Object.entries(context.inputs).map(([port, binding]) => <div key={`input.${port}`}>
              <dt>Input · {port}</dt>
              <dd>Type · {JSON.stringify(binding.type)}{binding.source !== undefined && <> · Source · {JSON.stringify(binding.source)}</>}{binding.value !== undefined && <> · Value · {JSON.stringify(binding.value)}</>}</dd>
            </div>)}
            {Object.entries(context.parameters).map(([port, binding]) => <div key={`parameter.${port}`}>
              <dt>Parameter · {port}</dt>
              <dd>Type · {JSON.stringify(binding.type)}{binding.value !== undefined && <> · Value · {JSON.stringify(binding.value)}</>}</dd>
            </div>)}
          </dl>
          <p>Declared output{declared.length === 1 ? "" : "s"} · {declared.join(", ") || "Unavailable exact Action definition"}</p>
          {definition && <>
            <p>Declared target roles · {JSON.stringify(definition.targets)}</p>
            <p>Promised effects · {JSON.stringify(definition.effects)}</p>
          </>}
          <p>Recorded result{recorded.length === 1 ? "" : "s"} · {recorded.join(", ") || "None saved"}</p>
          {step.outputs && <pre>{JSON.stringify(step.outputs, null, 2)}</pre>}
          {!context.available && <p role="status">Action unavailable. {context.reason ?? "No compatible provider is selected."}</p>}
          <button
            type="button"
            disabled={readOnly || !context.available || pendingStep !== null}
            onClick={() => void invoke(step.id)}
          >{pendingStep === step.id ? "Running…" : `Run ${step.id}`}</button>
        </article>;
      })}
    </section>}
    <section aria-label="Block duplication">
      <button type="button" disabled={readOnly || !onDuplicate} title={!onDuplicate ? duplicateReason : undefined}
        onClick={() => void onDuplicate?.()}>
        Duplicate Block
      </button>
      {!onDuplicate && <p role="status">Duplication unavailable. {duplicateReason}</p>}
    </section>
    {message && <p role="status">{message}</p>}
  </article>;
}
