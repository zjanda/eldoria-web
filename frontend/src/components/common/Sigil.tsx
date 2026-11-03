const SIGILS: Record<string, string> = {
  crystal: "M12 2 L19 10 L12 22 L5 10 Z M5 10 L19 10 M12 2 L9.5 10 L12 22 M12 2 L14.5 10 L12 22",
  leaf: "M5 19 C5 9 11 4 20 4 C20 13 15 19 5 19 Z M5 19 L15 9 M10 14 L13 14 M12 12 L12 9",
  crown: "M4 18 L4 8 L8 12 L12 5 L16 12 L20 8 L20 18 Z M4 18 L20 18",
  arrow: "M4 20 L20 4 M13 4 L20 4 L20 11 M4 20 L4 15 M4 20 L9 20",
  spore: "M3 12 C3 5 21 5 21 12 Z M10 12 L9.5 20 L14.5 20 L14 12 M8 9 L8.5 9 M13 8 L13.5 8 M16 10 L16.5 10",
  moon: "M15 3 A9 9 0 1 0 21 15 A7 7 0 1 1 15 3 Z",
  gear: "M12 8 A4 4 0 1 0 12.01 8 M12 2 L12 5 M12 19 L12 22 M2 12 L5 12 M19 12 L22 12 M4.9 4.9 L7 7 M17 17 L19.1 19.1 M4.9 19.1 L7 17 M17 7 L19.1 4.9",
  antler: "M12 22 L12 13 M12 13 L7 8 M7 8 L5 3 M7 8 L2.5 8.5 M12 13 L17 8 M17 8 L19 3 M17 8 L21.5 8.5 M9.5 10.5 L9 6 M14.5 10.5 L15 6",
  eye: "M2 12 C6 5 18 5 22 12 C18 19 6 19 2 12 Z M12 9 A3 3 0 1 0 12.01 9",
  circle: "M12 4 A8 8 0 1 0 12.01 4",
};

export function Sigil({ name, className = "", strokeWidth = 1.4 }: { name: string; className?: string; strokeWidth?: number }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d={SIGILS[name] ?? SIGILS.circle} />
    </svg>
  );
}
