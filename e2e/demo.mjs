// A stranger's first minute: from the front page into a demo, with colleagues
// already at work. Run against a build with DEMO=on: E2E_URL=... node e2e/demo.mjs
import { mkdirSync } from "node:fs";
import { chromium } from "playwright";

const BASE = process.env.E2E_URL ?? "http://localhost:3000";
const SHOTS = process.env.E2E_SHOTS ?? "e2e/shots";
mkdirSync(SHOTS, { recursive: true });

const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: 1280, height: 800 },
  locale: "da-DK",
  ignoreHTTPSErrors: true,
  deviceScaleFactor: Number(process.env.E2E_SCALE ?? 1),
});
const page = await context.newPage();
const problems = [];
page.on("pageerror", (e) => problems.push(e.message));
page.on("console", (m) => {
  if (m.type() === "error" && !/Failed to load resource/.test(m.text()))
    problems.push(m.text().slice(0, 300));
});

await page.goto(BASE);
await page.screenshot({ path: `${SHOTS}/landing.png`, fullPage: true });
await page.getByRole("link", { name: "Prøv demoen" }).first().click();
await page.waitForURL("**/home", { timeout: 30_000 });
await page.getByText("Det her er en demo.").waitFor();
await page
  .getByRole("link", { name: /Indbakke/ })
  .filter({ hasText: "1" })
  .waitFor();
await page.screenshot({ path: `${SHOTS}/demo-home.png` });

await page.getByRole("link", { name: "Sommerfesten" }).last().click();
await page.getByRole("link", { name: "Planen" }).last().click();
await page.waitForURL("**/pages/*");
await page.locator(".facade-page").getByText("120 gæster").waitFor();

// Somebody else is here: the point of the whole product, in the first minute.
await page.locator(".collaboration-carets__label", { hasText: "Anna Holm" }).waitFor({
  timeout: 15_000,
});
await page.getByLabel("På siden lige nu").getByRole("img", { name: "Anna Holm" }).waitFor();
await page.waitForTimeout(2500);
await page.screenshot({ path: `${SHOTS}/demo-anna.png` });
await page.locator(".facade-page").getByText("lørdag morgen.").waitFor({ timeout: 20_000 });

await page.getByRole("button", { name: "Samtale" }).click();
await page.getByText("Skal der ikke stå noget om regnvejr her?").waitFor();
await page.screenshot({ path: `${SHOTS}/demo-page.png` });

await page.goto(`${BASE}/inbox`);
await page.getByText("Jonas Berg nævnte dig").waitFor();
await page.goto(`${BASE}/home`);
await page
  .getByRole("link", { name: /Sommerfesten/ })
  .nth(1)
  .waitFor();
await page
  .locator("nav")
  .getByRole("link", { name: /^#?\s*Sommerfesten/ })
  .last()
  .click();
await page.waitForURL("**/channels/*");
await page.getByText("Hvem tager sig af teltet?").waitFor();
await page.getByRole("button", { name: "1 svar" }).waitFor();
// Read means read: the count in the rail goes by itself.
await page.locator("nav").getByRole("link", { name: "Sommerfesten", exact: true }).last().waitFor();
await page.screenshot({ path: `${SHOTS}/demo-channel.png` });

await page.goto(`${BASE}/settings/agents`);
await page.getByText("Agenter er slået fra i demoen.").waitFor();

await browser.close();
if (problems.length) {
  console.error(`PROBLEMS\n${[...new Set(problems)].join("\n")}`);
  process.exit(1);
}
console.log("OK: a stranger got in, and found people at work.");
