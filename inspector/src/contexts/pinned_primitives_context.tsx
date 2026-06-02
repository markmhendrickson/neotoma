import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { isApiUrlConfigured } from "@/api/client";
import {
  loadPinnedPrimitivesFromNeotoma,
  savePinnedPrimitivesToNeotoma,
} from "@/api/endpoints/pinned_primitives";
import {
  loadPinnedPrimitives,
  mergePinnedPrimitivesOnRemoteHydration,
  normalizePinHref,
  PINNED_PRIMITIVES_STORAGE_KEY,
  removePinnedPrimitive,
  savePinnedPrimitives,
  togglePinnedPrimitive,
  type PinnedPrimitive,
} from "@/lib/pinned_primitives";

type PinnedPrimitivesContextValue = {
  pins: PinnedPrimitive[];
  toggle: (entry: Omit<PinnedPrimitive, "pinned_at">) => void;
  unpin: (href: string) => void;
  isPinned: (href: string) => boolean;
  replacePins: (
    next: PinnedPrimitive[],
    options?: { source?: "user" | "hydration" },
  ) => void;
};

const PinnedPrimitivesContext = createContext<PinnedPrimitivesContextValue | null>(null);

function usePinnedPrimitivesState(): PinnedPrimitivesContextValue {
  const [pins, setPins] = useState<PinnedPrimitive[]>(() => loadPinnedPrimitives());
  const remoteEntityIdRef = useRef<string | undefined>(undefined);
  const changedBeforeRemoteHydrationRef = useRef(false);
  const remoteHydrationResolvedRef = useRef(false);

  const remotePins = useQuery({
    queryKey: ["pinned-primitives"],
    queryFn: loadPinnedPrimitivesFromNeotoma,
    enabled: isApiUrlConfigured(),
    refetchInterval: false,
  });

  const { mutate: mutateRemotePins } = useMutation({
    mutationFn: savePinnedPrimitivesToNeotoma,
    onSuccess: (remoteState) => {
      remoteEntityIdRef.current = remoteState.entityId;
    },
  });

  useEffect(() => {
    if (!remotePins.isSuccess) return;
    const remoteState = remotePins.data;
    if (remoteState?.entityId) {
      remoteEntityIdRef.current = remoteState.entityId;
    }
    if (remoteState && !changedBeforeRemoteHydrationRef.current) {
      setPins((prev) => {
        const merged = mergePinnedPrimitivesOnRemoteHydration(prev, remoteState.pins);
        savePinnedPrimitives(merged);
        return merged;
      });
    }
    remoteHydrationResolvedRef.current = true;
  }, [remotePins.data, remotePins.isSuccess]);

  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key === null || event.key === PINNED_PRIMITIVES_STORAGE_KEY) {
        setPins(loadPinnedPrimitives());
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const persistPins = useCallback(
    (
      next: PinnedPrimitive[],
      options?: { markChangeBeforeRemoteHydration?: boolean; persistRemote?: boolean },
    ) => {
      const markChangeBeforeRemoteHydration =
        options?.markChangeBeforeRemoteHydration ?? true;
      const persistRemote = options?.persistRemote ?? true;
      if (markChangeBeforeRemoteHydration && !remoteHydrationResolvedRef.current) {
        changedBeforeRemoteHydrationRef.current = true;
      }
      savePinnedPrimitives(next);
      if (persistRemote && isApiUrlConfigured()) {
        mutateRemotePins({
          pins: next,
          targetEntityId: remoteEntityIdRef.current ?? remotePins.data?.entityId,
        });
      }
    },
    [mutateRemotePins, remotePins.data?.entityId],
  );

  const toggle = useCallback((entry: Omit<PinnedPrimitive, "pinned_at">) => {
    setPins((prev) => {
      const next = togglePinnedPrimitive(prev, entry);
      persistPins(next);
      return next;
    });
  }, [persistPins]);

  const unpin = useCallback((href: string) => {
    setPins((prev) => {
      const next = removePinnedPrimitive(prev, href);
      persistPins(next);
      return next;
    });
  }, [persistPins]);

  const isPinned = useCallback(
    (href: string) => {
      const normalized = normalizePinHref(href);
      return pins.some((p) => p.href === normalized);
    },
    [pins],
  );

  const replacePins = useCallback(
    (
      next: PinnedPrimitive[],
      options?: { source?: "user" | "hydration" },
    ) => {
      setPins((prev) => {
        if (prev === next) return prev;
        const isHydration = options?.source === "hydration";
        persistPins(next, {
          markChangeBeforeRemoteHydration: !isHydration,
          persistRemote: !isHydration || remoteHydrationResolvedRef.current,
        });
        return next;
      });
    },
    [persistPins],
  );

  return useMemo(
    () => ({ pins, toggle, unpin, isPinned, replacePins }),
    [pins, toggle, unpin, isPinned, replacePins],
  );
}

export function PinnedPrimitivesProvider({ children }: { children: ReactNode }) {
  const value = usePinnedPrimitivesState();
  return (
    <PinnedPrimitivesContext.Provider value={value}>{children}</PinnedPrimitivesContext.Provider>
  );
}

export function usePinnedPrimitives(): PinnedPrimitivesContextValue {
  const ctx = useContext(PinnedPrimitivesContext);
  if (!ctx) {
    throw new Error("usePinnedPrimitives must be used within PinnedPrimitivesProvider");
  }
  return ctx;
}
