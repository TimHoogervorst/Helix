/**
 * The only supported frontend import surface for Helix Mods.
 *
 * This module contains declarations and adapters only. Importing it never
 * creates a registry or registers a mod; Helix supplies the owner-bound
 * registrar to each mod's `register(mod)` function during boot.
 */
export type { Mod } from "../../shell/src/mod-system/Mod";
export {
  registrationId,
  ModelReference,
  ObjectReference,
  WorkspaceReference,
  SlotReference,
  ServiceReference,
  ActionReference,
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
  CurrentWorkspace,
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
