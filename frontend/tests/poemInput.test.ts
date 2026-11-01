import assert from "node:assert/strict";
import { test } from "node:test";
import { parsePoemInput, editPreviewHalf, applySuggestedTashkeel, mapVocalizedCaret } from "../src/poemInput.ts";

test("incomplete verses remain editable without losing blank-line positions", () => {
  const parsed = parsePoemInput("\nصدر البيت\n\nصدر ثان*عجز ثان");
  assert.equal(parsed.ready, false);
  assert.equal(parsed.rows[0].ajuz, "");
  assert.equal(parsed.rows[1].lineIndex, 3);
  assert.equal(editPreviewHalf("\nصدر البيت", 1, "ajuz", "عجز البيت"), "\nصدر البيت*عجز البيت");
});

test("ambiguous separators and more than eight verses cannot reach analysis", () => {
  assert.equal(parsePoemInput("صدر*عجز*زيادة").ready, false);
  assert.equal(parsePoemInput(Array(9).fill("صدر*عجز").join("\n")).ready, false);
  assert.equal(parsePoemInput(Array(8).fill("صدر*عجز").join("\n")).ready, true);
});

test("reviewed vowel marks do not consume the plain-text character budget", () => {
  assert.equal(parsePoemInput("بَ".repeat(240) + "*" + "تُ".repeat(240)).ready, true);
  assert.equal(parsePoemInput("ب".repeat(241) + "*عجز").ready, false);
});

test("editing one half does not accumulate spaces in the other", () => {
  let source = "صدر * عجز";
  for (const value of ["عجز أ", "عجز آخر", "عجز جديد"]) source = editPreviewHalf(source, 0, "ajuz", value);
  assert.equal(source, "صدر *عجز جديد");
});

test("suggestions preserve punctuation, spacing, blank lines and delimiters", () => {
  assert.equal(applySuggestedTashkeel("\n على قدر * أهل العزم \n\n", [
    { sadr: "عَلَى قَدْرِ", ajuz: "أَهْلِ الْعَزْمِ" },
  ]), "\n عَلَى قَدْرِ * أَهْلِ الْعَزْمِ \n\n");
});

test("a suggestion cannot substitute words or drop verses", () => {
  assert.throws(() => applySuggestedTashkeel("صدر*عجز", [{ sadr: "كلام آخر", ajuz: "عجز" }]));
  assert.throws(() => applySuggestedTashkeel("صدر*عجز", []));
});

test("caret stays after the same pronounced base letters when marks appear", () => {
  assert.equal(mapVocalizedCaret("على قدر", "عَلَى قَدْرِ", 3), 5);
  assert.equal(mapVocalizedCaret("على", "عَلَى", 0), 0);
  assert.equal(mapVocalizedCaret("على", "عَلَى", 3), 5);
});
