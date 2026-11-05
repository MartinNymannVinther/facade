"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useRouter } from "@/i18n/navigation";
import type { LiveEvent } from "@/modules/live/events";

/**
 * This tab's one live stream (ADR 0012). Everything that wants to hear
 * about the workspace subscribes here, so a tab holds one connection however
 * much is on screen. `generation` rises on every reconnect: an event may
 * have been missed, so whoever holds state reads it again.
 */

type Listener = (event: LiveEvent) => void;

type Live = {
  connection: string | null;
  generation: number;
  connected: boolean;
  online: Set<string>;
  subscribe: (listener: Listener) => () => void;
};

const LiveContext = createContext<Live | null>(null);

export function LiveProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const listeners = useRef(new Set<Listener>());
  const [connection, setConnection] = useState<string | null>(null);
  const [generation, setGeneration] = useState(0);
  const [connected, setConnected] = useState(true);
  const [online, setOnline] = useState<Set<string>>(new Set());

  useEffect(() => {
    let refresh: ReturnType<typeof setTimeout> | undefined;
    // The sidebar is drawn on the server: asked to draw itself again, once,
    // however many things moved in the same moment.
    const redraw = () => {
      clearTimeout(refresh);
      refresh = setTimeout(() => router.refresh(), 300);
    };
    const source = new EventSource("/api/live");
    source.addEventListener("hello", (raw) => {
      const hello = JSON.parse((raw as MessageEvent<string>).data) as {
        id: string;
        online: string[];
      };
      setConnection(hello.id);
      setOnline(new Set(hello.online));
      setConnected(true);
      setGeneration((g) => g + 1);
    });
    source.onmessage = (raw) => {
      const event = JSON.parse(raw.data) as LiveEvent;
      if (event.type === "presence") setOnline(new Set(event.online));
      if (event.type === "tree" || event.type === "inbox" || event.type === "message.new") redraw();
      for (const listener of listeners.current) listener(event);
    };
    source.onerror = () => setConnected(false);
    return () => {
      clearTimeout(refresh);
      source.close();
    };
  }, [router]);

  const subscribe = useCallback((listener: Listener) => {
    listeners.current.add(listener);
    return () => {
      listeners.current.delete(listener);
    };
  }, []);

  const value = useMemo(
    () => ({ connection, generation, connected, online, subscribe }),
    [connection, generation, connected, online, subscribe],
  );
  return <LiveContext.Provider value={value}>{children}</LiveContext.Provider>;
}

export function useLive(): Live {
  const live = useContext(LiveContext);
  if (!live) throw new Error("useLive outside LiveProvider");
  return live;
}

/** Hears every event while mounted, through the latest closure. */
export function useLiveEvent(listener: Listener): void {
  const { subscribe } = useLive();
  const latest = useRef(listener);
  useEffect(() => {
    latest.current = listener;
  });
  useEffect(() => subscribe((event) => latest.current(event)), [subscribe]);
}
