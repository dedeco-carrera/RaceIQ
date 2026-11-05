import { expect, test } from "@playwright/test";
import { createSocket } from "node:dgram";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { readUdpDump } from "@raceiq/backend-core/test-support/recordings/udp";
import { iterateSessionCaptureRecords } from "../../../packages/capture-formats/src/session/framing";

const manifestPath = process.env.RACEIQ_F1_PRACTICE_MANIFEST;
const audible = process.env.RACEIQ_COACH_DEMO === "1";
type Chunk = { kind: string; lapNumber?: number; path: string; ownedFrameByteOffset: number; ownedFrameCount: number; trailingContextFrameCount?: number };

test("real F1 UDP session produces practice coaching", async ({ page }) => {
  test.skip(!manifestPath, "Set RACEIQ_F1_PRACTICE_MANIFEST to a private time-trial or practice capture manifest.");
  test.setTimeout(audible ? 900_000 : 300_000);
  await page.addInitScript((playAudio) => {
    if (playAudio) return;
    const result = window as unknown as Window & { coachingSpeech: string[]; coachingBeeps: number };
    result.coachingSpeech = [];
    result.coachingBeeps = 0;
    Object.defineProperty(window, "AudioContext", { configurable: true, value: class {
      state = "running";
      currentTime = 0;
      destination = {};
      async resume() {}
      async close() { this.state = "closed"; }
      createOscillator() { return { frequency: { value: 0 }, connect() {}, start() { result.coachingBeeps++; }, stop() {} }; }
      createGain() { return { gain: { setValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect() {} }; }
    } });
    Object.defineProperty(window, "speechSynthesis", { configurable: true, value: { speaking: false, pending: false, cancel() {}, speak(utterance: { text: string }) { result.coachingSpeech.push(utterance.text); } } });
    Object.defineProperty(window, "SpeechSynthesisUtterance", { configurable: true, value: class { lang = ""; constructor(public text: string) {} } });
  }, audible);

  const manifest = JSON.parse(readFileSync(manifestPath!, "utf8")) as { gameId: string; chunks: Chunk[] };
  expect(manifest.gameId).toBe("f1-2025");
  const chunks = manifest.chunks.filter((chunk) => chunk.kind === "lap" && chunk.lapNumber !== undefined && chunk.lapNumber >= 1 && chunk.lapNumber <= 5).sort((a, b) => a.lapNumber! - b.lapNumber!);
  expect(chunks.map((chunk) => chunk.lapNumber)).toEqual([1, 2, 3, 4, 5]);
  const frames: Buffer[] = [];
  let finalLap: Buffer[] = [];
  for (const [index, chunk] of chunks.entries()) {
    const file = join(dirname(manifestPath!), chunk.path);
    const records = [...iterateSessionCaptureRecords(readFileSync(file), 0, { strict: true })].filter((record) => record.kind === "frame");
    const packets = readUdpDump(file);
    expect(records.length).toBe(packets.length);
    const start = records.findIndex((record) => record.offset === chunk.ownedFrameByteOffset);
    expect(start).toBeGreaterThanOrEqual(0);
    const end = start + chunk.ownedFrameCount + (index === chunks.length - 1 ? chunk.trailingContextFrameCount ?? 0 : 0);
    expect(end).toBeLessThanOrEqual(packets.length);
    const owned = packets.slice(start, start + chunk.ownedFrameCount);
    if (index === chunks.length - 1) finalLap = owned;
    frames.push(...packets.slice(index === 0 ? 0 : start, end));
  }
  // The recording ends just after lap 5. Replay its real inputs once more as
  // lap 6 so the coach has a complete lap after the reference is ready.
  // Only session timestamps and the player lap number are synthetic.
  expect(finalLap.length).toBeGreaterThan(0);
  const demoStartIndex = frames.length;
  const timeShift = frames.at(-1)!.readFloatLE(15) - finalLap[0]!.readFloatLE(15) + 0.02;
  for (const original of finalLap) {
    const frame = Buffer.from(original);
    frame.writeFloatLE(frame.readFloatLE(15) + timeShift, 15);
    if (frame[6] === 2) {
      const offset = 29 + 57 * frame[27]! + 33;
      if (offset < frame.length) frame[offset] = frame[offset]! + 1;
    }
    frames.push(frame);
  }
  expect(frames.length).toBeGreaterThan(10_000);
  await page.goto("/live");
  const socket = createSocket("udp4");
  await new Promise<void>((done, reject) => { socket.once("error", reject); socket.connect(15332, "127.0.0.1", done); });
  let stopped = false;
  const playback = (async () => {
    let previousUid = "", previousTime = 0, pendingDelay = 0;
    for (let index = 0; index < frames.length && !stopped; index++) {
      const frame = frames[index]!;
      const uid = frame.readBigUInt64LE(7).toString(), time = frame.readFloatLE(15);
      if (uid === previousUid) pendingDelay += Math.max(0, time - previousTime) * (index >= demoStartIndex ? 1000 : 250);
      previousUid = uid; previousTime = time;
      await new Promise<void>((done, reject) => socket.send(frame, (error) => error ? reject(error) : done()));
      if (index % 20 === 0) { await delay(Math.max(5, pendingDelay)); pendingDelay = 0; }
    }
  })();
  void playback.catch(() => { stopped = true; });
  try {
    const panel = page.getByRole("region", { name: "Practice coach" });
    await expect(panel).toBeVisible({ timeout: 60_000 });
    await panel.getByRole("button", { name: "Enable coaching audio" }).click();
    await expect(panel.getByText(/average loss .* across .* laps versus reference/)).toBeVisible({ timeout: audible ? 600_000 : 240_000 });
    if (audible) {
      await expect(panel.getByRole("status")).toContainText("Next:", { timeout: 180_000 });
      await expect(panel.getByRole("status")).toContainText(/quicker|slower|matched/, { timeout: 180_000 });
    } else {
      await expect.poll(() => page.evaluate(() => (window as unknown as Window & { coachingSpeech: string[] }).coachingSpeech), { timeout: 120_000 }).toEqual(expect.arrayContaining([expect.stringMatching(/Next:/)]));
      await expect.poll(() => page.evaluate(() => (window as unknown as Window & { coachingSpeech: string[] }).coachingSpeech), { timeout: 120_000 }).toEqual(expect.arrayContaining([expect.stringMatching(/quicker|slower|matched/)]));
    }
  } finally {
    stopped = true;
    try { await playback; } finally { socket.close(); }
  }
});
