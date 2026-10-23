import { useEffect, useRef, useState } from "react";
import { Braces, Cable, HardDrive, Scale, Terminal } from "lucide-react";

const benefits = [
  {
    id: "mit",
    label: "MIT",
    Icon: Scale,
    detail: "The source is available under the MIT license.",
  },
  {
    id: "local",
    label: "Local-first",
    Icon: HardDrive,
    detail: "Run your own instance and keep its record under your control.",
  },
  {
    id: "mcp",
    label: "MCP",
    Icon: Cable,
    detail: "Connect an AI tool through its configured MCP server.",
  },
  {
    id: "rest",
    label: "REST API",
    Icon: Braces,
    detail: "Read and write through the documented HTTP API.",
  },
  {
    id: "cli",
    label: "CLI",
    Icon: Terminal,
    detail: "Inspect and maintain the record from a terminal.",
  },
] as const;

export function ProductBenefitPills() {
  const [open, setOpen] = useState<string | null>(null);
  const [pinned, setPinned] = useState(false);
  const suppressed = useRef<string | null>(null);
  const list = useRef<HTMLUListElement>(null);

  useEffect(() => {
    const dismissOutside = (event: PointerEvent) => {
      if (event.target instanceof Node && !list.current?.contains(event.target)) {
        suppressed.current = open;
        setOpen(null);
        setPinned(false);
      }
    };
    document.addEventListener("pointerdown", dismissOutside);
    return () => document.removeEventListener("pointerdown", dismissOutside);
  }, [open]);

  const dismiss = (id: string) => {
    suppressed.current = id;
    setOpen(null);
    setPinned(false);
  };

  return (
    <ul
      className={`plan-meta-pills${open ? " plan-meta-pills-open" : ""}`}
      aria-label="Product details"
      ref={list}
    >
      {benefits.map(({ id, label, Icon, detail }) => (
        <li
          key={id}
          onPointerEnter={(event) => {
            if (event.pointerType !== "touch" && suppressed.current !== id) {
              if (open !== id) setPinned(false);
              setOpen(id);
            }
          }}
          onPointerLeave={() => {
            if (suppressed.current === id) suppressed.current = null;
            if (!pinned && open === id && !list.current?.contains(document.activeElement))
              setOpen(null);
          }}
          onBlur={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget)) {
              if (suppressed.current === id) suppressed.current = null;
              if (open === id) {
                setOpen(null);
                setPinned(false);
              }
            }
          }}
          onKeyDown={(event) => {
            if (event.key === "Escape" && open === id) {
              event.preventDefault();
              dismiss(id);
              event.currentTarget.querySelector("button")?.focus();
            }
          }}
        >
          <button
            type="button"
            aria-expanded={open === id}
            aria-controls={`plan-benefit-${id}`}
            onFocus={() => {
              if (suppressed.current !== id) {
                if (open !== id) setPinned(false);
                setOpen(id);
              }
            }}
            onClick={() => {
              if (open === id && pinned) dismiss(id);
              else {
                suppressed.current = null;
                setOpen(id);
                setPinned(true);
              }
            }}
          >
            <Icon size={13} aria-hidden="true" />
            {label}
          </button>
          <span className="plan-benefit-detail" id={`plan-benefit-${id}`} hidden={open !== id}>
            {detail}
          </span>
        </li>
      ))}
    </ul>
  );
}
