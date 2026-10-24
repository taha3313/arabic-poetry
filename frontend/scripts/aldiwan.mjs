import { chromium } from "playwright";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
const root = fileURLToPath(new URL("../../", import.meta.url));
const fixtures = JSON.parse(
  fs.readFileSync(root + "backend/tests/fixtures/aldiwan.json", "utf8"),
);
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 1000 } });
const pageErrors = [];
page.on("pageerror", (e) => pageErrors.push(e.message));
let llmRequests = 0;
page.on("request", (r) => {
  if (r.url().endsWith("/api/generate")) llmRequests++;
});
await page.goto(process.env.BAYT_URL ?? "http://127.0.0.1:5173");
await page.getByRole("button", { name: "فحص أبياتي", exact: true }).click();
const results = [];
async function check(
  fixture,
  variant,
  verses,
  meter = fixture.meter,
  rawi = fixture.rawi,
) {
  await page.getByLabel("البحر الشعري").selectOption(meter);
  await page.getByLabel("حرف الروي").selectOption(rawi);
  await page
    .getByLabel("اكتب أبياتك مع التشكيل")
    .fill(verses.map((v) => `${v.sadr} * ${v.ajuz}`).join("\n"));
  const pending = page.waitForResponse((r) => r.url().endsWith("/api/analyze"));
  await page
    .getByRole("button", { name: "افحص الوزن والقافية", exact: true })
    .click();
  const response = await pending;
  const data = await response.json();
  if (!response.ok()) throw Error("Analysis returned " + response.status());
  await page
    .getByRole("heading", { name: "قصيدتك تحت المجهر", exact: true })
    .waitFor();
  const manuscript = page.locator("#poem-result");
  if ((await manuscript.locator(".verse").count()) !== verses.length)
    throw Error("Verse count mismatch");
  if ((await manuscript.locator("summary").count()) !== verses.length)
    throw Error("Summary count mismatch");
  const valid = data.verses.filter((v) => v.is_valid).length;
  const rawiMatches = data.verses.filter((v) => v.rawi_matches).length;
  const status = await manuscript.locator(".status").textContent();
  if (data.accepted !== status.includes("مطابق في الفحص الآلي"))
    throw Error("Status disagrees with API");
  const summaries = await manuscript.locator("summary").allTextContents();
  for (let i = 0; i < data.verses.length; i++) {
    const expected = data.verses[i].is_valid ? "وزن مطابق" : "راجع الوزن";
    if (!summaries[i].includes(expected))
      throw Error("Verse status disagrees with API");
  }
  await manuscript.locator("summary").first().click();
  if ((await manuscript.locator(".foot").count()) === 0)
    throw Error("Missing scansion feet");
  const row = {
    id: fixture.id,
    poet: fixture.poet,
    source_url: fixture.source_url,
    variant,
    meter,
    rawi,
    verse_count: verses.length,
    valid_verses: valid,
    rawi_matches: rawiMatches,
    accepted: data.accepted,
    average_score: data.average_score,
    report: data,
  };
  results.push(row);
  console.log(
    JSON.stringify({
      id: row.id,
      variant,
      n: verses.length,
      valid,
      rawiMatches,
      accepted: data.accepted,
    }),
  );
  if (fixture.id === "imru-alqais" && variant === "as_published")
    await page.screenshot({
      path: root + "docs/aldiwan-source.png",
      fullPage: true,
    });
  if (fixture.id === "abu-tammam" && variant === "vocalized_control")
    await page.screenshot({
      path: root + "docs/aldiwan-vocalized.png",
      fullPage: true,
    });
  return data;
}
for (const fixture of fixtures) {
  await check(fixture, "as_published", fixture.as_published);
  const control = await check(
    fixture,
    "vocalized_control",
    fixture.vocalized_control,
  );
  if (!control.accepted)
    throw Error("Known vocalized control unexpectedly failed: " + fixture.id);
  const bare = fixture.as_published.map((v) =>
    Object.fromEntries(
      Object.entries(v).map(([k, t]) => [k, t.replace(/\p{M}/gu, "")]),
    ),
  );
  await check(fixture, "unvocalized", bare);
}
const first = fixtures[0];
const rhyme = await check(
  first,
  "wrong_rawi",
  first.vocalized_control,
  first.meter,
  "م",
);
if (rhyme.accepted || rhyme.verses.some((v) => v.rawi_matches))
  throw Error("Wrong rawi accepted");
const meter = await check(
  first,
  "wrong_meter",
  first.vocalized_control,
  "kamel",
  first.rawi,
);
if (meter.accepted) throw Error("Wrong meter accepted");
const corrupt = [
  {
    sadr: first.vocalized_control[0].sadr + " وَهَذَا كَلَامٌ زَائِدٌ",
    ajuz: first.vocalized_control[0].ajuz,
  },
];
const broken = await check(first, "extra_words", corrupt);
if (broken.accepted) throw Error("Corrupted verse accepted");
await page.setViewportSize({ width: 390, height: 844 });
await check(fixtures[3], "vocalized_mobile", fixtures[3].vocalized_control);
await page.screenshot({
  path: root + "docs/aldiwan-mobile.png",
  fullPage: true,
});
for (const width of [280, 320, 390, 414, 1280]) {
  await page.setViewportSize({ width, height: 1000 });
  if (
    await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)
  )
    throw Error("Horizontal overflow " + width);
}
const report = {
  tested_on: "2026-10-24",
  method: "Real browser form submissions to /api/analyze; no LLM calls",
  page_errors: pageErrors,
  llm_requests: llmRequests,
  results,
};
fs.writeFileSync(
  root + "docs/evals/aldiwan-browser.json",
  JSON.stringify(report, null, 2) + "\n",
);
if (pageErrors.length || llmRequests)
  throw Error("Unexpected browser errors or LLM calls");
console.log(
  "Browser cases passed:",
  results.length,
  "page errors:",
  pageErrors.length,
  "LLM requests:",
  llmRequests,
);
await browser.close();
