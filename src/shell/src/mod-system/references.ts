/** Canonical identity helpers shared by public frontend registrations. */
const MOD_ID = /^[a-z][a-z0-9]*(?:\.[a-z][a-z0-9]*)+$/;
const LOCAL_KEY = /^[a-z][a-z0-9]*(?:[-.]?[a-z0-9]+)*$/;

export function registrationId(modId: string, localKey: string): string {
  if (!MOD_ID.test(modId)) {
    throw new Error(`Invalid mod ID '${modId}'; expected lowercase vendor.name.`);
  }
  if (!LOCAL_KEY.test(localKey)) {
    throw new Error(`Invalid registration key '${localKey}'; expected lowercase ASCII key.`);
  }
  return `${modId}:${localKey}`;
}

export abstract class TypedReference {
  readonly id: string;

  protected constructor(
    readonly modId: string,
    readonly localKey: string,
  ) {
    this.id = registrationId(modId, localKey);
  }
}

export class ModelReference extends TypedReference {
  readonly kind = "model" as const;
}

export class ObjectReference extends TypedReference {
  readonly kind = "object" as const;

  constructor(
    readonly model: ModelReference,
    readonly objectId: string,
  ) {
    super(model.modId, model.localKey);
  }

  get objectReferenceId(): string {
    return `${this.id}:${this.objectId}`;
  }
}

export class WorkspaceReference extends TypedReference {
  readonly kind = "workspace" as const;
}

export class SlotReference extends TypedReference {
  readonly kind = "slot" as const;
}

export class ServiceReference extends TypedReference {
  readonly kind = "service" as const;
}

export class ActionReference extends TypedReference {
  readonly kind = "action" as const;
}
