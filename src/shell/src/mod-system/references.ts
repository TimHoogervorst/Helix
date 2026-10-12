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

  constructor(modId: string, workspace: string) {
    super(modId, workspace);
  }

  get vendor(): string {
    return this.modId.split(".")[0];
  }

  get mod(): string {
    return this.modId.split(".").slice(1).join(".");
  }

  get workspace(): string {
    return this.localKey;
  }

  /** The collision-safe URL for an item owned by this workspace. */
  urlFor(displayId: string): string {
    return workspaceUrl(this, displayId);
  }
}

/** Canonical workspace URLs are independent of a mod's legacy route name. */
export function workspaceUrl(reference: WorkspaceReference, displayId: string): string {
  const segment = (value: string) => value.startsWith(":") ? value : encodeURIComponent(value);
  return ["", "w", reference.vendor, reference.mod, reference.workspace, displayId]
    .map(segment)
    .join("/");
}

/** The pre-638 first-party URL, retained only for bookmark redirects. */
export function legacyWorkspaceUrl(reference: WorkspaceReference, displayId: string): string {
  const segment = (value: string) => value.startsWith(":") ? value : encodeURIComponent(value);
  return `/${segment(reference.workspace)}/${segment(displayId)}`;
}

/** External standalone routes must not occupy the global first path segment. */
export function externalRoutePath(modId: string, path: string): string {
  const [vendor, ...modParts] = modId.split(".");
  const mod = modParts.join(".");
  const suffix = path.startsWith("/") ? path : `/${path}`;
  return `/mods/${vendor}/${mod}${suffix}`;
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
