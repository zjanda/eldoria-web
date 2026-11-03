import { useId, useMemo } from "react";

/**
 * Procedural, layered fallback artwork for every scene. Shown while real
 * artwork is generating, when generation is disabled, or when it fails.
 */

interface Palette {
  skyTop: string;
  skyBottom: string;
  glow: string;
  glowX: number;
  glowY: number;
  glowSize: number;
  far: string;
  mid: string;
  near: string;
  fog: string;
  particle: string;
  accent: string;
}

const PALETTES: Record<string, Palette> = {
  fey_court: {
    skyTop: "#0d1530", skyBottom: "#2c2752", glow: "#e6e1ff", glowX: 800, glowY: 170, glowSize: 380,
    far: "#29284a", mid: "#1b1a36", near: "#0c0b1c", fog: "rgba(214,206,255,0.10)", particle: "#ffe2a0", accent: "#d8d4f2",
  },
  whispering_grove: {
    skyTop: "#050d0b", skyBottom: "#13281f", glow: "#cfe9d4", glowX: 1180, glowY: 150, glowSize: 260,
    far: "#14271f", mid: "#0c1914", near: "#050b08", fog: "rgba(160,220,200,0.09)", particle: "#7ff3e6", accent: "#9a4fb8",
  },
  shadow_road: {
    skyTop: "#030207", skyBottom: "#1b1032", glow: "#9a7ff0", glowX: 820, glowY: 520, glowSize: 300,
    far: "#1a1230", mid: "#100b20", near: "#05030b", fog: "rgba(154,127,240,0.10)", particle: "#b9a6ff", accent: "#9a7ff0",
  },
  glimmerroot_tunnels: {
    skyTop: "#0b0703", skyBottom: "#2b1b0a", glow: "#ffbf66", glowX: 800, glowY: 470, glowSize: 340,
    far: "#2e1d0c", mid: "#1c1107", near: "#0b0603", fog: "rgba(255,190,110,0.08)", particle: "#ffc970", accent: "#63e6e2",
  },
  blighted_clearing: {
    skyTop: "#08050d", skyBottom: "#26112d", glow: "#c06be0", glowX: 800, glowY: 200, glowSize: 300,
    far: "#24142c", mid: "#150b1b", near: "#07040a", fog: "rgba(192,107,224,0.10)", particle: "#d18cf0", accent: "#9a4fb8",
  },
  moonlit_hollow: {
    skyTop: "#060b17", skyBottom: "#16233d", glow: "#dfe9ff", glowX: 520, glowY: 170, glowSize: 300,
    far: "#18233a", mid: "#0f1728", near: "#060a13", fog: "rgba(190,210,255,0.10)", particle: "#cfe0ff", accent: "#a9c6ff",
  },
  hollow_gate: {
    skyTop: "#030306", skyBottom: "#130a1e", glow: "#8f5bd6", glowX: 800, glowY: 470, glowSize: 260,
    far: "#1b1228", mid: "#0f0a17", near: "#050308", fog: "rgba(143,91,214,0.10)", particle: "#b58cff", accent: "#b58cff",
  },
};

const VISUAL_OVERRIDES: Record<string, Partial<Palette>> = {
  cleansed: { glow: "#e8fff2", accent: "#bff5d4", particle: "#e6fff0", fog: "rgba(220,255,235,0.10)", skyBottom: "#1c2b33" },
  slain: { glow: "#9a96a8", accent: "#6d6875", particle: "#a8a2b4", skyBottom: "#1b1820" },
};

function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashString(text: string): number {
  let hash = 2166136261;
  for (let i = 0; i < text.length; i++) hash = Math.imul(hash ^ text.charCodeAt(i), 16777619);
  return hash >>> 0;
}

type Rng = () => number;

function trunkPaths(rng: Rng, count: number, base: number, minWidth: number, maxWidth: number, avoidCenter = 0): string[] {
  const paths: string[] = [];
  for (let i = 0; i < count; i++) {
    let x = rng() * 1700 - 50;
    if (avoidCenter && Math.abs(x - 800) < avoidCenter) x += x < 800 ? -avoidCenter : avoidCenter;
    const width = minWidth + rng() * (maxWidth - minWidth);
    const lean = (rng() - 0.5) * 60;
    const flare = width * (1.4 + rng());
    paths.push(
      `M${x - width / 2 + lean},-20 C${x - width / 2 + lean * 0.6},${base * 0.4} ${x - width / 2},${base * 0.75} ${x - flare},${base} ` +
        `L${x + flare},${base} C${x + width / 2},${base * 0.75} ${x + width / 2 + lean * 0.6},${base * 0.4} ${x + width / 2 + lean},-20 Z`,
    );
  }
  return paths;
}

