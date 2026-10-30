import { useEffect, useRef, useState } from "react";
import { useLocale } from "@/i18n/LocaleContext";
type Turn =
  | { kind: "user" | "agent"; text: string }
  | { kind: "tool"; label: string; result: string };

const turns: readonly Turn[] = [
  {
    kind: "user",
    text: "Here's INV-2041.pdf from Acme: $3,200 USD, dated October 1, 2026, due October 22. Please keep a record of it.",
  },
  {
    kind: "agent",
    text: "I'll save the supplied invoice as a source with its fields, then read the record back to check the amount and due date.",
  },
  {
    kind: "tool",
    label: "Neotoma MCP · store and read back",
    result: "INV-2041 saved and retrieved · $3,200 USD · due October 22, 2026",
  },
  {
    kind: "user",
    text: "Use my connected Gmail MCP to find and read the latest email about INV-2041. Check whether the due date changed and update the record.",
  },
  {
    kind: "agent",
    text: "I’ll look up that invoice email through your configured Gmail MCP, then save the retrieved email as a source in Neotoma and check its current value and history.",
  },
  {
    kind: "tool",
    label: "Gmail MCP · find and read email",
    result:
      "Latest INV-2041 email retrieved · due date moved to October 29, 2026 · amount unchanged",
  },
  {
    kind: "tool",
    label: "Neotoma MCP · save email evidence and read back",
    result:
      "Snapshot and field provenance select October 29 · original October 22 retained in observation history · amount remains $3,200 USD",
  },
  { kind: "user", text: "What's due now, and what supports that date?" },
  {
    kind: "agent",
    text: "Acme's INV-2041 is $3,200 USD, due October 29, 2026. The current due date traces to the email retrieved through Gmail MCP. Observation history retains the original October 22 date, and the amount still traces to the invoice you supplied.",
  },
];

const turnsEs: readonly Turn[] = [
  { kind: "user", text: "Aquí está INV-2041.pdf de Acme: 3.200 USD, fechado el 1 de octubre de 2026 y con vencimiento el 22 de octubre. Guarda un registro." },
  { kind: "agent", text: "Guardaré la factura facilitada como fuente junto con sus campos y luego leeré el registro para comprobar importe y vencimiento." },
  { kind: "tool", label: "Neotoma MCP · guardar y volver a leer", result: "INV-2041 guardada y recuperada · 3.200 USD · vence el 22 de octubre de 2026" },
  { kind: "user", text: "Usa mi MCP de Gmail conectado para buscar y leer el último correo sobre INV-2041. Comprueba si cambió el vencimiento y actualiza el registro." },
  { kind: "agent", text: "Buscaré el correo mediante tu MCP de Gmail configurado; después guardaré el correo recuperado como fuente en Neotoma y comprobaré el valor actual y su historial." },
  { kind: "tool", label: "Gmail MCP · buscar y leer correo", result: "Último correo de INV-2041 recuperado · vencimiento cambiado al 29 de octubre de 2026 · importe sin cambios" },
  { kind: "tool", label: "Neotoma MCP · guardar prueba y volver a leer", result: "La instantánea y la procedencia del campo seleccionan el 29 de octubre · el 22 de octubre original permanece en el historial de observaciones · el importe sigue en 3.200 USD" },
  { kind: "user", text: "¿Cuándo vence ahora y qué respalda esa fecha?" },
  { kind: "agent", text: "La factura INV-2041 de Acme es de 3.200 USD y vence el 29 de octubre de 2026. El vencimiento actual proviene del correo recuperado mediante Gmail MCP. El historial conserva la fecha original del 22 de octubre y el importe sigue respaldado por la factura que facilitaste." },
];

function ChatMessage({
  turn,
  running = false,
  motionAllowed = false,
}: {
  turn: Turn;
  running?: boolean;
  motionAllowed?: boolean;
}) {
  const es = useLocale().locale === "es";
  if (turn.kind === "tool")
    return (
      <li className="plan-mcp-message plan-mcp-message-tool">
        <div
          className="plan-mcp-action"
          aria-label={turn.label + (running ? (es ? ": en curso" : ": running") : (es ? ": completado" : ": complete"))}
        >
          <strong>{turn.label}</strong>
          {running ? (
            <span
              className="plan-mcp-progress"
              aria-hidden="true"
              style={{ animationPlayState: motionAllowed ? "running" : "paused" }}
            />
          ) : (
            <p className="plan-mcp-result">{turn.result}</p>
          )}
        </div>
      </li>
    );
  return (
    <li className={"plan-mcp-message plan-mcp-message-" + turn.kind}>
      {turn.kind === "agent" ? (
        <span className="plan-mcp-avatar" aria-hidden="true">
          N
        </span>
      ) : null}
      <div className="plan-mcp-bubble">
        <strong>{turn.kind === "user" ? (es ? "Tú" : "You") : (es ? "Agente" : "Agent")}</strong>
        <p>{"text" in turn ? turn.text : ""}</p>
      </div>
    </li>
  );
}

export function McpTranscript() {
  const es = useLocale().locale === "es";
  return (
    <ol className="plan-mcp-messages" aria-label={es ? "Transcripción completa de la conversación ilustrativa" : "Complete illustrative conversation transcript"}>
      {(es ? turnsEs : turns).map((turn, index) => (
        <ChatMessage key={index} turn={turn} />
      ))}
    </ol>
  );
}

