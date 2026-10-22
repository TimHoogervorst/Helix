// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PortableBlockView, resolvePortableActionContext } from "../src/portableBlocks";
import type { ActionInvocationRequest, PortableBlockContent } from "../src/portableBlocks";

const block: PortableBlockContent = {
  id: "fixture.measurement-1",
  content: {
    type: { type: "object", fields: { note: { type: "string" } } },
    value: { note: "Retained annotation" },
  },
  actionSequence: {
    fingerprint: "sequence-v1",
    steps: [{
      id: "calculate",
      action: { kind: "action", id: "fixture.science.calculate", version: "1.0.0" },
      inputs: { measurement: { kind: "literal", value: { type: { type: "number" }, value: 4 } } },
      parameters: {},
      targets: { record: "record-1" },
      outputs: { result: { type: { type: "number" }, value: 8 } },
    }],
  },
};

const request: ActionInvocationRequest = {
  invocationId: "invocation-1",
  sequenceFingerprint: "sequence-v1",
  inputs: { measurement: 4 },
  parameters: {},
  targets: { record: "record-1" },
  expectedState: { record: { stateToken: "state-1", revisionId: "revision-1", schemaState: "schema-1" } },
  providers: { action: "fixture.science.calculate" },
};

const actionDefinitions = {
  "action:fixture.science.calculate@1.0.0": {
    inputs: { measurement: { type: "number" } },
    parameters: {},
    outputs: { result: { type: "number" } as const },
    targets: {},
    effects: {},
  },
} as const;