function canopyPath(rng: Rng, depth: number): string {
  let d = `M-20,-20 L1620,-20 L1620,${depth}`;
  for (let x = 1620; x > -40; x -= 80 + rng() * 60) {
    const y = depth + (rng() - 0.3) * 70;
    d += ` Q${x - 40},${y + 50} ${x - 80},${y}`;
  }
  return d + " Z";
}

function hillPath(rng: Rng, baseY: number, amplitude: number): string {
  let d = `M-20,900 L-20,${baseY}`;
  for (let x = 0; x <= 1640; x += 120) {
    d += ` Q${x + 60},${baseY - rng() * amplitude} ${x + 120},${baseY - rng() * amplitude * 0.5}`;
  }
  return d + " L1640,900 Z";
}

function arches(palette: Palette) {
  // Living silverbark arches receding toward a throne.
  const rows = [0, 1, 2, 3, 4];
  return rows.map((row) => {
    const scale = 1 - row * 0.17;
    const half = 620 * scale;
    const top = 120 + row * 70;
    const base = 900 - row * 70;
    const opacity = 0.75 - row * 0.12;
    return (
      <path
        key={row}
        d={`M${800 - half},${base} C${800 - half},${top + 180} ${800 - half * 0.35},${top} 800,${top - 40} C${800 + half * 0.35},${top} ${800 + half},${top + 180} ${800 + half},${base}`}
        fill="none"
        stroke={palette.accent}
        strokeOpacity={opacity * 0.5}
        strokeWidth={14 * scale}
      />
    );
  });
}

function rings(cx: number, cy: number, count: number, color: string, start: number, step: number) {
  return Array.from({ length: count }, (_, i) => (
    <ellipse
      key={i}
      cx={cx}
      cy={cy}
      rx={start + i * step}
      ry={(start + i * step) * 1.15}
      fill="none"
      stroke={color}
      strokeOpacity={0.5 - i * 0.07}
      strokeWidth={26 - i * 3}
    />
  ));
}

type UrlRef = (name: string) => string;

