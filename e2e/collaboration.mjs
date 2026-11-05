// The whole point of Facade, in two real browsers: a person signs up, invites
// a colleague by link, and the two write on one page and talk beside it.
// Run against a dev server on an empty database: pnpm e2e
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const BASE = process.env.E2E_URL ?? "http://localhost:3000";
const SHOTS = process.env.E2E_SHOTS ?? "e2e/shots";
const PASSWORD = "en-lang-test-adgangskode-42";
mkdirSync(SHOTS, { recursive: true });

const browser = await chromium.launch();
const problems = [];

async function person(name, viewport = { width: 1280, height: 800 }) {
  const context = await browser.newContext({ viewport, locale: "da-DK", ignoreHTTPSErrors: true });
  const page = await context.newPage();
  page.on("pageerror", (e) => problems.push(`${name}: ${e.message}`));
  page.on("console", (m) => {
    if (m.type() === "error" && !/Failed to load resource|\[Fast Refresh\]/.test(m.text()))
      problems.push(`${name} console: ${m.text().slice(0, 300)}`);
  });
  return page;
}

const step = (text) => console.log(`· ${text}`);
const editor = (p) => p.locator(".facade-page");

const martin = await person("Martin");
step("first account opens the installation");
await martin.goto(`${BASE}/register`);
await martin.fill("#name", "Martin Vinther");
await martin.fill("#email", "martin@example.com");
await martin.fill("#organizationName", "Ukendt");
await martin.fill("#password", PASSWORD);
await martin.click('button[type="submit"]');
await martin.waitForURL("**/home", { timeout: 30_000 });

step("a project and a page");
await martin.getByRole("button", { name: "Nyt projekt" }).first().click();
await martin.fill("#name-dialog", "Spilmotor");
await martin.keyboard.press("Enter");
await martin.waitForURL("**/projects/*");
await martin.getByRole("button", { name: "Ny side" }).first().click();
await martin.waitForURL("**/pages/*");
const pageUrl = martin.url();
await martin.getByLabel("Sidens titel").fill("Skakmester");
await editor(martin).click();
await martin.keyboard.type("Fælles tekst. ");

step("invite a colleague by link");
await martin.goto(`${BASE}/settings/workspace`);
await martin.fill('input[type="email"]', "kasper@example.com");
await martin.getByRole("button", { name: "Lav et link" }).click();
const link = await martin.locator("code").first().textContent();
if (!link?.includes("/join/")) throw new Error(`no invitation link, got: ${link}`);

const kasper = await person("Kasper");
await kasper.goto(link);
await kasper.fill("#join-name", "Kasper Holm");
await kasper.fill("#join-password", PASSWORD);
await kasper.click('button[type="submit"]');
await kasper.waitForURL("**/home", { timeout: 30_000 });

step("both on the page, writing at the same moment");
await martin.goto(pageUrl);
await kasper.goto(pageUrl);
await editor(martin).waitFor();
await editor(kasper).waitFor();
await kasper.getByLabel("På siden lige nu").getByRole("img", { name: "Martin Vinther" }).waitFor();
await martin.getByLabel("På siden lige nu").getByRole("img", { name: "Kasper Holm" }).waitFor();

await editor(martin).click();
await martin.keyboard.press("End");
await editor(kasper).click();
await kasper.keyboard.press("End");
await kasper.keyboard.press("Enter");
await Promise.all([
  martin.keyboard.type("Martin skriver her uden at stoppe. ", { delay: 12 }),
  kasper.keyboard.type("Kasper skriver samtidig på sin linje.", { delay: 12 }),
]);
for (const p of [martin, kasper]) {
  await editor(p).getByText("Martin skriver her uden at stoppe.").waitFor({ timeout: 8000 });
  await editor(p).getByText("Kasper skriver samtidig på sin linje.").waitFor({ timeout: 8000 });
}
await kasper.locator(".collaboration-carets__label", { hasText: "Martin" }).waitFor();
await martin.screenshot({ path: `${SHOTS}/page-together.png` });

step("nothing is lost: a fresh load shows both");
await martin.getByText("Gemt").waitFor({ timeout: 8000 });
await kasper.getByText("Gemt").waitFor({ timeout: 8000 });
await new Promise((r) => setTimeout(r, 3500));
await kasper.reload();
await editor(kasper).getByText("Martin skriver her uden at stoppe.").waitFor();
await editor(kasper).getByText("Kasper skriver samtidig på sin linje.").waitFor();
const text = await editor(kasper).innerText();
if ((text.match(/Fælles tekst/g) ?? []).length !== 1) throw new Error(`doubled text: ${text}`);

