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

/**
 * What dictation has put in the box: the text it started from (`base`), the words confirmed since
 * (`heard`), and exactly what it last wrote (`written`), so edits made in between can be noticed.
 */
export interface DictationState {
  base: string;
  heard: string;
  written: string;
}

export function startDictation(current: string): DictationState {
  return { base: current, heard: "", written: current };
}

/**
 * The box after new speech. If the player changed the box since dictation last wrote to it (deleted
 * or retyped something), their version is kept as it is and new words are added after it; words
 * spoken earlier are never put back.
 */
export function applyDictation(state: DictationState, current: string, confirmed: string, interim: string): DictationState {
  const edited = current !== state.written;
  const base = edited ? current : state.base;
  const heard = joinDictation(edited ? "" : state.heard, confirmed);
  return { base, heard, written: joinDictation(base, joinDictation(heard, interim)) };
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
    let state = startDictation(textRef.current);
    const write = (next: DictationState) => {
      state = next;
      textRef.current = next.written; // so a second result before the next render is not taken for an edit
      setText(next.written);
    };
    engine.onresult = (event) => {
      let confirmed = "";
      let interim = "";
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const result = event.results[i];
        if (result.isFinal) confirmed = joinDictation(confirmed, result[0].transcript);
        else interim = joinDictation(interim, result[0].transcript);
      }
      write(applyDictation(state, textRef.current, confirmed, interim));
    };
    engine.onerror = (event) => {
      if (event.error !== "no-speech" && event.error !== "aborted") setProblem(MESSAGES[event.error] ?? "Speech recognition stopped unexpectedly.");
    };
    engine.onend = () => {
      recognition.current = null;
      setListening(false);
      // Drop words still being recognised when it stopped and keep the confirmed ones, unless the
      // player has edited the box since: then their text stays exactly as it is.
      if (textRef.current === state.written) write(applyDictation(state, state.written, "", ""));
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
