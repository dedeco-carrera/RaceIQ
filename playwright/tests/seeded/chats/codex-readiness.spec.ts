import { expect, test } from "@playwright/test";
import { z } from "zod";
import { ExperimentSchema, SEEDED_CHAT_STREAM } from "./helpers";

test("Codex chat explains connection problems and sends a first message", async ({ page, request }) => {
  const original = await (await request.get("/api/settings")).json();
  const experiments = z.array(ExperimentSchema).parse(await (await request.get("/api/experiments?gameId=f1-2025")).json());
  const experiment = experiments[0];
  if (!experiment) throw new Error("Missing seeded F1 experiment");
  let state = "ready";
  await page.route("**/api/codex/status", (route) => route.fulfill({ json: { state, models: state === "ready" ? [{ id: "gpt-6-luna", name: "GPT-6 Luna" }] : [] } }));
  let submitted = "";
  await page.route(`**/api/experiments/${experiment.id}/chat*`, async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    submitted = route.request().postData() ?? "";
    await route.fulfill({ status: 200, contentType: "text/event-stream", headers: { "x-vercel-ai-ui-message-stream": "v1" }, body: SEEDED_CHAT_STREAM });
  });
  try {
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await page.getByRole("button", { name: "Settings", exact: true }).click();
    await page.getByRole("button", { name: "AI Analysis", exact: true }).click();
    await page.locator("#ai-chat-provider").click();
    await page.getByRole("option", { name: "Codex (ChatGPT)", exact: true }).click();
    await expect.poll(async () => (await (await request.get("/api/settings")).json()).chatProvider).toBe("codex");

    state = "not-signed-in";
    await page.goto(`/f125/experiments/${experiment.id}`, { waitUntil: "domcontentloaded" });
    await expect(page.getByText("Sign in with ChatGPT using Codex, then refresh.")).toBeVisible();
    state = "cli-unavailable";
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page.getByText("Codex CLI not found. Install Codex, then refresh.")).toBeVisible();
    state = "ready";
    await page.reload({ waitUntil: "domcontentloaded" });
    const input = page.getByRole("textbox", { name: "Message input" });
    await expect(input).toBeVisible();
    await input.fill("Explain this setup");
    await page.getByRole("button", { name: "Send message" }).click();
    await expect.poll(() => submitted).toContain("Explain this setup");
    await expect(page.getByText("Seeded streamed reply", { exact: true })).toBeVisible();
  } finally {
    await page.unrouteAll({ behavior: "ignoreErrors" });
    await request.put("/api/settings", { data: { chatProvider: original.chatProvider, chatModel: original.chatModel, chatThinkingBudget: original.chatThinkingBudget } });
  }
});
