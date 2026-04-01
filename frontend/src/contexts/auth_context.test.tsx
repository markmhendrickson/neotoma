// @vitest-environment jsdom
import type { ReactNode } from "react";
import { renderHook, waitFor, act } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AuthProvider, useAuth } from "./AuthContext";

const authMock = vi.hoisted(() => {
  const listeners = new Set<(event: string, session: any) => void>();
  let session: any = null;

  return {
    listeners,
    getSession: vi.fn(async () => ({ data: { session } })),
    signInAnonymously: vi.fn(async () => {
      session = {
        access_token: "guest-token",
        user: { id: "guest-user", is_anonymous: true },
      };
      listeners.forEach((listener) => listener("SIGNED_IN", session));
      return { data: { session }, error: null };
    }),
    signOut: vi.fn(async () => {
      session = null;
      listeners.forEach((listener) => listener("SIGNED_OUT", null));
      return { error: null };
    }),
    onAuthStateChange: vi.fn((callback: (event: string, session: any) => void) => {
      listeners.add(callback);
      return {
        data: {
          subscription: {
            unsubscribe: () => listeners.delete(callback),
          },
        },
      };
    }),
    reset() {
      session = null;
      listeners.clear();
      this.getSession.mockClear();
      this.signInAnonymously.mockClear();
      this.signOut.mockClear();
      this.onAuthStateChange.mockClear();
    },
  };
});

vi.mock("@/lib/auth", () => ({
  auth: {
    auth: {
      getSession: authMock.getSession,
      signInAnonymously: authMock.signInAnonymously,
      signOut: authMock.signOut,
      onAuthStateChange: authMock.onAuthStateChange,
    },
  },
}));

describe("AuthProvider", () => {
  beforeEach(() => {
    authMock.reset();
  });

  it("signs in as a guest when no session exists", async () => {
    const wrapper = ({ children }: { children: ReactNode }) => (
      <AuthProvider>{children}</AuthProvider>
    );

    const { result } = renderHook(() => useAuth(), { wrapper });

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(authMock.getSession).toHaveBeenCalled();
    expect(authMock.signInAnonymously).toHaveBeenCalled();
    expect(result.current.user?.id).toBe("guest-user");
    expect(result.current.sessionToken).toBe("guest-token");
    expect(result.current.error).toBeNull();
  });

  it("can reset guest auth to a new guest session", async () => {
    const wrapper = ({ children }: { children: ReactNode }) => (
      <AuthProvider>{children}</AuthProvider>
    );

    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));

    authMock.signInAnonymously.mockImplementationOnce(async () => {
      const newSession = {
        access_token: "guest-token-2",
        user: { id: "guest-user-2", is_anonymous: true },
      };
      authMock.listeners.forEach((listener) => listener("SIGNED_IN", newSession));
      return { data: { session: newSession }, error: null };
    });

    await act(async () => {
      await result.current.resetGuestAuth();
    });

    expect(authMock.signOut).toHaveBeenCalled();
    expect(result.current.sessionToken).toBe("guest-token-2");
    expect(result.current.user?.id).toBe("guest-user-2");
  });
});
