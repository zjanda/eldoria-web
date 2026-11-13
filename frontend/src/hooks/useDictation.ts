import { useCallback, useEffect, useRef, useState } from "react";

/* Speech-to-text for the action box, using the browser's own speech recognition (Edge and Chrome).
   What is said is added to whatever is already typed; words still being recognised show live. */

interface RecognitionResult {
  isFinal: boolean;
  0: { transcript: string };
}
interface RecognitionEvent {
  resultIndex: number;
  results: ArrayLike<RecognitionResult>;
}
interface Recognition {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: RecognitionEvent) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}
type RecognitionConstructor = new () => Recognition;

function recognitionClass(): RecognitionConstructor | null {
  if (typeof window === "undefined") return null;
  const scope = window as unknown as { SpeechRecognition?: RecognitionConstructor; webkitSpeechRecognition?: RecognitionConstructor };
  return scope.SpeechRecognition ?? scope.webkitSpeechRecognition ?? null;
}

const MESSAGES: Record<string, string> = {
  "not-allowed": "The microphone is blocked. Allow it for this site in the browser's address bar.",
  "service-not-allowed": "The microphone is blocked. Allow it for this site in the browser's address bar.",
  "audio-capture": "No microphone was found.",
  network: "Speech recognition needs an internet connection.",
};

/** Joins dictated words onto typed text with one space between them. */
export function joinDictation(base: string, spoken: string): string {
  const words = spoken.trim();
  if (!words) return base;
  return base && !/\s$/.test(base) ? `${base} ${words}` : base + words;
}

export function useDictation(text: string, setText: (value: string) => void) {
  const supported = recognitionClass() !== null;
  const [listening, setListening] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const recognition = useRef<Recognition | null>(null);
  const textRef = useRef(text);
  textRef.current = text;

  const stop = useCallback(() => {
    recognition.current?.stop();
  }, []);

  const start = useCallback(() => {
    const Recognition = recognitionClass();
    if (!Recognition || recognition.current) return;
    const engine = new Recognition();
    engine.lang = navigator.language || "en-US";
    engine.continuous = true;
    engine.interimResults = true;
    const base = textRef.current;
    let heard = "";
    engine.onresult = (event) => {
      let interim = "";
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const result = event.results[i];
        if (result.isFinal) heard = joinDictation(heard, result[0].transcript);
        else interim = joinDictation(interim, result[0].transcript);
      }
      setText(joinDictation(base, joinDictation(heard, interim)));
    };
    engine.onerror = (event) => {
      if (event.error !== "no-speech" && event.error !== "aborted") setProblem(MESSAGES[event.error] ?? "Speech recognition stopped unexpectedly.");
    };
    engine.onend = () => {
      recognition.current = null;
      setListening(false);
      // Drop any words that were still being recognised when it stopped; keep the confirmed ones.
      setText(joinDictation(base, heard));
    };
    setProblem(null);
    recognition.current = engine;
    try {
      engine.start();
      setListening(true);
    } catch {
      recognition.current = null;
      setProblem("Speech recognition could not start.");
    }
  }, [setText]);

  useEffect(() => () => recognition.current?.abort(), []);

  return { supported, listening, problem, start, stop, toggle: listening ? stop : start };
}