step("a dropped connection costs a delay, not a word");
await kasper.reload();
await editor(kasper).waitFor();
await editor(martin).click();
await martin.keyboard.press("End");
await martin.context().setOffline(true);
await martin.keyboard.type(" Skrevet uden net.");
await martin.getByText("Ikke gemt endnu").waitFor({ timeout: 15_000 });
await martin.context().setOffline(false);
await editor(kasper).getByText("Skrevet uden net.").waitFor({ timeout: 40_000 });
await martin.getByText("Gemt").waitFor({ timeout: 20_000 });

step("a slash command and a mention");
await editor(martin).locator("p").last().click();
await martin.keyboard.press("End");
await martin.keyboard.press("Enter");
await martin.keyboard.type("/opgave");
await martin.keyboard.press("Enter");
await martin.keyboard.type("Print kuverter @Kas");
await martin.getByRole("option", { name: "Kasper Holm" }).waitFor();
await martin.keyboard.press("Enter");
await editor(kasper).locator('ul[data-type="taskList"] p', { hasText: "Print kuverter" }).waitFor();

step("the conversation beside the page");
await kasper.getByRole("button", { name: "Samtale" }).click();
await martin.getByRole("button", { name: "Samtale" }).click();
await kasper.getByLabel("Skriv en kommentar").fill("Skal vi ændre gåde tre?");
await kasper.keyboard.press("Enter");
await martin.getByText("Skal vi ændre gåde tre?").waitFor({ timeout: 8000 });
await martin.getByLabel("Skriv en kommentar").fill("Ja, jeg tager den");
await martin.keyboard.press("Enter");
await kasper.getByText("Ja, jeg tager den").waitFor({ timeout: 8000 });
await martin.screenshot({ path: `${SHOTS}/page-talk.png` });

step("a channel: unread, message, thread, reaction");
const channel = kasper.getByRole("link", { name: /Spilmotor/ }).last();
await martin.goto(`${BASE}/home`);
await martin.getByRole("link", { name: "generelt" }).click();
await martin.waitForURL("**/channels/*");
await martin.getByLabel("Skriv til #generelt").fill("Hej @Kasper Holm, er du klar?");
await martin.keyboard.press("Enter");
await kasper
  .getByRole("link", { name: /generelt/ })
  .filter({ hasText: "1" })
  .waitFor({ timeout: 8000 });
await kasper.getByRole("link", { name: /generelt/ }).click();
await kasper.waitForURL("**/channels/*");
await kasper.getByText("er du klar?").waitFor();
await kasper.locator("article", { hasText: "er du klar?" }).hover();
await kasper.getByRole("button", { name: "Svar i tråd" }).click();
await kasper.getByLabel("Svar i tråden").fill("Klar!");
await kasper.keyboard.press("Enter");
await martin.getByRole("button", { name: "1 svar" }).waitFor({ timeout: 8000 });
await martin.screenshot({ path: `${SHOTS}/channel.png` });
void channel;

step("the inbox and search");
await kasper.goto(`${BASE}/inbox`);
await kasper.getByText("Martin Vinther nævnte dig").first().waitFor();
await kasper.screenshot({ path: `${SHOTS}/inbox.png` });
await kasper.keyboard.press("Control+k");
await kasper.getByPlaceholder("Søg i sider og beskeder").fill("kuvert");
await kasper.getByRole("button", { name: /Skakmester/ }).waitFor({ timeout: 8000 });
await kasper.screenshot({ path: `${SHOTS}/search.png` });
await kasper.keyboard.press("Escape");

step("the phone");
const phone = await person("Martin på telefonen", { width: 390, height: 844 });
await phone.context().addCookies(await martin.context().cookies());
await phone.goto(pageUrl);
await editor(phone).waitFor();
await phone.screenshot({ path: `${SHOTS}/phone-page.png` });
const wide = await phone.evaluate(() => document.documentElement.scrollWidth > innerWidth);
if (wide) problems.push("phone: the page scrolls sideways");

await browser.close();
if (problems.length) {
  console.error("\nPROBLEMS\n" + [...new Set(problems)].join("\n"));
  process.exit(1);
}
console.log("\nOK: two people wrote on one page and talked beside it.");
