import { expect, test, type WebSocketRoute } from "@playwright/test";
import { setTimeout as delay } from "node:timers/promises";

test("practice coaching delivers one measured cue, three beeps and feedback", async ({ page }) => {
  await page.addInitScript(() => {
    const recorder = window as Window & { practiceBeeps: number; practiceSpeech: string[] };
    recorder.practiceBeeps = 0;
    recorder.practiceSpeech = [];
    Object.defineProperty(window, "AudioContext", { configurable: true, value: class {
      state = "running";
      currentTime = 0;
      destination = {};
      async resume() {}
      async close() { this.state = "closed"; }
      createOscillator() { return { frequency: { value: 0 }, connect() {}, start() { recorder.practiceBeeps++; }, stop() {} }; }
      createGain() { return { gain: { setValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect() {} }; }
    } });
    Object.defineProperty(window, "speechSynthesis", { configurable: true, value: { speaking: false, pending: false, cancel() {}, speak(utterance: { text: string }) { recorder.practiceSpeech.push(utterance.text); } } });
    Object.defineProperty(window, "SpeechSynthesisUtterance", { configurable: true, value: class { lang = ""; constructor(public text: string) {} } });
  });
  const lap = (id: number, time: number) => ({ id, sessionId: 9, lapNumber: id, lapTime: time, isValid: true, classification: "pace", gameId: "f1-2025", carId: "476", trackId: "19", createdAt: "2026-10-31", ownership: "mine", telemetryAvailable: true, processing: { state: "ready", stage: null, error: null } });
  const laps = [lap(1, 90), lap(2, 91), lap(3, 92)];
  const plan = { referenceLapId: 1, comparisonLapIds: [2, 3], trackLengthM: 1000, corner: { name: "Turn 4", number: 4, startFrac: 0.4, endFrac: 0.55, referenceTimeS: 2.9, recentMeanTimeS: 3.2, meanLossS: 0.3, referenceBrakeFrac: 0.35, recentMeanBrakeDeltaM: -10, referenceExitSpeedMps: 50, recentMeanExitSpeedMps: 48 } };
  await page.route((url) => url.pathname === "/api/practice/references", (route) => route.fulfill({ json: { scope: "local", targetSeconds: 89.64, tolerancePercent: 0.2, personalBest: laps[0], nextStep: null, fastest: laps[0], candidates: laps } }));
  await page.route((url) => url.pathname === "/api/practice/corner-plan", (route) => route.fulfill({ json: { plan } }));
  await page.route((url) => /\/api\/laps\/\d+\/practice-insights$/.test(url.pathname), (route) => route.fulfill({ json: { insights: [] } }));
  const ids = ["identity.car-id", "identity.track-id", "session.session-type", "motion.speed", "inputs.brake", "timing.lap-number", "timing.lap-fraction"];
  const schema = { type: "telemetry-schema", protocolVersion: 1, schemaId: "practice-test", simulator: "f1-2025", catalogVersion: "1", catalogHash: "test", catalogSchemaVersion: "1", parserVersion: "1", resolverVersion: "1", derivationVersion: "1", definitions: ids.map((semanticId) => ({ semanticId, unit: null, mappingStatus: "direct", schemaVersion: "1", limitations: [] })) };
  let socket: WebSocketRoute | undefined;
  await page.routeWebSocket("**/ws", (connection) => {
    socket = connection;
    connection.send(JSON.stringify({ type: "status", udpPps: 60, telemetryPps: 60, isRaceOn: true, droppedPackets: 0, udpPort: 15332, detectedGame: { id: "f1-2025", name: "F1 2025" }, currentSession: { carId: "476", trackId: "19" } }));
    connection.send(JSON.stringify(schema));
    connection.send(JSON.stringify({ type: "session-laps", laps }));
  });
  let sequence = 0;
  const send = (lapNumber: number, fraction: number) => {
    sequence++;
    socket!.send(JSON.stringify({ type: "telemetry-frame", protocolVersion: 1, schemaId: "practice-test", streamId: "test-stream", sessionId: 9, sequence, observedAt: { domain: "session", milliseconds: sequence * 100 }, receivedAtMs: Date.now(), values: ["476", "19", "practice-1", 50, 0, lapNumber, fraction], context: {} }));
  };
  await page.goto("/live");
  await expect.poll(() => !!socket).toBe(true);
  send(4, 0.99);
  const panel = page.getByRole("region", { name: "Practice coach" });
  await expect(panel.getByText("Turn 4: average loss 0.30 s across 2 laps versus reference.")).toBeVisible();
  await panel.getByRole("button", { name: "Enable coaching audio" }).click();
  send(4, 0.99);
  await delay(40);
  send(5, 0);
  await delay(40);
  for (let index = 1; index <= 115; index++) {
    send(5, index * 0.005);
    await delay(20);
  }
  await expect.poll(() => page.evaluate(() => (window as Window & { practiceBeeps: number }).practiceBeeps)).toBe(3);
  const speech = await page.evaluate(() => (window as Window & { practiceSpeech: string[] }).practiceSpeech);
  expect(speech.some((item) => item.includes("Reference braked 10 metres later"))).toBe(true);
  expect(speech.some((item) => item.includes("0.20 seconds quicker"))).toBe(true);
  await expect(panel.getByRole("status")).toContainText("0.20 seconds quicker");
});
