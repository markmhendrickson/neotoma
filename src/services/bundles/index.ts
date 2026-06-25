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
  bundleProviding,
  bundlesRootDir,
  buildRegistry,
  getBundleRegistry,
  getProvidedEntityTypes,
  loadBundlesFrom,
  resetBundleRegistryForTesting,
  resolveRequires,
  type BundleRegistry,
} from "./loader.js";
export {
  checkAutoCreateAllowed,
  type AutoCreateBlockReason,
  type AutoCreateDecision,
} from "./enforcement.js";