function SceneSilhouettes({ artKey, palette, rng, u }: { artKey: string; palette: Palette; rng: Rng; u: UrlRef }) {
  switch (artKey) {
    case "fey_court":
      return (
        <g>
          {arches(palette)}
          <path d="M760,640 L760,520 Q800,450 840,520 L840,640 Z" fill={palette.mid} opacity={0.9} />
          <path d="M700,660 L900,660 L960,900 L640,900 Z" fill={palette.accent} opacity={0.06} />
          <rect x={0} y={660} width={1600} height={240} fill={u("floor")} />
        </g>
      );
    case "whispering_grove":
    case "moonlit_hollow":
      return (
        <g>
          {trunkPaths(rng, 18, 700, 14, 30).map((d, i) => <path key={`f${i}`} d={d} fill={palette.far} />)}
          <rect x={0} y={420} width={1600} height={480} fill={u("fogBand")} />
          {trunkPaths(rng, 10, 820, 30, 60, 160).map((d, i) => <path key={`m${i}`} d={d} fill={palette.mid} />)}
          <path d={canopyPath(rng, 120)} fill={palette.near} />
          {trunkPaths(rng, 4, 900, 70, 120, 420).map((d, i) => <path key={`n${i}`} d={d} fill={palette.near} />)}
          <path d={hillPath(rng, 840, 60)} fill={palette.near} />
          {artKey === "whispering_grove" && (
            <path d="M300,880 Q520,820 700,870 T1100,860 T1500,880" stroke={palette.accent} strokeWidth={4} fill="none" opacity={0.55} filter={u("softGlow")} />
          )}
        </g>
      );
    case "shadow_road":
      return (
        <g>
          {trunkPaths(rng, 14, 320, 10, 26).map((d, i) => <path key={i} d={d} fill={palette.far} opacity={0.8} transform="scale(1,-1) translate(0,-330)" />)}
          <path d="M760,520 L840,520 L1300,900 L300,900 Z" fill={u("road")} />
          <path d="M800,520 L800,900" stroke={palette.accent} strokeOpacity={0.2} strokeWidth={2} />
          <path d={hillPath(rng, 560, 50)} fill={palette.mid} opacity={0.6} />
        </g>
      );
    case "glimmerroot_tunnels":
      return (
        <g>
          {rings(800, 470, 6, palette.far, 140, 110)}
          {Array.from({ length: 22 }, (_, i) => {
            const angle = (i / 22) * Math.PI * 2;
            const r1 = 120 + rng() * 40;
            const r2 = 700 + rng() * 200;
            return (
              <path
                key={i}
                d={`M${800 + Math.cos(angle) * r1},${470 + Math.sin(angle) * r1} Q${800 + Math.cos(angle + 0.3) * r2 * 0.5},${470 + Math.sin(angle + 0.3) * r2 * 0.5} ${800 + Math.cos(angle) * r2},${470 + Math.sin(angle) * r2}`}
                stroke={i % 3 === 0 ? "#6b4a22" : palette.mid}
                strokeWidth={10 + rng() * 22}
                fill="none"
                strokeLinecap="round"
              />
            );
          })}
          {Array.from({ length: 9 }, (_, i) => {
            const x = 120 + i * 170 + rng() * 60;
            return (
              <g key={`m${i}`} opacity={0.9}>
                <rect x={x - 3} y={840} width={6} height={40} fill="#3b2a18" />
                <ellipse cx={x} cy={840} rx={22 + rng() * 10} ry={11} fill={palette.accent} opacity={0.55} filter={u("softGlow")} />
              </g>
            );
          })}
        </g>
      );
    case "blighted_clearing":
      return (
        <g>
          {trunkPaths(rng, 16, 640, 8, 20).map((d, i) => <path key={`f${i}`} d={d} fill={palette.far} />)}
          <rect x={0} y={380} width={1600} height={520} fill={u("fogBand")} />
          <path d="M610,-20 C640,300 600,520 520,720 L1080,720 C1000,520 960,300 990,-20 Z" fill={palette.mid} />
          <path d="M760,720 C770,600 790,520 800,450 C810,520 830,600 840,720 Z" fill="#000" opacity={0.8} />
          <path d={hillPath(rng, 760, 30)} fill={palette.near} />
          {Array.from({ length: 7 }, (_, i) => {
            const x = 150 + i * 220 + rng() * 80;
            return (
              <path
                key={`v${i}`}
                d={`M${x},900 Q${x + 60},${820 - rng() * 40} ${x + 140 * (rng() - 0.5)},${760 + rng() * 20}`}
                stroke={palette.accent}
                strokeWidth={3}
                fill="none"
                opacity={0.7}
                filter={u("softGlow")}
              />
            );
          })}
        </g>
      );
    case "hollow_gate":
      return (
        <g>
          {Array.from({ length: 16 }, (_, i) => (
            <path
              key={`r${i}`}
              d={`M${rng() * 1600},-20 Q${rng() * 1600},${120 + rng() * 120} ${rng() * 1600},${200 + rng() * 140}`}
              stroke={palette.mid}
              strokeWidth={12 + rng() * 26}
              fill="none"
              strokeLinecap="round"
            />
          ))}
          <path d="M520,900 L520,420 C520,240 1080,240 1080,420 L1080,900 L980,900 L980,440 C980,330 620,330 620,440 L620,900 Z" fill={palette.far} />
          {rings(800, 600, 5, palette.accent, 60, 40).map((ring, i) => (
            <g key={`g${i}`} className="origin-center animate-pulse-glow" style={{ animationDelay: `${i * 0.6}s` }}>{ring}</g>
          ))}
          {Array.from({ length: 10 }, (_, i) => {
            const angle = Math.PI + (i / 9) * Math.PI;
            return (
              <text
                key={`t${i}`}
                x={800 + Math.cos(angle) * 330}
                y={470 + Math.sin(angle) * 180}
                fill={palette.accent}
                fontSize={26}
                textAnchor="middle"
                opacity={0.65}
                filter={u("softGlow")}
              >
                {"ᚠᚢᚦᚨᚱᚲᚷᚹᚺᚾ"[i]}
              </text>
            );
          })}
          <rect x={0} y={820} width={1600} height={80} fill={palette.near} />
        </g>
      );
    default:
      return <path d={hillPath(rng, 760, 80)} fill={palette.near} />;
  }
}

