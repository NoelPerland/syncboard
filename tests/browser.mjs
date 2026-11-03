import assert from "node:assert/strict";
import { chromium } from "playwright-core";
import { mkdtemp, rm, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { once } from "node:events";
import { createServer } from "node:net";
import { spawn } from "node:child_process";

const root = await mkdtemp(join(tmpdir(), "syncboard-ui-"));
const out = process.env.QA_OUTPUT || ".qa/redesign";
await mkdir(out, { recursive: true });
const probe = createServer();
probe.listen(0, "127.0.0.1");
await once(probe, "listening");
const port = probe.address().port;
await new Promise((resolve) => probe.close(resolve));
const base = "http://127.0.0.1:" + port;
const server = spawn(process.execPath, ["server.mjs", "--production"], {
  env: {
    ...process.env,
    PORT: String(port),
    DATABASE_URL: "",
    SYNC_DATA: root,
  },
  stdio: ["ignore", "pipe", "pipe"],
});
let log = "";
server.stdout.on("data", (d) => (log += d));
server.stderr.on("data", (d) => (log += d));
let browser;
try {
  let loaded = false;
  for (let i = 0; i < 150; i++) {
    if (server.exitCode !== null) throw Error(log);
    try {
      loaded = (await fetch(base)).ok;
    } catch {}
    if (loaded) break;
    await new Promise((r) => setTimeout(r, 200));
  }
  assert(loaded, log);
  browser = await chromium.launch({
    executablePath:
      process.env.CHROME_PATH ||
      "C:/Program Files/Google/Chrome/Application/chrome.exe",
  });
  const a = await browser.newContext({
      viewport: { width: 1440, height: 900 },
    }),
    b = await browser.newContext({ viewport: { width: 1366, height: 768 } });
  const p = await a.newPage(),
    q = await b.newPage();
  const errors = [];
  for (const page of [p, q])
    page.on("pageerror", (e) => errors.push(e.message));
  await p.goto(base);
  await p.locator(".preview-note").first().waitFor();
  await p.waitForFunction(() =>
    [...document.querySelectorAll(".preview-note,.studio-title > span")].every(
      (node) => Number(getComputedStyle(node).opacity) > 0.99,
    ),
  );
  for (const width of [1440, 390]) {
    await p.setViewportSize({ width, height: 900 });
    assert(
      await p.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    );
    await p.screenshot({
      path: join(out, `entry-${width}.png`),
      fullPage: true,
    });
  }
  await p.setViewportSize({ width: 1440, height: 900 });
  const previewTitle = await p.locator(".preview-note h2").first().innerText();
  await p
    .getByRole("button", { name: `Move ${previewTitle} forward`, exact: true })
    .click();
  await p
    .getByRole("button", { name: "Enter your shared board", exact: false })
    .click();
  await p.getByText("Synced", { exact: true }).waitFor();
  await p
    .locator(".lane")
    .filter({ has: p.getByRole("heading", { name: /In progress/ }) })
    .getByText(previewTitle, { exact: true })
    .waitFor();
  await q.goto(p.url());
  await q.getByText("Synced", { exact: true }).waitFor();
  await p.keyboard.press("n");
  await p.getByLabel("New card title").fill("Verify release handoff");
  await p.getByLabel("New card title").press("Enter");
  const task = (page) =>
    page
      .getByRole("button")
      .filter({ hasText: "Verify release handoff" })
      .first();
  await task(q).waitFor();
  await p.evaluate(() => { window.dragEvents = []; for (const type of ["dragstart", "dragover", "drop", "dragend"]) window.addEventListener(type, (event) => window.dragEvents.push({ type, target: event.target.className, id: event.dataTransfer?.getData("text/plain") }), true); });
  try {
    await task(p).dragTo(
      p
        .locator(".lane")
        .filter({ has: p.getByRole("heading", { name: /In progress/ }) }),
    );
    await q
      .locator(".lane")
      .filter({ has: q.getByRole("heading", { name: /In progress/ }) })
      .getByText("Verify release handoff", { exact: true })
      .waitFor();
  } catch (error) {
    await p.screenshot({ path: join(out, "drag-failure.png"), fullPage: true });
    console.log(await p.locator(".lane").allInnerTexts());
    console.log(await p.evaluate(() => window.dragEvents));
    throw error;
  }
  await task(p).click();
  await task(q).click();
  const notes = (page) => page.getByLabel("Shared notes");
  await Promise.all([
    notes(p).fill("Design review. "),
    notes(q).fill("Ship checklist. "),
  ]);
  await p.waitForFunction(() => {
    const t = document.querySelector("textarea").value;
    return t.includes("Design review.") && t.includes("Ship checklist.");
  });
  await q.waitForFunction(() => {
    const t = document.querySelector("textarea").value;
    return t.includes("Design review.") && t.includes("Ship checklist.");
  });
  assert.equal(await notes(p).inputValue(), await notes(q).inputValue());
  await p.getByLabel("Add comment").fill("Checked keyboard and touch flow.");
  await p.getByRole("button", { name: "Post comment" }).click();
  await q
    .getByText("Checked keyboard and touch flow.", { exact: true })
    .waitFor();
  await q.getByLabel("Status").selectOption("Review");
  await p.waitForFunction(
    () => document.querySelector("select").value === "Review",
  );
  await Promise.all([p.keyboard.press("Escape"), q.keyboard.press("Escape")]);
  await q.mouse.move(550, 480);
  await p.locator(".cursor").first().waitFor();
  await p.getByRole("button", { name: /Activity/ }).click();
  await p.getByText("commented on", { exact: false }).first().waitFor();
  await p.keyboard.press("Escape");
  await p.keyboard.press("Control+k");
  assert(
    await p
      .getByLabel("Filter cards")
      .evaluate((el) => el === document.activeElement),
  );
  await p.getByLabel("Filter cards").fill("Verify release");
  assert.equal(await p.locator(".task").count(), 1);
  await p.getByLabel("Filter cards").fill("");
  await p.keyboard.press("Escape");
  await p.reload();
  await task(p).click();
  assert.match(await notes(p).inputValue(), /Ship checklist/);
  await p.getByRole("button", { name: "Close ×" }).click();
  await p.screenshot({ path: join(out, "board-desktop.png"), fullPage: true });
  for (const [width, height] of [
    [390, 844],
    [360, 640],
    [844, 390],
  ]) {
    await p.setViewportSize({ width, height });
    assert(
      await p.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    );
    await task(p).click();
    assert(
      await p.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    );
    await p.keyboard.press("Escape");
    if (width === 390)
      await p.screenshot({
        path: join(out, "board-phone.png"),
        fullPage: true,
      });
  }
  await p.emulateMedia({ reducedMotion: "reduce" });
  assert.equal(
    await p
      .locator(".task")
      .first()
      .evaluate((el) => getComputedStyle(el).transitionDuration),
    "0s",
  );
  assert.deepEqual(errors, []);
  console.log(
    "PASS two independent browsers: real drag/drop, concurrent text, presence, comments, status, activity, keyboard filter, reload and responsive layouts.",
  );
} finally {
  await browser?.close();
  const exited =
    server.exitCode === null ? once(server, "exit") : Promise.resolve();
  server.kill();
  await exited;
  await rm(root, {
    recursive: true,
    force: true,
    maxRetries: 5,
    retryDelay: 250,
  });
}
