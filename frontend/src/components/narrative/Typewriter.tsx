import { useEffect, useRef, useState } from "react";

interface TypewriterProps {
  text: string;
  msPerChar: number;
  skip: boolean;
  onProgress?: () => void;
  onDone: () => void;
}

/** Reveals text over time; respects a skip signal and reduced motion. */
export function Typewriter({ text, msPerChar, skip, onProgress, onDone }: TypewriterProps) {
  const [count, setCount] = useState(msPerChar <= 0 || skip ? text.length : 0);
  const doneRef = useRef(false);

  useEffect(() => {
    if (skip || msPerChar <= 0) setCount(text.length);
  }, [skip, msPerChar, text.length]);

  useEffect(() => {
    if (count >= text.length) {
      if (!doneRef.current) {
        doneRef.current = true;
        onDone();
      }
      return;
    }
    const step = Math.max(1, Math.round(16 / Math.max(msPerChar, 1)));
    const timer = window.setTimeout(() => {
      setCount((c) => Math.min(text.length, c + step));
      onProgress?.();
    }, Math.max(msPerChar, 16) * (step === 1 ? 1 : 0.9));
    return () => window.clearTimeout(timer);
  }, [count, text.length, msPerChar, onDone, onProgress]);

  return (
    <span>
      {text.slice(0, count)}
      {count < text.length && <span className="ml-0.5 inline-block h-4 w-[2px] animate-pulse bg-gold/70 align-middle" />}
    </span>
  );
}
