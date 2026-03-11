const VITE_CHUNK_RELOAD_STORAGE_KEY = "neotoma:vite-chunk-reload";

function extractMessage(input: unknown): string {
  if (typeof input === "string") return input;
  if (!input || typeof input !== "object") return "";

  const maybeMessage = (input as { message?: unknown }).message;
  if (typeof maybeMessage === "string") return maybeMessage;

  const maybeReason = (input as { reason?: unknown }).reason;
  if (maybeReason && typeof maybeReason === "object") {
    const reasonMessage = (maybeReason as { message?: unknown }).message;
    if (typeof reasonMessage === "string") return reasonMessage;
  }

  return "";
}

export function isRecoverableViteChunkError(input: unknown): boolean {
  const message = extractMessage(input);
  if (!message) return false;

  return (
    message.includes("Outdated Optimize Dep") ||
    message.includes("Failed to fetch dynamically imported module") ||
    message.includes("Importing a module script failed")
  );
}

export function attemptViteChunkRecovery(
  input: unknown,
  reload: () => void = () => window.location.reload()
): boolean {
  if (typeof window === "undefined") return false;
  if (!isRecoverableViteChunkError(input)) return false;

  try {
    if (window.sessionStorage.getItem(VITE_CHUNK_RELOAD_STORAGE_KEY) === "1") return false;
    window.sessionStorage.setItem(VITE_CHUNK_RELOAD_STORAGE_KEY, "1");
  } catch {
    // Ignore storage failures and still attempt a reload.
  }

  reload();
  return true;
}

declare global {
  interface Window {
    __NEOTOMA_VITE_CHUNK_RECOVERY_INSTALLED__?: boolean;
  }
}

export function installViteChunkRecovery(): void {
  if (typeof window === "undefined") return;
  if (window.__NEOTOMA_VITE_CHUNK_RECOVERY_INSTALLED__) return;
  window.__NEOTOMA_VITE_CHUNK_RECOVERY_INSTALLED__ = true;

  window.addEventListener("error", (event) => {
    attemptViteChunkRecovery(event.error ?? event.message);
  });

  window.addEventListener("unhandledrejection", (event) => {
    attemptViteChunkRecovery(event.reason);
  });
}
