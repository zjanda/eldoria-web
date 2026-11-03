import { motion } from "framer-motion";

const TONES = {
  hero: "linear-gradient(90deg, #7a2e2a, #c4553f 60%, #e07a5a)",
  enemy: "linear-gradient(90deg, #4d1f5e, #8e3fae 60%, #c06be0)",
  resource: "linear-gradient(90deg, #2c3f7a, #5a7ae0)",
};

export function HealthBar({
  current,
  max,
  tone = "hero",
  className = "",
  showNumbers = true,
}: {
  current: number;
  max: number;
  tone?: keyof typeof TONES;
  className?: string;
  showNumbers?: boolean;
}) {
  const percent = max > 0 ? Math.max(0, Math.min(100, (current / max) * 100)) : 0;
  return (
    <div className={className}>
      <div className="relative h-2.5 overflow-hidden rounded-full border border-white/10 bg-ink/80">
        <motion.div
          className="absolute inset-y-0 left-0 rounded-full"
          style={{ background: TONES[tone], boxShadow: "0 0 10px rgba(224,122,90,0.35)" }}
          initial={false}
          animate={{ width: `${percent}%` }}
          transition={{ type: "spring", stiffness: 120, damping: 20 }}
        />
        <div className="absolute inset-0 bg-gradient-to-b from-white/15 to-transparent" />
      </div>
      {showNumbers && (
        <p className="mt-0.5 text-right text-[0.65rem] tabular-nums text-mist">
          {current} / {max}
        </p>
      )}
    </div>
  );
}
