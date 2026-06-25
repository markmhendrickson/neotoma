/**
 * Bundles runtime public surface (Bundles m2).
 *
 * See `docs/foundation/bundles.md`. Plan `ent_089da2ecebc3bd804d63dcf2`.
 */

export type {
  BundleManifest,
  BundleSkillSpec,
  BundleType,
  LoadedBundle,
  RawBundleManifest,
} from "./types.js";
export { ManifestError, normalizeManifest, parseManifest } from "./manifest.js";
export {
  ALWAYS_ACTIVE_BUNDLES,
  BundleStateError,
  bundleProviding,
  bundleStatePath,
  bundlesRootDir,
  buildRegistry,
  getBundle,
  getBundleRegistry,
  getProvidedEntityTypes,
  isAlwaysActiveBundle,
  isBundleEnabled,
  listInstalledBundles,
  listInstalledBundleViews,
  loadBundlesFrom,
  resetBundleRegistryForTesting,
  resetBundleStateCacheForTesting,
  resolveRequires,
  setBundleEnabled,
  type BundleRegistry,
  type InstalledBundleState,
  type InstalledBundleView,
} from "./loader.js";
export {
  checkAutoCreateAllowed,
  type AutoCreateBlockReason,
  type AutoCreateDecision,
} from "./enforcement.js";
export {
  disableBundle,
  enableBundle,
  getBundleInfo,
  installBundle,
  listBundles,
  UnknownBundleError,
  type BundleActionResult,
  type BundleInfo,
} from "./activation.js";
