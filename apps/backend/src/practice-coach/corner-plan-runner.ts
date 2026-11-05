import { Worker } from "node:worker_threads";
import { IS_COMPILED } from "@raceiq/backend-core/runtime/config/paths";
import type { PracticeCornerPlan } from "@raceiq/shared/racing/practice/coaching";

const MAX_CONCURRENT = 2;
const TIMEOUT_MS = 30_000;
let active = 0;

export class PracticePlanBusyError extends Error {}

/** Decode and compare captures outside the live packet processing thread. */
export async function runPracticeCornerPlan(input: { referenceId: number; lapIds: number[]; trackId: string; carId: string; sessionId: number }, signal: AbortSignal): Promise<{ plan: PracticeCornerPlan | null } | { error: string }> {
  if (active >= MAX_CONCURRENT) throw new PracticePlanBusyError("Practice coaching is busy");
  if (signal.aborted) throw new Error("Practice coaching cancelled");
  active++;
  let termination: Promise<number> | undefined;
  try {
    const worker = new Worker(IS_COMPILED ? "./apps/backend/src/practice-coach/corner-plan-worker.ts" : new URL("./corner-plan-worker.ts", import.meta.url), { workerData: input });
    return await new Promise((resolve, reject) => {
      let settled = false;
      const finish = (result?: { plan: PracticeCornerPlan | null } | { error: string }, error?: Error) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        signal.removeEventListener("abort", abort);
        termination = worker.terminate();
        if (error) reject(error);
        else resolve(result!);
      };
      const abort = () => finish(undefined, new Error("Practice coaching cancelled"));
      const timer = setTimeout(() => finish(undefined, new Error("Practice coaching timed out")), TIMEOUT_MS);
      signal.addEventListener("abort", abort, { once: true });
      worker.once("message", (result: { plan: PracticeCornerPlan | null } | { error: string }) => finish(result));
      worker.once("error", (error) => finish(undefined, error instanceof Error ? error : new Error(String(error))));
      worker.once("exit", (code) => finish(undefined, new Error(`Practice coaching worker exited (${code})`)));
      if (signal.aborted) abort();
    });
  } finally {
    if (termination) await termination;
    active--;
  }
}
