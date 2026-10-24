import { chromium } from "playwright";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
const evidence = fileURLToPath(new URL("../../docs/", import.meta.url));
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 1000 } });
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
await page.goto(process.env.BAYT_URL ?? "http://127.0.0.1:5173");
await page.getByText("التوليد غير مفعّل بعد.", { exact: false }).waitFor();
await page.screenshot({ path: evidence + "desktop.png", fullPage: true });
await page.getByRole("button", { name: "استكشف مثالًا" }).click();
await page.getByRole("heading", { name: "من معلّقة امرئ القيس" }).waitFor();
await page.locator("summary").click();
await page.getByText("الصدر", { exact: true }).waitFor();
await page.screenshot({ path: evidence + "scansion.png", fullPage: true });
if (!(await page.getByText("وزن مطابق", { exact: false }).count()))
  throw Error("Missing real scansion");
await page.getByLabel("حرف الروي").selectOption("م");
await page
  .getByRole("button", { name: "افحص الوزن والقافية", exact: true })
  .click();
await page.getByText("مسوّدة تحتاج مراجعة عروضية").waitFor();
await page.getByRole("button", { name: "تنزيل النص" }).click();
const widths = [280, 320, 390, 414, 760, 1280];
const layout = [];
for (const width of widths) {
  await page.setViewportSize({ width, height: 1000 });
  await page.evaluate(() => (document.documentElement.style.fontSize = "20px"));
  const dimensions = await page.evaluate(() => ({
    viewport: innerWidth,
    scroll: document.documentElement.scrollWidth,
  }));
  layout.push(dimensions);
  if (dimensions.scroll > width)
    throw Error("Overflow " + JSON.stringify(dimensions));
}
await page.setViewportSize({ width: 390, height: 844 });
await page.screenshot({ path: evidence + "mobile.png", fullPage: true });
await page.getByLabel("اكتب أبياتك مع التشكيل").fill("هذا سطر دون فاصل");
await page
  .getByRole("button", { name: "افحص الوزن والقافية", exact: true })
  .click();
await page.getByRole("alert").waitFor();
await page.getByRole("button", { name: "تأليف قصيدة", exact: true }).click();
if (
  !(await page
    .getByRole("button", { name: "انظم القصيدة", exact: true })
    .isDisabled())
)
  throw Error("Generation should require key");
console.log(
  JSON.stringify({
    layout,
    errors,
    checks: [
      "sample analysis",
      "expand scansion",
      "rawi mismatch",
      "download",
      "malformed input",
      "mode switching",
      "generation disabled without key",
    ],
  }),
);
await browser.close();
