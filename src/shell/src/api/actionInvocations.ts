import { get, post } from "./client";
import type { ActionInvocationOutcome, ActionInvocationRequest } from "../mod-system/types";

/** Send a prepared scientific operation to the Platform-owned transaction boundary. */
export function invokePlatformAction(request: ActionInvocationRequest) {
  return post<ActionInvocationOutcome>("/action-invocations/", request);
}

/** Recover a committed result within the current actor and access scope. */
export function getPlatformActionInvocation(invocationId: string, signal?: AbortSignal) {
  return get<ActionInvocationOutcome>(
    `/action-invocations/${encodeURIComponent(invocationId)}/`,
    signal,
  );
}

/** Explicit unavailable state used when a renderer has no Action host. */
export function unavailableActionContext(reason = "This surface does not provide Action execution.") {
  return () => ({
    inputs: {},
    parameters: {},
    outputs: {},
    available: false,
    reason,
  });
}
