/**
 * Local auth/session shim preserving the auth surface for local-only mode.
 * Remote auth providers are intentionally disabled in local-only mode.
 */

type LocalUser = {
  id: string;
  email?: string;
  is_anonymous: boolean;
};

type LocalSession = {
  access_token: string;
  refresh_token: string;
  user: LocalUser;
};

type AuthPayload = { session: LocalSession | null; user: LocalUser | null };
type AuthListener = (event: string, session: LocalSession | null) => void;

let currentSession: LocalSession | null = null;
const listeners = new Set<AuthListener>();

function emitAuth(event: string): void {
  for (const listener of listeners) {
    listener(event, currentSession);
  }
}

function newLocalUser(email?: string): LocalUser {
  return {
    id: crypto.randomUUID(),
    email,
    is_anonymous: !email,
  };
}

function newLocalSession(user: LocalUser): LocalSession {
  return {
    access_token: `local_access_${crypto.randomUUID()}`,
    refresh_token: `local_refresh_${crypto.randomUUID()}`,
    user,
  };
}

export const auth = {
  auth: {
    async getSession() {
      return { data: { session: currentSession } };
    },
    async signInAnonymously() {
      const user = newLocalUser();
      currentSession = newLocalSession(user);
      emitAuth("SIGNED_IN");
      return { data: { session: currentSession }, error: null };
    },
    async signOut() {
      currentSession = null;
      emitAuth("SIGNED_OUT");
      return { error: null };
    },
    onAuthStateChange(callback: AuthListener) {
      listeners.add(callback);
      return {
        data: {
          subscription: {
            unsubscribe: () => listeners.delete(callback),
          },
        },
      };
    },
    async setSession(payload: { access_token: string; refresh_token?: string }) {
      const user = newLocalUser();
      currentSession = {
        access_token: payload.access_token,
        refresh_token: payload.refresh_token ?? `local_refresh_${crypto.randomUUID()}`,
        user,
      };
      emitAuth("SIGNED_IN");
      return { data: { session: currentSession }, error: null };
    },
  },
  channel() {
    return {
      on() {
        return this;
      },
      subscribe(callback?: (status: string) => void) {
        callback?.("SUBSCRIBED");
        return {
          unsubscribe() {},
        };
      },
    };
  },
};

if (typeof window !== "undefined") {
  (window as unknown as { auth?: typeof auth }).auth = auth;
}
