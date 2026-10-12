/** The build-time catalog shared by Django and the Vite composition step. */
export interface ModCatalogArtifact {
  locator: string;
  hash: string;
  distribution?: string;
  distributionVersion: string;
  djangoLabel?: string;
  frontendImportSpecifier?: string;
}

export interface ModCatalogRecord {
  manifest: {
    id: string;
    displayName: string;
    version: string;
    requiresHelix: string;
    artifacts: ("frontend" | "backend")[];
    dependsOn: { id: string; version: string }[];
    description?: string;
  };
  tier: "Bundled" | "External";
  artifacts: Partial<Record<"frontend" | "backend", ModCatalogArtifact>>;
}

export interface ModCatalog {
  catalogVersion: 1;
  installationFingerprint: string;
  mods: ModCatalogRecord[];
}

/**
 * Fail before importing registration code when the deployment catalog does
 * not match the installation fingerprint supplied by the build tool.
 */
export function assertFreshCatalog(
  catalog: ModCatalog,
  installedFingerprint: string,
): void {
  if (catalog.installationFingerprint !== installedFingerprint) {
    throw new Error("Mod Catalog installation fingerprint is stale.");
  }
}

/** Read a catalog from build-time JSON and verify the installed fingerprint. */
export function parseCatalog(
  value: unknown,
  installedFingerprint: string,
): ModCatalog {
  if (!value || typeof value !== "object") {
    throw new Error("Mod Catalog is not an object.");
  }
  const catalog = value as ModCatalog;
  if (catalog.catalogVersion !== 1 || !Array.isArray(catalog.mods)) {
    throw new Error("Unsupported Mod Catalog version.");
  }
  assertFreshCatalog(catalog, installedFingerprint);
  return catalog;
}
