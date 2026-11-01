export type InputVerse = {
  lineIndex: number;
  sadr: string;
  ajuz: string;
  hasSeparator: boolean;
  ambiguous: boolean;
};

export function validInputHalf(half: string) {
  return half.trim().length >= 2 && half.trim().length <= 720
    && half.replace(/[\u064b-\u065f\u0670]/g, "").trim().length <= 240
    && /[\u0621-\u064a]/.test(half);
}

export function parsePoemInput(text: string) {
  const rows: InputVerse[] = text.split("\n").flatMap((line, lineIndex) => {
    if (!line.trim()) return [];
    const parts = line.split("*");
    return [{ lineIndex, sadr: parts[0], ajuz: parts[1] ?? "",
      hasSeparator: parts.length === 2, ambiguous: parts.length > 2 }];
  });
  const ready = rows.length > 0 && rows.length <= 8 && rows.every((row) =>
    row.hasSeparator && !row.ambiguous && validInputHalf(row.sadr) && validInputHalf(row.ajuz));
  return { rows, ready, verses: rows.map(({ sadr, ajuz }) => ({ sadr: sadr.trim(), ajuz: ajuz.trim() })) };
}

export function editPreviewHalf(text: string, lineIndex: number, part: "sadr" | "ajuz", value: string) {
  const lines = text.split("\n");
  const [sadr = "", ajuz = ""] = lines[lineIndex].split("*");
  lines[lineIndex] = part === "sadr" ? `${value}*${ajuz}` : `${sadr}*${value}`;
  return lines.join("\n");
}

const vowelMarks = /[\u064b-\u065f\u0670]/g;
const withoutVowels = (value: string) => value.replace(vowelMarks, "");

export function applySuggestedTashkeel(text: string, verses: { sadr: string; ajuz: string }[]) {
  const { rows } = parsePoemInput(text);
  if (rows.length !== verses.length) throw new Error("تعذّر إكمال التشكيل المحلي. يمكنك تعطيله وفحص النص الأصلي.");
  const lines = text.split("\n");
  rows.forEach((row, index) => {
    const preserveSpacing = (original: string, suggestion: string) => {
      if (withoutVowels(original.trim()) !== withoutVowels(suggestion.trim())) {
        throw new Error("تعذّر إكمال التشكيل المحلي. يمكنك تعطيله وفحص النص الأصلي.");
      }
      return `${original.match(/^\s*/)?.[0] ?? ""}${suggestion.trim()}${original.match(/\s*$/)?.[0] ?? ""}`;
    };
    lines[row.lineIndex] = `${preserveSpacing(row.sadr, verses[index].sadr)}*${preserveSpacing(row.ajuz, verses[index].ajuz)}`;
  });
  return lines.join("\n");
}

export function mapVocalizedCaret(before: string, after: string, offset: number) {
  const position = withoutVowels(before.slice(0, offset)).length;
  let letters = 0;
  let result = 0;
  while (result < after.length) {
    const mark = /[\u064b-\u065f\u0670]/.test(after[result]);
    if (!mark && letters === position) break;
    if (!mark) letters += 1;
    result += 1;
  }
  return result;
}
