import { useEffect, useId, useLayoutEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { createPortal } from "react-dom";

/* A short explanation attached to any control. It shows on hover with a mouse, on keyboard focus,
   and on touch (the tap still does what the control does; the explanation appears alongside it). */

export interface HintText {
  title: string;
  text: string;
  /** A live line under the explanation, such as the number this setting gives right now. */
  detail?: string;
}

// Only one hint is open at a time.
let openHint: string | null = null;
const listeners = new Set<() => void>();
function setOpenHint(id: string | null) {
  if (openHint === id) return;
  openHint = id;
  listeners.forEach((listener) => listener());
}
function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

interface HintProps {
  hint: HintText;
  className?: string;
  children: ReactNode;
}

export function Hint({ hint, className = "", children }: HintProps) {
  const id = useId();
  const open = useSyncExternalStore(subscribe, () => openHint === id);
  const ref = useRef<HTMLDivElement>(null);
  const close = () => openHint === id && setOpenHint(null);

  useEffect(() => {
    if (!open) return;
    const outside = (event: Event) => {
      if (!ref.current?.contains(event.target as Node)) setOpenHint(null);
    };
    const escape = (event: KeyboardEvent) => event.key === "Escape" && setOpenHint(null);
    window.addEventListener("pointerdown", outside, true);
    window.addEventListener("keydown", escape);
    return () => {
      window.removeEventListener("pointerdown", outside, true);
      window.removeEventListener("keydown", escape);
    };
  }, [open]);

  // Leaving the screen with a hint open must not leave it stuck for the next one.
  useEffect(() => () => { if (openHint === id) setOpenHint(null); }, [id]);

  return (
    <div
      ref={ref}
      className={className}
      aria-describedby={open ? id : undefined}
      onPointerEnter={(event) => event.pointerType === "mouse" && setOpenHint(id)}
      onPointerLeave={(event) => event.pointerType === "mouse" && close()}
      onPointerDown={(event) => event.pointerType !== "mouse" && setOpenHint(id)}
      onFocus={() => setOpenHint(id)}
      onBlur={close}
    >
      {children}
      {open && ref.current && createPortal(<HintBox id={id} anchor={ref.current} hint={hint} />, document.body)}
    </div>
  );
}

function HintBox({ id, anchor, hint }: { id: string; anchor: HTMLElement; hint: HintText }) {
  const boxRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<{ left: number; top: number } | null>(null);

  useLayoutEffect(() => {
    const place = () => {
      const box = boxRef.current;
      if (!box) return;
      const rect = anchor.getBoundingClientRect();
      const margin = 8;
      const left = Math.min(Math.max(rect.left + rect.width / 2 - box.offsetWidth / 2, margin), window.innerWidth - box.offsetWidth - margin);
      const above = rect.top - box.offsetHeight - margin;
      const top = above >= margin ? above : Math.min(rect.bottom + margin, window.innerHeight - box.offsetHeight - margin);
      setPosition({ left, top });
    };
    place();
    // Follow the control while the page scrolls (a phone keyboard opening scrolls it).
    window.addEventListener("scroll", place, true);
    window.addEventListener("resize", place);
    return () => {
      window.removeEventListener("scroll", place, true);
      window.removeEventListener("resize", place);
    };
  }, [anchor, hint.title, hint.text, hint.detail]);

  return (
    <div
      ref={boxRef}
      id={id}
      role="tooltip"
      className="pointer-events-none fixed z-[90] w-[min(17rem,calc(100vw-16px))] rounded-lg border border-gold/30 bg-night-950/95 p-3 text-left font-sans text-[0.8rem] font-normal normal-case not-italic leading-snug tracking-normal text-parchment/85 shadow-panel backdrop-blur-md"
      style={{ left: position?.left ?? 0, top: position?.top ?? 0, visibility: position ? "visible" : "hidden" }}
    >
      <p className="font-display text-[0.92rem] tracking-wide text-parchment">{hint.title}</p>
      <p className="mt-1">{hint.text}</p>
      {hint.detail && <p className="mt-1.5 border-t border-white/10 pt-1.5 text-[0.74rem] text-gold-soft">{hint.detail}</p>}
    </div>
  );
}
