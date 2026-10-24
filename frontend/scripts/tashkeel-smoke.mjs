import { chromium } from "playwright";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
const root = fileURLToPath(new URL("../../", import.meta.url));
const fixtures = JSON.parse(
  fs.readFileSync(root + "backend/tests/fixtures/aldiwan.json", "utf8"),
);
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 1000 } });
const errors = [];
let llmRequests = 0;
page.on("pageerror", (e) => errors.push(e.message));
page.on("request", (r) => {
  if (r.url().endsWith("/api/generate")) llmRequests++;
});
await page.goto(process.env.BAYT_URL ?? "http://127.0.0.1:5173");
await page.getByRole("button", { name: "فحص أبياتي", exact: true }).click();
const toggle = page.getByRole("checkbox", { name: "إكمال التشكيل تلقائيًا" });
if (!(await toggle.isChecked())) throw Error("Auto tashkeel should default on");
const results = [];
for (const row of fixtures) {
  for (const variant of ["off", "auto", "bare"]) {
    const verses =
      variant === "bare"
        ? row.as_published.map((v) =>
            Object.fromEntries(
              Object.entries(v).map(([k, t]) => [
                k,
                t.replace(/[\u064b-\u0652]/gu, ""),
              ]),
            ),
          )
        : row.as_published;
    const original = verses.map((v) => `${v.sadr} * ${v.ajuz}`).join("\n");
    await toggle.setChecked(variant !== "off");
    await page.getByLabel("البحر الشعري").selectOption(row.meter);
    await page.getByLabel("حرف الروي").selectOption(row.rawi);
    await page.getByLabel("اكتب أبياتك مع التشكيل").fill(original);
    const pending = page.waitForResponse((r) =>
      r.url().endsWith("/api/analyze"),
    );
    await page
      .getByRole("button", { name: "افحص الوزن والقافية", exact: true })
      .click();
    const response = await pending;
    const report = await response.json();
    if (!response.ok()) throw Error("API failure " + JSON.stringify(report));
    if (report.tashkeel.enabled !== (variant !== "off"))
      throw Error("Wrong mode used");
    const paper = page.locator("#poem-result");
    await paper.locator("h2").waitFor();
    const displayed = await paper.locator(".verse").allTextContents();
    for (let i = 0; i < verses.length; i++) {
      if (
        !displayed[i].includes(report.analyzed_verses[i].sadr) ||
        !displayed[i].includes(report.analyzed_verses[i].ajuz)
      )
        throw Error("Displayed text differs from scanned text");
    }
    if (
      (await page.getByLabel("اكتب أبياتك مع التشكيل").inputValue()) !==
      original
    )
      throw Error("Original input overwritten");
    if (
      report.tashkeel.changed &&
      !(await paper
        .getByText("أُكمل التشكيل محليًا.", { exact: false })
        .isVisible())
    )
      throw Error("Missing disclosure");
    await paper.locator("summary").first().click();
    const result = {
      id: row.id,
      variant,
      valid: report.verses.filter((v) => v.is_valid).length,
      rawi_matches: report.verses.filter((v) => v.rawi_matches).length,
      total: verses.length,
      report,
    };
    results.push(result);
    console.log(
      JSON.stringify({
        id: row.id,
        variant,
        valid: result.valid,
        total: result.total,
      }),
    );
    if (row.id === "imru-alqais" && variant === "auto")
      await page.screenshot({
        path: root + "docs/tashkeel-desktop.png",
        fullPage: true,
      });
  }
}
await page.setViewportSize({ width: 390, height: 844 });
await page.screenshot({
  path: root + "docs/tashkeel-mobile.png",
  fullPage: true,
});
for (const width of [280, 320, 390, 414, 1280]) {
  await page.setViewportSize({ width, height: 1000 });
  if (
    await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)
  )
    throw Error("Overflow at " + width);
}
fs.writeFileSync(
  root + "docs/evals/tashkeel-browser.json",
  JSON.stringify({ results, errors, llmRequests }, null, 2) + "\n",
);
if (errors.length || llmRequests)
  throw Error("Unexpected browser errors or LLM requests");
console.log(
  "Passed",
  results.length,
  "cases; browser errors",
  errors.length,
  "LLM requests",
  llmRequests,
);
await browser.close();