export function McpConversation({ active }: { active: boolean }) {
  const es = useLocale().locale === "es";
  const currentTurns = es ? turnsEs : turns;
  const rootRef = useRef<HTMLDivElement>(null);
  const chatRef = useRef<HTMLDivElement>(null);
  const followTailRef = useRef(true);
  const turnClockRef = useRef<{ phase: string; remaining: number } | null>(null);
  const [activeTurn, setActiveTurn] = useState(0);
  const [running, setRunning] = useState(false);
  const [paused, setPaused] = useState(false);
  const [inView, setInView] = useState(false);
  const [pageVisible, setPageVisible] = useState(true);
  const [reduceMotion, setReduceMotion] = useState(true);

  useEffect(() => {
    const media = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    if (!media) return;
    const change = () => {
      setReduceMotion(media.matches);
      if (media.matches) setPaused(true);
    };
    change();
    media.addEventListener("change", change);
    return () => media.removeEventListener("change", change);
  }, []);
  useEffect(() => {
    const change = () => {
      const visible = document.visibilityState === "visible";
      setPageVisible(visible);
    };
    change();
    document.addEventListener("visibilitychange", change);
    return () => document.removeEventListener("visibilitychange", change);
  }, []);
  useEffect(() => {
    const node = rootRef.current;
    if (!node) return;
    if (!window.IntersectionObserver) {
      setReduceMotion(true);
      return;
    }
    const observer = new IntersectionObserver(
      ([entry]) => {
        setInView(entry.isIntersecting && entry.intersectionRatio >= 0.35);
      },
      { threshold: 0.35 }
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  // Leaving the viewport suspends playback; only a reader action persists a pause.
  const canPlay = active && inView && pageVisible && !reduceMotion;
  const finished = activeTurn === currentTurns.length - 1 && !running;
  const playing = canPlay && !paused && !finished;
  useEffect(() => {
    if (!active || !playing || !inView || !pageVisible || reduceMotion) return;
    const turn = currentTurns[activeTurn];
    const phase = `${es ? "es" : "en"}:${activeTurn}:${running}`;
    const delay = running
      ? 1150
      : turn.kind === "tool"
        ? 2100
        : Math.min(6500, Math.max(2100, turn.text.trim().split(/\s+/).length * 160));
    if (turnClockRef.current?.phase !== phase)
      turnClockRef.current = { phase, remaining: delay };
    const clock = turnClockRef.current;
    const startedAt = Date.now();
    let completed = false;
    const timer = window.setTimeout(() => {
      completed = true;
      clock.remaining = 0;
      if (running) setRunning(false);
      else {
        const next = Math.min(activeTurn + 1, currentTurns.length - 1);
        setActiveTurn(next);
        setRunning(currentTurns[next].kind === "tool");
      }
    }, clock.remaining);
    return () => {
      window.clearTimeout(timer);
      if (!completed) clock.remaining = Math.max(0, clock.remaining - (Date.now() - startedAt));
    };
  }, [active, activeTurn, playing, running, inView, pageVisible, reduceMotion, es, currentTurns]);
  useEffect(() => {
    if (followTailRef.current && chatRef.current)
      chatRef.current.scrollTop = chatRef.current.scrollHeight;
  }, [activeTurn, running]);

  const pauseForReading = () => {
    followTailRef.current = false;
    setPaused(true);
  };
  const togglePlayback = () => {
    if (playing) setPaused(true);
    else if (canPlay) {
      if (finished) {
        setActiveTurn(0);
        setRunning(false);
      }
      followTailRef.current = true;
      setPaused(false);
    }
  };

  return (
    <div ref={rootRef} className="plan-mcp-conversation">
      <header className="plan-mcp-chat-head">
        <div>
          <strong>{es ? "Tu herramienta de IA preferida" : "Your favorite AI tool"}</strong>
          <span className="plan-sr">{es ? "Conversación de ejemplo; no se ejecutan comandos ni solicitudes." : "Example conversation; no commands or requests run."}</span>
        </div>
        {!reduceMotion ? (
          <button
            type="button"
            className="plan-mcp-playback"
            onClick={togglePlayback}
            disabled={!canPlay}
          >
            {es ? (finished ? "Repetir" : playing ? "Pausar" : "Reproducir") : (finished ? "Replay" : playing ? "Pause" : "Play")}
          </button>
        ) : null}
      </header>
      {reduceMotion ? (
        <McpTranscript />
      ) : (
        <>
          <div
            ref={chatRef}
            className="plan-mcp-chat-window"
            role="region"
            aria-label={es ? "Conversación ilustrativa sobre una factura" : "Illustrative invoice conversation"}
            tabIndex={0}
            onWheel={pauseForReading}
            onTouchMove={pauseForReading}
            onPointerDown={pauseForReading}
            onScroll={(event) => {
              if (
                event.currentTarget.scrollTop <
                event.currentTarget.scrollHeight - event.currentTarget.clientHeight - 32
              )
                pauseForReading();
            }}
            onKeyDown={(event) => {
              if (
                ["ArrowUp", "ArrowDown", "PageUp", "PageDown", "Home", "End", " "].includes(
                  event.key
                )
              )
                pauseForReading();
            }}
          >
            <ol className="plan-mcp-messages" aria-label={es ? "Conversación hasta ahora" : "Conversation so far"}>
              {currentTurns.slice(0, activeTurn + 1).map((turn, index) => (
                <ChatMessage
                  key={index}
                  turn={turn}
                  running={index === activeTurn && running}
                  motionAllowed={canPlay && playing}
                />
              ))}
              {!running && activeTurn < currentTurns.length - 1 ? (
                <li className="plan-mcp-typing" aria-label={es ? "Se prepara el siguiente mensaje" : "Next message is being prepared"}>
                  <span className="plan-mcp-avatar" aria-hidden="true">
                    N
                  </span>
                  <span
                    className="plan-mcp-typing-dots"
                    aria-hidden="true"
                    style={{ animationPlayState: canPlay && playing ? "running" : "paused" }}
                  >
                    •••
                  </span>
                </li>
              ) : null}
            </ol>
          </div>
        </>
      )}
    </div>
  );
}
