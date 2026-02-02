/**
 * File CapabilityRepository implementation (FU-051)
 *
 * Stub implementation for future capability management.
 */

import type { CapabilityRepository } from "../interfaces.js";

export class FileCapabilityRepository implements CapabilityRepository {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async storeCapability(_capability: unknown): Promise<void> {
    // Stub: Not implemented yet
    throw new Error("CapabilityRepository.storeCapability not yet implemented");
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async getCapability(_capabilityId: string): Promise<unknown | null> {
    // Stub: Not implemented yet
    throw new Error("CapabilityRepository.getCapability not yet implemented");
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async validateCapability(_capabilityId: string): Promise<boolean> {
    // Stub: Not implemented yet
    throw new Error(
      "CapabilityRepository.validateCapability not yet implemented",
    );
  }
}