describe("PortableBlockView", () => {
  afterEach(cleanup);

  it("shows retained content and distinguishes expected outputs from recorded results without a viewer", () => {
    render(<PortableBlockView
      block={block}
      actionDefinitions={actionDefinitions}
      actionContext={() => ({ inputs: {}, parameters: {}, outputs: {}, available: false, reason: "No compatible provider is installed." })}
      buildInvocation={() => request}
      invokeAction={vi.fn()}
    />);

    expect(screen.getByText("fixture.measurement-1")).toBeTruthy();
    expect(screen.getByText("Retained annotation")).toBeTruthy();
    expect(screen.getByText(/Declared output/)).toBeTruthy();
    expect(screen.getByText(/Recorded result/)).toBeTruthy();
    expect(screen.getByText(/No compatible provider is installed/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Duplicate Block" }).hasAttribute("disabled")).toBe(true);
    expect(screen.getByText(/Duplication unavailable/)).toBeTruthy();
  });

  it("keeps the action available with generic inspection and invokes only on explicit request", async () => {
    const invokeAction = vi.fn().mockResolvedValue({ actionId: "action-1", replayed: false });
    render(<PortableBlockView
      block={block}
      actionDefinitions={actionDefinitions}
      actionContext={() => ({ inputs: {}, parameters: {}, outputs: {}, available: true, provider: "fixture.calc/2.0.0" })}
      buildInvocation={() => request}
      invokeAction={invokeAction}
    />);

    expect(invokeAction).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Run calculate" }));
    await waitFor(() => expect(invokeAction).toHaveBeenCalledWith(request));
  });

  it("flushes first and retries an uncertain invocation with the same request", async () => {
    const beforeInvoke = vi.fn().mockResolvedValue(undefined);
    const buildInvocation = vi.fn().mockReturnValue(request);
    const invokeAction = vi.fn()
      .mockRejectedValueOnce(new Error("response lost"))
      .mockResolvedValueOnce({ actionId: "action-1", replayed: true });
    render(<PortableBlockView
      block={block}
      actionDefinitions={actionDefinitions}
      actionContext={() => ({ inputs: {}, parameters: {}, outputs: {}, available: true })}
      beforeInvoke={beforeInvoke}
      buildInvocation={buildInvocation}
      invokeAction={invokeAction}
    />);

    fireEvent.click(screen.getByRole("button", { name: "Run calculate" }));
    await waitFor(() => expect(invokeAction).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByRole("button", { name: "Run calculate" }));
    await waitFor(() => expect(invokeAction).toHaveBeenCalledTimes(2));
    expect(beforeInvoke).toHaveBeenCalledTimes(1);
    expect(buildInvocation).toHaveBeenCalledTimes(1);
    expect(invokeAction.mock.calls.map(([payload]) => payload)).toEqual([request, request]);
    expect(await screen.findByText(/Recovered saved result/)).toBeTruthy();
  });

  it("does not invoke when flushing pending edits fails", async () => {
    const invokeAction = vi.fn();
    render(<PortableBlockView
      block={block}
      actionDefinitions={actionDefinitions}
      actionContext={() => ({ inputs: {}, parameters: {}, outputs: {}, available: true })}
      beforeInvoke={vi.fn().mockRejectedValue(new Error("stale save"))}
      buildInvocation={() => request}
      invokeAction={invokeAction}
    />);

    fireEvent.click(screen.getByRole("button", { name: "Run calculate" }));
    expect(await screen.findByText("stale save")).toBeTruthy();
    expect(invokeAction).not.toHaveBeenCalled();
  });

  it("resolves immutable named ports and keeps declared output separate from the saved result", () => {
    const context = resolvePortableActionContext(
      block,
      "calculate",
      actionDefinitions,
      { available: true, provider: "fixture.calc/2.0.0" },
    );

    expect(context.available).toBe(true);
    expect(context.provider).toBe("fixture.calc/2.0.0");
    expect(context.inputs.measurement).toEqual({
      type: { type: "number" }, value: 4,
      source: { kind: "literal", value: { type: { type: "number" }, value: 4 } },
    });
    expect(context.outputs.result).toEqual({ type: { type: "number" }, declared: true, recorded: 8 });
    expect(Object.isFrozen(context.inputs.measurement)).toBe(true);
  });

  it("resolves saved Block paths and exact Platform Record fields through host resolvers", () => {
    const bound: PortableBlockContent = {
      ...block,
      actionSequence: {
        ...block.actionSequence!,
        steps: [{
          ...block.actionSequence!.steps[0],
          inputs: {
            measurement: { kind: "record", reference: { mode: "exact", entityId: "record-2", groupId: "group-2", revisionId: "revision-2", fieldId: "amount" } },
          },
        }],
      },
    };
    const context = resolvePortableActionContext(bound, "calculate", actionDefinitions, { available: true }, {
      record: (source) => source.reference.revisionId === "revision-2"
        ? { type: { type: "number" }, value: 12 }
        : undefined,
      block: (source) => source.blockId === "source-block" && source.path.join(".") === "result.value"
        ? { type: { type: "number" }, value: 12 }
        : undefined,
    });

    expect(context.available).toBe(true);
    expect(context.inputs.measurement.value).toBe(12);

    const blockBound: PortableBlockContent = {
      ...bound,
      actionSequence: {
        ...bound.actionSequence!,
        steps: [{
          ...bound.actionSequence!.steps[0],
          inputs: { measurement: { kind: "block", blockId: "source-block", path: ["result", "value"] } },
        }],
      },
    };
    const fromBlock = resolvePortableActionContext(blockBound, "calculate", actionDefinitions, { available: true }, {
      block: (source) => source.blockId === "source-block" && source.path.join(".") === "result.value"
        ? { type: { type: "number" }, value: 12 }
        : undefined,
    });
    expect(fromBlock.available).toBe(true);
    expect(fromBlock.inputs.measurement.value).toBe(12);
  });

  it("fails closed when a saved step reads from a later step", () => {
    const invalidBlock: PortableBlockContent = {
      id: "forward-reference",
      actionSequence: {
        fingerprint: "invalid-sequence",
        steps: [{
          id: "calculate",
          action: { kind: "action", id: "fixture.science.calculate", version: "1.0.0" },
          inputs: { measurement: { kind: "step", stepId: "later", port: "result" } },
          parameters: {}, targets: {},
        }, {
          id: "later",
          action: { kind: "action", id: "fixture.science.calculate", version: "1.0.0" },
          inputs: { measurement: { kind: "literal", value: { type: { type: "number" }, value: 2 } } },
          parameters: {}, targets: {},
        }],
      },
    };
    const context = resolvePortableActionContext(
      invalidBlock,
      "calculate",
      actionDefinitions,
      { available: true },
    );

    expect(context.available).toBe(false);
    expect(context.reason).toMatch(/preceding saved Action step/);
  });

  it("fails closed when a concrete input type differs from the exact Action port", () => {
    const incompatible: PortableBlockContent = {
      ...block,
      actionSequence: {
        ...block.actionSequence!,
        steps: [{
          ...block.actionSequence!.steps[0],
          inputs: { measurement: { kind: "literal", value: { type: { type: "string" }, value: "four" } } },
        }],
      },
    };
    const context = resolvePortableActionContext(
      incompatible,
      "calculate",
      actionDefinitions,
      { available: true, provider: "fixture.calc/2.0.0" },
    );

    expect(context.available).toBe(false);
    expect(context.reason).toMatch(/type incompatible/);
  });
});
