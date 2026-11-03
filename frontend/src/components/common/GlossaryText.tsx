import { createContext, useContext, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { createPortal } from "react-dom";
import type { GlossaryEntry, GlossaryKind } from "../../api/types";

/* Highlights named things (abilities, items, enemies, conditions…) in any text and
   explains them in a tooltip: on hover with a mouse, on tap on a phone. */

const KIND_STYLE: Record<GlossaryKind, { color: string; icon: string; label: string }> = {
  hero: { color: "#e3c77d", icon: "●", label: "Hero" },
  ability: { color: "#e3c77d", icon: "✦", label: "Ability" },
  item: { color: "#8fd3c7", icon: "◆", label: "Item" },
  companion: { color: "#c9b6f2", icon: "❖", label: "Companion" },
  npc: { color: "#c9b6f2", icon: "●", label: "Character" },
  enemy: { color: "#ec8b6e", icon: "☠", label: "Enemy" },
  attack: { color: "#ec8b6e", icon: "⚔", label: "Enemy attack" },
  status: { color: "#b8a6ea", icon: "◎", label: "Condition" },
  rest: { color: "#9fc98a", icon: "☾", label: "Recovery" },
};

function termColor(entry: GlossaryEntry) {
  // People keep their own colour (lifted so dark accents stay readable); mechanics are coloured by what they are.
  return (entry.kind === "hero" || entry.kind === "npc" || entry.kind === "companion") && entry.accent
    ? `color-mix(in srgb, ${entry.accent} 65%, #f3e9d2)`
    : KIND_STYLE[entry.kind].color;
}

const fade = (color: string, percent: number) => `color-mix(in srgb, ${color} ${percent}%, transparent)`;

interface Glossary {
  pattern: RegExp | null;
  byTerm: Map<string, GlossaryEntry>;
}

const GlossaryContext = createContext<Glossary>({ pattern: null, byTerm: new Map() });

export function GlossaryProvider({ entries, children }: { entries: GlossaryEntry[] | undefined; children: ReactNode }) {
  const value = useMemo<Glossary>(() => {
    const byTerm = new Map<string, GlossaryEntry>();
    for (const entry of entries ?? []) {
      for (const term of [entry.term, ...entry.aliases]) if (!byTerm.has(term)) byTerm.set(term, entry);
    }
    if (!byTerm.size) return { pattern: null, byTerm };
    // Longest first, so "Glimblebop's Sparkbomb" wins over "Glimblebop".
    const alternatives = [...byTerm.keys()].sort((a, b) => b.length - a.length).map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
    return { pattern: new RegExp(`\\b(${alternatives.join("|")})\\b`), byTerm };
  }, [entries]);
  return <GlossaryContext.Provider value={value}>{children}</GlossaryContext.Provider>;
}

/** Text with every glossary term highlighted and explained on hover / tap. */
export function RichText({ text }: { text: string }) {
  const { pattern, byTerm } = useContext(GlossaryContext);
  if (!pattern) return <>{text}</>;
  // split() with a capture group alternates plain text and matched terms.
  const parts = text.split(new RegExp(pattern.source, "g"));
  if (parts.length === 1) return <>{text}</>;
  return (
    <>
      {parts.map((part, i) => {
        const entry = i % 2 === 1 ? byTerm.get(part) : undefined;
        return entry ? (
          <Term key={i} entry={entry}>
            {part}
          </Term>
        ) : (
          part
        );
      })}
    </>
  );
}

// Only one tooltip is open at a time; a tiny store means opening one re-renders just two terms.
let openTerm: string | null = null;
const listeners = new Set<() => void>();
function setOpenTerm(id: string | null) {
  if (openTerm === id) return;
  openTerm = id;
  listeners.forEach((listener) => listener());
}
function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function Term({ entry, children }: { entry: GlossaryEntry; children: ReactNode }) {
  const id = useId();
  const open = useSyncExternalStore(subscribe, () => openTerm === id);
  const ref = useRef<HTMLSpanElement>(null);
  const pointerType = useRef("mouse");
  const color = termColor(entry);

  useEffect(() => {
    if (!open) return;
    const close = (event: Event) => {
      if (event.type === "pointerdown" && ref.current?.contains(event.target as Node)) return;
      setOpenTerm(null);
    };
    window.addEventListener("pointerdown", close, true);
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    return () => {
      window.removeEventListener("pointerdown", close, true);
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
    };
  }, [open]);

  return (
    <span
      ref={ref}
      role="button"
      tabIndex={0}
      aria-expanded={open}
      className="cursor-help rounded-sm font-medium underline decoration-dotted decoration-1 underline-offset-[3px] transition-colors hover:bg-white/[0.06] focus-visible:outline focus-visible:outline-1"
      style={{ color, textDecorationColor: fade(color, 60) }}
      onPointerEnter={(event) => {
        pointerType.current = event.pointerType;
        if (event.pointerType === "mouse") setOpenTerm(id);
      }}
      onPointerLeave={(event) => event.pointerType === "mouse" && open && setOpenTerm(null)}
      onPointerDown={(event) => (pointerType.current = event.pointerType)}
      onClick={(event) => {
        // A tap explains the term; it shouldn't also trigger the line or button it sits in.
        event.stopPropagation();
        setOpenTerm(pointerType.current === "mouse" || !open ? id : null);
      }}
      onFocus={() => setOpenTerm(id)}
      onBlur={() => open && setOpenTerm(null)}
      onKeyDown={(event) => event.key === "Escape" && setOpenTerm(null)}
    >
      {children}
      {open && ref.current && createPortal(<Tooltip anchor={ref.current} entry={entry} color={color} />, document.body)}
    </span>
  );
}

function Tooltip({ anchor, entry, color }: { anchor: HTMLElement; entry: GlossaryEntry; color: string }) {
  const boxRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<{ left: number; top: number } | null>(null);

  useLayoutEffect(() => {
    const box = boxRef.current;
    if (!box) return;
    // A wrapped term has several boxes; anchor to the first line of it.
    const rect = anchor.getClientRects()[0] ?? anchor.getBoundingClientRect();
    const margin = 8;
    const left = Math.min(Math.max(rect.left + rect.width / 2 - box.offsetWidth / 2, margin), window.innerWidth - box.offsetWidth - margin);
    const above = rect.top - box.offsetHeight - margin;
    const top = above >= margin ? above : Math.min(rect.bottom + margin, window.innerHeight - box.offsetHeight - margin);
    setPosition({ left, top });
  }, [anchor, entry]);

  const kind = KIND_STYLE[entry.kind];
  return (
    <div
      ref={boxRef}
      role="tooltip"
      className="pointer-events-none fixed z-[80] w-[min(18rem,calc(100vw-16px))] rounded-lg border bg-night-950/95 p-3 text-left font-sans text-[0.8rem] not-italic leading-snug tracking-normal text-parchment/85 shadow-panel backdrop-blur-md"
      style={{ borderColor: fade(color, 40), left: position?.left ?? 0, top: position?.top ?? 0, visibility: position ? "visible" : "hidden" }}
    >
      <p className="flex items-center gap-1.5 text-[0.62rem] uppercase tracking-[0.18em]" style={{ color }}>
        <span aria-hidden>{kind.icon}</span>
        {kind.label}
      </p>
      <p className="mt-0.5 font-display text-[0.95rem] tracking-wide text-parchment">{entry.title}</p>
      <p className="text-[0.72rem] text-mist">{entry.subtitle}</p>
      {entry.description && <p className="mt-1.5">{entry.description}</p>}
      {entry.detail && <p className="mt-1.5 border-t border-white/10 pt-1.5 text-[0.74rem]" style={{ color }}>{entry.detail}</p>}
    </div>
  );
}
