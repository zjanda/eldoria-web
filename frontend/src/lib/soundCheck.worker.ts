/** Runs the nearby-sound check off the main thread, so measuring a take never stalls the game. */
import { assessTake } from "./soundCheck";

interface CheckRequest {
  id: number;
  samples: Float32Array;
  sampleRate: number;
  detailed: boolean;
}

const scope = self as unknown as { onmessage: ((event: MessageEvent<CheckRequest>) => void) | null; postMessage: (message: unknown) => void };

scope.onmessage = (event) => {
  const { id, samples, sampleRate, detailed } = event.data;
  scope.postMessage({ id, result: assessTake(samples, sampleRate, detailed) });
};
