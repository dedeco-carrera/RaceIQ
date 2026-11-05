import { expect, test } from "@playwright/test";
import { createSocket } from "node:dgram";
import { setTimeout as delay } from "node:timers/promises";
import { readUdpDump } from "@raceiq/backend-core/test-support/recordings/udp";

const recording = process.env.RACEIQ_F1_2026_CAPTURE;

test("practice reference picker imports shared archives and audio requires opt-in", async ({ page }) => {
  test.skip(!recording, "Set RACEIQ_F1_2026_CAPTURE to the private relay capture.");
  const lap = (id: number, lapTime: number, ownership: "mine" | "others") => ({ id, sessionId: 1, lapNumber: id, lapTime, isValid: true, classification: "pace", gameId: "f1-2025", carId: "476", trackId: "19", createdAt: "2026-10-31", ownership, telemetryAvailable: true, processing: { state: "ready", stage: null, error: null } });
  const personalBest = lap(1, 90, "mine");
  const nextStep = lap(2, 89.64, "others");
  const fastest = lap(3, 85, "others");
  let gameHeader = "";
  let importBody = "";
  await page.route((url) => url.pathname === "/api/practice/references", (route) => {
    gameHeader = route.request().headers()["x-game-id"] ?? "";
    return route.fulfill({ json: { scope: "local", targetSeconds: 89.64, tolerancePercent: 0.2, personalBest, nextStep, fastest, candidates: [fastest, nextStep, personalBest] } });
  });
  await page.route((url) => url.pathname === "/api/laps/import-zip", (route) => {
    importBody = route.request().postData() ?? "";
    return route.fulfill({ json: { imported: 1, skipped: 0 } });
  });
  await page.goto("/live");
  const socket = createSocket("udp4");
  await new Promise<void>((resolve, reject) => { socket.once("error", reject); socket.connect(15332, "127.0.0.1", resolve); });
  const frames = readUdpDump(recording!);
  let stopped = false;
  const playback = (async () => {
    for (let index = 0; index < frames.length && !stopped; index++) {
      await new Promise<void>((resolve, reject) => socket.send(frames[index]!, (error) => error ? reject(error) : resolve()));
      if (index % 20 === 0) await delay(5);
    }
  })();
  try {
    const panel = page.getByRole("region", { name: "Practice coach" });
    await expect(panel).toBeVisible();
    await expect.poll(() => gameHeader).toBe("f1-2025");
    await expect(panel.getByText("Next-step target: 1:29.640")).toBeVisible();
    await panel.getByRole("combobox", { name: "Practice reference" }).click();
    await page.getByRole("option", { name: /Next step \(0\.4% faster\).*1:29\.640/ }).click();
    await expect(panel).toHaveAttribute("data-reference-lap-id", "2");
    const audio = panel.getByRole("button", { name: "Enable coaching audio" });
    await expect(audio).toHaveAttribute("aria-pressed", "false");
    await audio.click();
    await expect(panel.getByRole("button", { name: "Disable coaching audio" })).toHaveAttribute("aria-pressed", "true");
    await panel.getByRole("button", { name: "Disable coaching audio" }).click();
    await page.locator('input[type="file"][accept=".zip,application/zip"]').setInputFiles({ name: "shared.zip", mimeType: "application/zip", buffer: Buffer.from("fixture") });
    await expect(panel.getByText("Imported 1 lap(s).")).toBeVisible();
    expect(importBody).toContain("others");
  } finally {
    stopped = true;
    try { await playback; } finally { socket.close(); }
  }
});
