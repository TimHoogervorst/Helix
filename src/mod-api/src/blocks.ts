/** Public adapter for translating platform block props to a mod component. */
export { createBlockAdapter } from "../../shell/src/mod-system/createBlockAdapter";
export type {
  ActionInvocationOutcome,
  ActionOutputBinding,
  ActionPortBinding,
  ActionStepContext,
  BlockComponentProps,
  BlockInstance,
} from "../../shell/src/mod-system/types";
export { PortableBlockView, resolvePortableActionContext } from "./portableBlocks";
export type {
  ActionInvocationRequest,
  InvocationOutcome,
  PortableActionContext,
  PortableActionStep,
  PortableBlockContent,
  PortableInputSource,
  PortableActionAvailability,
  PortableInputValueResolvers,
  TypedValue,
} from "./portableBlocks";
