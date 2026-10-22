import { Extension, Mark, Node } from "@tiptap/core";
import { NodeViewWrapper, ReactNodeViewRenderer, type NodeViewProps } from "@tiptap/react";
import { createContext, useContext } from "react";
import { PortableBlockView, type PortableBlockContent } from "../../../mod-api/src/portableBlocks";
import type { ActionInvocationRequest, ActionInvocationOutcome } from "../../../shell/src/mod-system/types";
import type { ActionContractDefinition } from "../../../mod-api/src/contracts";

export interface ElnPortableBlockHost {
  actionDefinitions: Readonly<Record<string, ActionContractDefinition>>;
  actionContext: (block: PortableBlockContent, stepId: string) => import("../../../mod-api/src/portableBlocks").PortableActionContext;
  buildInvocation: (block: PortableBlockContent, stepId: string) => ActionInvocationRequest;
  beforeInvoke: () => Promise<void>;
  invokeAction: (request: ActionInvocationRequest) => Promise<ActionInvocationOutcome>;
  invokeStep: (block: PortableBlockContent, stepId: string) => Promise<ActionInvocationOutcome>;
  providerOptions: (block: PortableBlockContent, stepId: string) => readonly { id: string; label: string }[];
  selectedProvider: (block: PortableBlockContent, stepId: string) => string | undefined;
  selectProvider: (block: PortableBlockContent, stepId: string, providerId: string) => void;
}

export const ElnPortableBlockHostContext = createContext<ElnPortableBlockHost | null>(null);

function PortableNodeView({ node }: NodeViewProps) {
  const source = node.attrs.source as Record<string, unknown> | null;
  const tag = typeof source?.type === "string" ? source.type : "unknown";
  const host = useContext(ElnPortableBlockHostContext);
  const attrs = source?.attrs && typeof source.attrs === "object"
    ? source.attrs as Record<string, unknown>
    : {};
  const candidate = attrs.portableBlock && typeof attrs.portableBlock === "object"
    ? attrs.portableBlock as unknown as PortableBlockContent
    : attrs as unknown as PortableBlockContent;
  const portableBlock = candidate.actionSequence
    ? { ...candidate, id: typeof candidate.id === "string" ? candidate.id : tag }
    : null;
  return (
    <NodeViewWrapper as={node.type.name === "elnPortableInline" ? "span" : "div"}
      contentEditable={false} data-eln-portable-block={tag}>
      {portableBlock?.actionSequence && host ? <PortableBlockView
        block={portableBlock}
        actionDefinitions={host.actionDefinitions}
        actionContext={(stepId) => host.actionContext(portableBlock, stepId)}
        buildInvocation={(stepId) => host.buildInvocation(portableBlock, stepId)}
        beforeInvoke={host.beforeInvoke}
        providerOptions={(stepId) => host.providerOptions(portableBlock, stepId)}
        selectedProvider={(stepId) => host.selectedProvider(portableBlock, stepId)}
        onSelectProvider={(stepId, providerId) => host.selectProvider(portableBlock, stepId, providerId)}
        invokeAction={host.invokeAction}
      /> : <details>
        <summary>Unsupported saved content · {tag}</summary>
        <pre>{JSON.stringify(source, null, 2)}</pre>
      </details>}
    </NodeViewWrapper>
  );
}

function portableNode(name: string, group: string, inline = false) {
  return Node.create({
    name,
    group,
    inline,
    atom: true,
    selectable: true,
    addAttributes() {
      return { source: { default: null } };
    },
    parseHTML() {
      return [{ tag: `[data-eln-portable-node="${name}"]` }];
    },
    renderHTML({ node }) {
      return ["span", { "data-eln-portable-node": name, "data-source": JSON.stringify(node.attrs.source) }];
    },
    addNodeView() {
      return ReactNodeViewRenderer(PortableNodeView);
    },
  });
}

export const PortableBlockNode = portableNode("elnPortableBlock", "block");
export const PortableInlineNode = portableNode("elnPortableInline", "inline", true);

/** Opaque carrier for exact marks whose rendering extension is unavailable. */
export const PortableMark = Mark.create({
  name: "elnPortableMark",
  inclusive: false,
  addAttributes() {
    return { source: { default: null } };
  },
  parseHTML() {
    return [{ tag: "span[data-eln-portable-mark]" }];
  },
  renderHTML({ mark }) {
    return ["span", { "data-eln-portable-mark": JSON.stringify(mark.attrs.source) }, 0];
  },
});

export const PortableNodeAttributes = Extension.create<{ types: string[] }>({
  name: "elnPortableNodeAttributes",
  addOptions() {
    return { types: [] };
  },
  addGlobalAttributes() {
    return [{
      types: this.options.types,
      attributes: { __elnPortableOriginalAttrs: { default: null, rendered: false } },
    }];
  },
});
