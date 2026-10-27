import { type CSSProperties, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Braces, Cable, HardDrive, Scale, Terminal } from "lucide-react";
import { staticAssetPath } from "../../site/spa_path";
import { useLocale } from "@/i18n/LocaleContext";

const benefits = [
  {
    label: "MIT",
    href: "/license/",
    Icon: Scale,
    detail:
      "Use, modify, and redistribute Neotoma, including commercially. Keep the copyright and license notice; the software comes without warranty.",
  },
  {
    label: "Local-first",
    href: "/local-first/",
    Icon: HardDrive,
    detail:
      "Keep Neotoma and your data in your own local environment, and choose which tools can connect.",
  },
  {
    label: "MCP",
    href: "/mcp/",
    Icon: Cable,
    detail: "Connect an MCP client to read and write structured records through Neotoma tools.",
  },
  {
    label: "REST API",
    href: "/rest-api/",
    Icon: Braces,
    detail: "Use HTTP endpoints for integrations that need direct access to the same records.",
  },
  {
    label: "CLI",
    href: "/cli/",
    Icon: Terminal,
    detail: "Inspect and manage records from your terminal with Neotoma commands.",
  },
] as const;
const useClientLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

export function ProductBenefitPills() {
  const { locale } = useLocale();
  const es = locale === "es";
  const [open, setOpen] = useState<string | null>(null);
  const [shift, setShift] = useState(0);
  const activeItem = useRef<HTMLLIElement | null>(null);
  const activeTooltip = useRef<HTMLSpanElement | null>(null);

  useClientLayoutEffect(() => {
    if (!open || !activeItem.current || !activeTooltip.current) return;
    const reposition = () => {
      if (!activeItem.current || !activeTooltip.current) return;
      const left = activeItem.current.getBoundingClientRect().left;
      const width = activeTooltip.current.getBoundingClientRect().width;
      const margin = 12;
      setShift(Math.min(0, window.innerWidth - margin - left - width));
    };
    reposition();
    window.addEventListener("resize", reposition);
    return () => window.removeEventListener("resize", reposition);
  }, [open]);

  return (
    <ul className="plan-meta-pills" aria-label={es ? "Características del producto" : "Product details"}>
      {benefits.map(({ label, href, Icon, detail }, index) => (
        <li
          key={label}
          ref={open === label ? activeItem : undefined}
          onPointerEnter={(event) => {
            if (event.pointerType === "mouse" || event.pointerType === "pen") setOpen(label);
          }}
          onPointerLeave={() => setOpen(null)}
        >
          <a
            href={staticAssetPath(es ? `/es${href}` : href)}
            aria-describedby={open === label ? `benefit-${label}` : undefined}
            onFocus={() => setOpen(label)}
            onBlur={() => setOpen(null)}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                setOpen(null);
                event.stopPropagation();
              }
            }}
          >
            <Icon size={13} aria-hidden="true" />
            {es && index === 1 ? "Prioridad local" : label}
          </a>
          {open === label && (
            <span
              id={`benefit-${label}`}
              role="tooltip"
              className="plan-benefit-tooltip"
              ref={activeTooltip}
              style={{ "--popover-shift": `${shift}px` } as CSSProperties}
            >
              {es ? [
                "Usa, modifica y redistribuye Neotoma, también comercialmente. Conserva el aviso de autoría y licencia; el software no incluye garantía.",
                "Mantén Neotoma y tus datos en tu entorno local y elige qué herramientas pueden conectarse.",
                "Conecta un cliente MCP para leer y escribir registros estructurados mediante las herramientas de Neotoma.",
                "Usa puntos de acceso HTTP para integraciones que necesitan acceso directo a los mismos registros.",
                "Inspecciona y administra registros desde la terminal con comandos de Neotoma.",
              ][index] : detail}
            </span>
          )}
        </li>
      ))}
    </ul>
  );
}
