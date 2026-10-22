/**
 * The only supported frontend import surface for Helix Mods.
 *
 * This module contains declarations and adapters only. Importing it never
 * creates a registry or registers a mod; Helix supplies the owner-bound
 * registrar to each mod's `register(mod)` function during boot.
 */
export type { Mod } from "../../shell/src/mod-system/Mod";
export { Button } from "../../shell/src/shared/primitives/Button";
export { IconButton } from "../../shell/src/shared/primitives/IconButton";
export { Menu } from "../../shell/src/shared/primitives/Menu";
export { ButtonGroupRenderer } from "../../shell/src/workspace/ButtonGroupRenderer";
export { SlotSidebar } from "../../shell/src/shared/components/Sidebar/SlotSidebar";
export { TipTapRenderer } from "../../shell/src/workspace/TipTapRenderer";
export {
  registrationId,
  ModelReference,
  ObjectReference,
  WorkspaceReference,
  SlotReference,
  ServiceReference,
  ActionReference,
  workspaceUrl,
  legacyWorkspaceUrl,
  externalRoutePath,
} from "../../shell/src/mod-system/references";
export { BlockEvent } from "../../shell/src/mod-system/BlockEvent";
export {
  parseFormula,
  evaluateFormula,
  evaluateCellFormula,
  evaluateRow,
  functionCallsIn,
  unimplementedFormulaFunctionsIn,
  usesBackendOnlyFunction,
} from "../../shell/src/shared/formulas/formulaEngine";
export type {
  FormulaValue,
  FormulaError,
  FormulaErrorCode,
  FormulaResult,
  FormulaRow,
  FormulaTableContext,
  FormulaColumn,
  EvaluatedRow,
  FormulaFunctionImplementation,
  FormulaAst,
} from "../../shell/src/shared/formulas/formulaEngine";
export {
  get,
  getText,
  post,
  put,
  patch,
  del,
  isNotFoundError,
  ApiError,
  NetworkError,
} from "../../shell/src/api/client";
export type {
  ModManifest,
  ModDependency,
  BlockHandle,
  SlotHandle,
  ButtonHandle,
  HubConfig,
  SettingsSectionConfig,
  SchemaComponentProps,
  SchemaComponentRegistration,
  RouteConfig,
  ServiceConfig,
  MetricProviderConfig,
  CurrentWorkspace,
  WorkspaceConfig,
  WorkspaceEventPayload,
  BlockRegistration,
  ButtonRegistration,
  SlotDeclaration,
  SlotBinding,
  BlockComponentProps,
  BlockInstance,
  SlotContext,
  ActionCatalogEntry,
  RendererProps,
  BaseBinding,
  BlockBinding,
  ButtonBinding,
  IconLibraryEntry,
  ColorToken,
} from "../../shell/src/mod-system/types";
export {
  canonicalizeContractJson,
  canonicalJson,
  contractFingerprint,
  isExactJsonNumber,
  parseExactContractJson,
} from "./contracts";
export {
  exportPlatformRecord,
  getExactRecordRevision,
  getPlatformRecord,
  listPlatformRecords,
  listRecordActivity,
  listRecordGroupRevisions,
  RecordValueInspector,
  UnavailableRecordCapability,
} from "./records";
export type {
  PlatformRecord,
  RecordActivity,
  RecordExport,
  RecordPage,
  RecordQuery,
  RecordRevision,
  RecordValueInspectorProps,
} from "./records";
export type {
  ActionContractDefinition,
  ActionContractEnvelope,
  CanonicalJsonValue,
  ContractEnvelope,
  ContractKind,
  ContractNumber,
  ContractReference,
  ContractType,
  DataContractDefinition,
  DataContractEnvelope,
  ExactJsonNumber,
} from "./contracts";
export type {
  ActionOutputBinding,
  ActionPortBinding,
  ActionStepContext,
  ActionInvocationOutcome,
} from "../../shell/src/mod-system/types";
export {
  getActionInvocation,
  invokeAction,
  PortableBlockView,
  resolvePortableActionContext,
} from "./portableBlocks";
export type {
  ActionInvocationRequest,
  InvocationOutcome,
  PortableActionContext,
  PortableActionContextResolver,
  PortableActionAvailability,
  PortableInputValueResolvers,
  PortableActionStep,
  PortableBlockContent,
  PortableBlockViewProps,
  PortableInputSource,
  TypedValue,
} from "./portableBlocks";

export interface EntityReference {
  readonly type: "entity-reference";
  readonly displayId: string;
  readonly schemaId?: number;
}

export function entityReference(displayId: string, schemaId?: number): EntityReference {
  return schemaId === undefined
    ? { type: "entity-reference", displayId }
    : { type: "entity-reference", displayId, schemaId };
}

/** Create a reference payload suitable for a schema column or editor node. */
export function schemaReference(schemaId: number, displayId: string): EntityReference {
  return entityReference(displayId, schemaId);
}