export function SceneArt({ artKey, visualState }: { artKey: string; visualState: string }) {
  const palette = useMemo(
    () => ({ ...(PALETTES[artKey] ?? PALETTES.whispering_grove), ...(VISUAL_OVERRIDES[visualState] ?? {}) }),
    [artKey, visualState],
  );
  const particles = useMemo(() => {
    const rng = mulberry32(hashString(artKey + "particles"));
    return Array.from({ length: 34 }, () => ({
      left: rng() * 100,
      top: 30 + rng() * 70,
      size: 2 + rng() * 4,
      delay: rng() * 9,
      duration: 7 + rng() * 8,
    }));
  }, [artKey]);
  const rng = mulberry32(hashString(artKey));
  // Unique gradient ids so two scenes can cross-fade without clashing.
  const uid = useId().replace(/:/g, "");
  const u: UrlRef = (name) => `url(#${uid}-${name})`;

  return (
    <div className="absolute inset-0 overflow-hidden" aria-hidden>
      <svg className="absolute inset-0 h-full w-full animate-breathe" viewBox="0 0 1600 900" preserveAspectRatio="xMidYMid slice">
        <defs>
          <linearGradient id={`${uid}-sky`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor={palette.skyTop} />
            <stop offset="1" stopColor={palette.skyBottom} />
          </linearGradient>
          <radialGradient id={`${uid}-glow`}>
            <stop offset="0" stopColor={palette.glow} stopOpacity={0.9} />
            <stop offset="0.25" stopColor={palette.glow} stopOpacity={0.35} />
            <stop offset="1" stopColor={palette.glow} stopOpacity={0} />
          </radialGradient>
          <linearGradient id={`${uid}-fogBand`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor={palette.glow} stopOpacity={0} />
            <stop offset="0.5" stopColor={palette.glow} stopOpacity={0.12} />
            <stop offset="1" stopColor={palette.glow} stopOpacity={0} />
          </linearGradient>
          <linearGradient id={`${uid}-floor`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor={palette.glow} stopOpacity={0.12} />
            <stop offset="1" stopColor={palette.near} stopOpacity={1} />
          </linearGradient>
          <linearGradient id={`${uid}-road`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor={palette.accent} stopOpacity={0.35} />
            <stop offset="1" stopColor="#000" stopOpacity={0.95} />
          </linearGradient>
          <radialGradient id={`${uid}-vignette`} cx="0.5" cy="0.45" r="0.75">
            <stop offset="0.55" stopColor="#000" stopOpacity={0} />
            <stop offset="1" stopColor="#000" stopOpacity={0.85} />
          </radialGradient>
          <filter id={`${uid}-softGlow`} x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="6" />
          </filter>
        </defs>
        <rect width="1600" height="900" fill={u("sky")} />
        <circle cx={palette.glowX} cy={palette.glowY} r={palette.glowSize} fill={u("glow")} />
        <path d={hillPath(rng, 620, 140)} fill={palette.far} opacity={0.55} />
        <SceneSilhouettes artKey={artKey} palette={palette} rng={rng} u={u} />
        <rect width="1600" height="900" fill={u("vignette")} />
      </svg>

      {/* Drifting fog */}
      <div
        className="absolute inset-x-0 bottom-0 h-2/3 w-[200%] animate-drift-slow opacity-80"
        style={{ background: `radial-gradient(ellipse 30% 40% at 25% 70%, ${palette.fog}, transparent), radial-gradient(ellipse 25% 35% at 75% 80%, ${palette.fog}, transparent)` }}
      />
      <div
        className="absolute inset-x-0 bottom-0 h-1/2 w-[200%] animate-drift opacity-70"
        style={{ background: `radial-gradient(ellipse 20% 50% at 40% 90%, ${palette.fog}, transparent), radial-gradient(ellipse 30% 40% at 90% 85%, ${palette.fog}, transparent)` }}
      />

      {/* Floating motes */}
      {particles.map((p, i) => (
        <span
          key={i}
          className="absolute animate-float rounded-full"
          style={{
            left: `${p.left}%`,
            top: `${p.top}%`,
            width: p.size,
            height: p.size,
            background: palette.particle,
            boxShadow: `0 0 ${p.size * 3}px ${palette.particle}`,
            animationDelay: `${p.delay}s`,
            animationDuration: `${p.duration}s`,
          }}
        />
      ))}
    </div>
  );
}
