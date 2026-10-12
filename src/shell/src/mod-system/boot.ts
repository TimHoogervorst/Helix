export interface FrontendBootOperations<TBoot = unknown, TModules = unknown> {
  readBootData: () => Promise<TBoot>;
  importActive: (bootData: TBoot) => Promise<TModules>;
  registerActive: (modules: TModules, bootData: TBoot) => void;
  hydrate?: (modules: TModules, bootData: TBoot) => Promise<void>;
  resolveFrontend: () => void;
}

/** Run the frontend half of the maintenance-window boot barrier. */
export async function runFrontendBoot<TBoot, TModules>(
  operations: FrontendBootOperations<TBoot, TModules>,
): Promise<TBoot> {
  const bootData = await operations.readBootData();
  const modules = await operations.importActive(bootData);
  operations.registerActive(modules, bootData);
  await operations.hydrate?.(modules, bootData);
  operations.resolveFrontend();
  return bootData;
}
