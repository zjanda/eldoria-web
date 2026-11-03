import { motion } from "framer-motion";
import { useImageUrl } from "../../hooks/useImageUrl";
import { Sigil } from "./Sigil";

interface PortraitProps {
  name: string;
  accent: string;
  sigil: string;
  imageKey?: string | null;
  size?: number;
  speaking?: boolean;
  dimmed?: boolean;
  shape?: "circle" | "frame";
  /** Makes the portrait a button, e.g. to open it larger. */
  onOpen?: () => void;
}

/** Character portrait: generated artwork when available, otherwise a heraldic crest. */
export function Portrait({ name, accent, sigil, imageKey, size = 56, speaking = false, dimmed = false, shape = "circle", onOpen }: PortraitProps) {
  const url = useImageUrl(imageKey);
  const rounded = shape === "circle" ? "rounded-full" : "rounded-lg";
  const Frame = onOpen ? motion.button : motion.div;
  return (
    <Frame
      type={onOpen ? "button" : undefined}
      onClick={onOpen}
      aria-label={onOpen ? `View ${name}'s portrait` : undefined}
      className={`relative shrink-0 overflow-hidden ${rounded} ${dimmed ? "grayscale opacity-50" : ""} ${onOpen ? "cursor-zoom-in transition hover:brightness-110 focus-visible:outline focus-visible:outline-1 focus-visible:outline-gold" : ""}`}
      style={{
        width: size,
        height: shape === "frame" ? size * 1.25 : size,
        boxShadow: speaking ? `0 0 0 2px ${accent}, 0 0 22px ${accent}88` : `0 0 0 1px rgba(201,161,74,0.45)`,
      }}
      animate={speaking ? { scale: [1, 1.04, 1] } : { scale: 1 }}
      transition={{ duration: 2.4, repeat: speaking ? Infinity : 0 }}
      title={name}
    >
      {url ? (
        <img src={url} alt={name} className="h-full w-full object-cover" />
      ) : (
        <div
          className="flex h-full w-full items-center justify-center"
          style={{ background: `radial-gradient(circle at 35% 30%, ${accent}66, #0c0e16 72%)`, color: accent }}
        >
          <Sigil name={sigil} className="h-[55%] w-[55%]" strokeWidth={1.2} />
          <span
            className="absolute bottom-[8%] font-display text-[0.6rem] tracking-[0.2em] text-parchment/70"
            style={{ fontSize: Math.max(8, size / 7) }}
          >
            {name.slice(0, 1)}
          </span>
        </div>
      )}
      <div className={`pointer-events-none absolute inset-0 ${rounded}`} style={{ boxShadow: "inset 0 0 18px rgba(0,0,0,0.6)" }} />
    </Frame>
  );
}
