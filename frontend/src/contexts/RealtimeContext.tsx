import { createContext, useContext, useEffect, useRef, useState } from "react";
import { supabase } from "../lib/supabase";
import { RealtimeChannel } from "@supabase/supabase-js";
import { useAuth } from "./AuthContext";

interface RealtimeContextValue {
  subscribe: (config: SubscriptionConfig) => () => void;
  isConnected: boolean;
  error: string | null;
}

interface SubscriptionConfig {
  table: string;
  event?: "INSERT" | "UPDATE" | "DELETE" | "*";
  filter?: string;
  callback: (payload: any) => void;
  debounceMs?: number;
}

const RealtimeContext = createContext<RealtimeContextValue | null>(null);

export function RealtimeProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const channelsRef = useRef<Map<string, RealtimeChannel>>(new Map());
  const debounceTimersRef = useRef<Map<string, NodeJS.Timeout>>(new Map());

  const subscribe = (config: SubscriptionConfig) => {
    const channelKey = `${config.table}-${config.event || "*"}-${config.filter || ""}`;
    
    if (channelsRef.current.has(channelKey)) {
      console.warn(`Channel already exists: ${channelKey}`);
      return () => {};
    }

    const wrappedCallback = config.debounceMs
      ? (payload: any) => {
          const existingTimer = debounceTimersRef.current.get(channelKey);
          if (existingTimer) {
            clearTimeout(existingTimer);
          }

          const timer = setTimeout(() => {
            config.callback(payload);
            debounceTimersRef.current.delete(channelKey);
          }, config.debounceMs);

          debounceTimersRef.current.set(channelKey, timer);
        }
      : config.callback;

    const channel = supabase
      .channel(channelKey)
      .on(
        "postgres_changes",
        {
          event: config.event || "*",
          schema: "public",
          table: config.table,
          filter: config.filter,
        },
        (payload) => {
          try {
            wrappedCallback(payload);
          } catch (err) {
            console.error("Error in realtime callback:", err);
            setError(err instanceof Error ? err.message : "Unknown error");
          }
        }
      )
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          setIsConnected(true);
          setError(null);
        } else if (status === "CHANNEL_ERROR") {
          setIsConnected(false);
          setError("Realtime connection error");
        } else if (status === "TIMED_OUT") {
          setIsConnected(false);
          setError("Realtime connection timed out");
        }
      });

    channelsRef.current.set(channelKey, channel);

    return () => {
      const timer = debounceTimersRef.current.get(channelKey);
      if (timer) {
        clearTimeout(timer);
        debounceTimersRef.current.delete(channelKey);
      }
      channel.unsubscribe();
      channelsRef.current.delete(channelKey);
    };
  };

  useEffect(() => {
    return () => {
      debounceTimersRef.current.forEach((timer) => clearTimeout(timer));
      debounceTimersRef.current.clear();
      channelsRef.current.forEach((channel) => channel.unsubscribe());
      channelsRef.current.clear();
    };
  }, []);

  return (
    <RealtimeContext.Provider value={{ subscribe, isConnected, error }}>
      {children}
    </RealtimeContext.Provider>
  );
}

export function useRealtime() {
  const context = useContext(RealtimeContext);
  if (!context) {
    throw new Error("useRealtime must be used within RealtimeProvider");
  }
  return context;
}
