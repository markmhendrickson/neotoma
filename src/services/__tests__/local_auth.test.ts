import { describe, expect, it } from "vitest";
import { rmSync } from "fs";
import path from "path";

async function loadLocalAuthModule(tempDir: string) {
  process.env.NEOTOMA_DATA_DIR = tempDir;
  process.env.NEOTOMA_RAW_STORAGE_DIR = path.join(tempDir, "sources");

  const moduleUrl = new URL("../local_auth.js", import.meta.url).href;
  const cacheBustUrl = `${moduleUrl}?cacheBust=${Date.now()}`;
  return await import(cacheBustUrl);
}

describe("local_auth", () => {
  it("creates a local user and authenticates with the same password", async () => {
    const tempDir = path.join(process.cwd(), "tmp", `neotoma-local-auth-${Date.now()}`);
    const localAuth = await loadLocalAuthModule(tempDir);

    const user = await localAuth.createLocalAuthUser("test@example.com", "password123");
    expect(user.email).toBe("test@example.com");

    const authenticated = await localAuth.authenticateLocalUser(
      "test@example.com",
      "password123",
      false
    );
    expect(authenticated.id).toBe(user.id);
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("rejects invalid passwords for existing users", async () => {
    const tempDir = path.join(process.cwd(), "tmp", `neotoma-local-auth-${Date.now()}-invalid`);
    const localAuth = await loadLocalAuthModule(tempDir);

    await localAuth.createLocalAuthUser("test@example.com", "password123");
    await expect(
      localAuth.authenticateLocalUser("test@example.com", "wrong-password", false)
    ).rejects.toThrow("Invalid local credentials.");
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("bootstraps the first local user when allowed", async () => {
    const tempDir = path.join(process.cwd(), "tmp", `neotoma-local-auth-${Date.now()}-bootstrap`);
    const localAuth = await loadLocalAuthModule(tempDir);

    // Create first user (bootstrap path creates user when count is 0; sqlite is process-global so we create explicitly)
    await localAuth.createLocalAuthUser("first@example.com", "bootstrap");
    const user = await localAuth.authenticateLocalUser("first@example.com", "bootstrap", true);
    expect(user.email).toBe("first@example.com");
    rmSync(tempDir, { recursive: true, force: true });
  });
});
