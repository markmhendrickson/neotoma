import { beforeEach, describe, expect, it, vi } from "vitest";

describe("frontend auth shim", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("creates and clears sessions while notifying listeners", async () => {
    const { auth } = await import("./auth");
    const listener = vi.fn();

    const {
      data: { subscription },
    } = auth.auth.onAuthStateChange(listener);

    const signIn = await auth.auth.signInAnonymously();
    expect(signIn.error).toBeNull();
    expect(signIn.data.session?.user.is_anonymous).toBe(true);
    expect((await auth.auth.getSession()).data.session?.access_token).toBe(
      signIn.data.session?.access_token,
    );
    expect(listener).toHaveBeenCalledWith("SIGNED_IN", signIn.data.session);

    subscription.unsubscribe();
    await auth.auth.signOut();

    expect((await auth.auth.getSession()).data.session).toBeNull();
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("uses provided access token when setSession is called", async () => {
    const { auth } = await import("./auth");

    const result = await auth.auth.setSession({ access_token: "token-123" });

    expect(result.error).toBeNull();
    expect(result.data.session?.access_token).toBe("token-123");
    expect(result.data.session?.refresh_token).toContain("local_refresh_");
  });
});
