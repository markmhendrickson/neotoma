import { createLegacyConfiguration } from "./core/legacy_configuration.js";
import { getEmbeddedRuntimeContext } from "./core/runtime_context.js";

export type NeotomaConfiguration = ReturnType<typeof createLegacyConfiguration>["configuration"];

// Preserve ordinary import-time initialization. When the first import belongs
// to an explicit operation, retain a deferred legacy resolver instead of reading
// that caller's ambient environment or capturing its configuration globally.
let legacy = getEmbeddedRuntimeContext() ? undefined : createLegacyConfiguration(import.meta.url);

function legacyConfiguration() {
  legacy ??= createLegacyConfiguration(import.meta.url);
  return legacy;
}

export function getConfiguration(): NeotomaConfiguration {
  return getEmbeddedRuntimeContext()?.configuration ?? legacyConfiguration().configuration;
}

function assertMutableLegacyConfiguration(): NeotomaConfiguration {
  if (getEmbeddedRuntimeContext()) throw new Error("EXPLICIT_RUNTIME_CONFIGURATION_IMMUTABLE");
  return legacyConfiguration().configuration;
}

/** Contextual facade; legacy callers retain the same configuration shape. */
export const config: NeotomaConfiguration = new Proxy({} as NeotomaConfiguration, {
  get(_target, key) {
    return Reflect.get(getConfiguration(), key);
  },
  set(_target, key, value) {
    return Reflect.set(assertMutableLegacyConfiguration(), key, value);
  },
  defineProperty(_target, key, descriptor) {
    const legacyConfiguration = assertMutableLegacyConfiguration();
    // A nonconfigurable descriptor would bind the shared facade's target,
    // preventing a different runtime from supplying its own value later.
    if (descriptor.configurable !== true) {
      throw new Error("CONTEXTUAL_CONFIGURATION_CONFIGURABLE_DESCRIPTOR_REQUIRED");
    }
    return Reflect.defineProperty(legacyConfiguration, key, descriptor);
  },
  getPrototypeOf() {
    return Reflect.getPrototypeOf(getConfiguration());
  },
  setPrototypeOf(_target, prototype) {
    return Reflect.setPrototypeOf(assertMutableLegacyConfiguration(), prototype);
  },
  preventExtensions() {
    assertMutableLegacyConfiguration();
    // Freezing/sealing one shared facade must never poison unrelated scopes.
    throw new Error("CONTEXTUAL_CONFIGURATION_EXTENSIBILITY_REQUIRED");
  },
  deleteProperty(_target, key) {
    return Reflect.deleteProperty(assertMutableLegacyConfiguration(), key);
  },
  has(_target, key) {
    return Reflect.has(getConfiguration(), key);
  },
  ownKeys() {
    return Reflect.ownKeys(getConfiguration());
  },
  getOwnPropertyDescriptor(_target, key) {
    const descriptor = Reflect.getOwnPropertyDescriptor(getConfiguration(), key);
    return descriptor ? { ...descriptor, configurable: true } : undefined;
  },
});

export function logConfigInfo(): void {
  if (!getEmbeddedRuntimeContext()) legacyConfiguration().logConfigInfo();
}
