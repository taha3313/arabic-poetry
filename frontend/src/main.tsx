import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  Feather,
  Copy,
  Download,
  LoaderCircle,
  BookOpen,
  ScanLine,
  Search,
  CheckCheck,
} from "lucide-react";
import "@fontsource/amiri/arabic-400.css";
import "@fontsource/amiri/arabic-700.css";
import "@fontsource/ibm-plex-sans-arabic/arabic-400.css";
import "@fontsource/ibm-plex-sans-arabic/arabic-500.css";
import "./style.css";
import { AutoGrowingTextarea } from "./AutoGrowingTextarea";
import { parsePoemInput, validInputHalf, editPreviewHalf, applySuggestedTashkeel, mapVocalizedCaret } from "./poemInput";
import poetryExamples from "./data/poetry-examples.json";
import defaultAnalysis from "./data/default-analysis.json";
import { footVariant, meterNames, translateMessage } from "./translations";
const defaultExample = poetryExamples[0];
type Verse = {
  sadr: string;
  ajuz: string;
};
type Foot = {
  letters?: { letter: string; symbol: string; position: number }[];
  pronounced_segment?: string | null;
  actual_tafeela: string;
  base_tafeela: string;
  status: string;
  actual_segment: string;
  expected_pattern: string;
  zihaf_name_ar: string;
};
type Scan = {
  letter_alignment?: { available: boolean; basis: string; reason: string | null };
  arudi_text: string;
  pattern: string;
  feet: Foot[];
};
type Row = {
  is_valid: boolean;
  rawi_matches: boolean;
  qafiyah: { rawi: string; qafiyah_text: string; rawi_haraka: string; wasl?: string | null; ridf?: string | null; tasees?: string | null; khuruj?: string | null; dakhil?: string | null } | null;
  sadr: Scan | null;
  ajuz: Scan | null;
};
type Analysis = {
  meter: string;
  detection?: boolean;
  rhyme_consistent?: boolean;
  requested_rawi?: string;
  accepted: boolean;
  meter_name: string;
  average_score: number;
  note: string;
  verses: Row[];
  analyzed_verses?: Verse[];
  tashkeel?: { enabled: boolean; changed: boolean; original_verses: Verse[] };
};
type Result = {
  isDefault?: boolean;
  inputText?: string;
  intentionalMismatch?: boolean;
  example?: (typeof poetryExamples)[number];
  title: string;
  verses: Verse[];
  analysis: Analysis;
  attempts?: number;
  revision_warning?: string;
  provider?: string;
};
type Config = {
  meters: {
    key: string;
    name: string;
  }[];
  generation_available: boolean;
  provider: string;
};
const initialMeters = [
  { key: "taweel", name: "الطويل" },
  { key: "kamel", name: "الكامل" },
  { key: "baseet", name: "البسيط" },
];
const apiBase =
  (
    import.meta as ImportMeta & {
      env: {
        VITE_API_BASE_URL?: string;
      };
    }
  ).env.VITE_API_BASE_URL?.trim().replace(/\/+$/, "") ?? "";
async function api<T>(path: string, body?: unknown, signal?: AbortSignal): Promise<T> {
  const response = await fetch(
    `${apiBase}/api/${path}`,
    body
      ? {
          method: "POST",
          signal,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }
      : undefined,
  );
  const data = await response.json();
  if (!response.ok)
    throw new Error(
      typeof data.detail === "string"
        ? data.detail
        : "تعذّر إتمام الطلب. تحقّق من المدخلات وحاول مجددًا.",
    );
  return data;
}
type Locale = "ar" | "en";
function initialLocale(): Locale {
  const query = new URLSearchParams(window.location.search).get("lang");
  if (query === "en" || query === "ar") return query;
  return "ar";
}
function App() {
  const [locale, setLocale] = useState<Locale>(initialLocale);
  const t = (ar: string, en: string) => locale === "en" ? en : ar;
  useEffect(() => {
    document.documentElement.lang = locale;
    document.documentElement.dir = locale === "en" ? "ltr" : "rtl";
    document.title = locale === "en" ? "Qafiya | Arabic poetry workshop" : "قافية | ورشة الشعر العربي";
    const url = new URL(window.location.href);
    url.searchParams.set("lang", locale);
    window.history.replaceState(null, "", url);
  }, [locale]);
  const [config, setConfig] = useState<Config | null>(null);
  const [connectionError, setConnectionError] = useState(false);
  const [mode, setMode] = useState<"generate" | "analyze" | "detect">(() => {
    const value = new URLSearchParams(window.location.search).get("mode");
    return value === "analyze" || value === "detect" ? value : "generate";
  });
  useEffect(() => {
    const url = new URL(window.location.href);
    url.searchParams.set("mode", mode);
    window.history.replaceState(null, "", url);
  }, [mode]);
  const [topic, setTopic] = useState(
    "الحنين إلى مدينةٍ تركنا فيها شيئًا من أرواحنا",
  );
  const [meter, setMeter] = useState("taweel");
  const [rawi, setRawi] = useState("م");
  const [count, setCount] = useState(3);
  const [text, setText] = useState("");
  const [exampleId, setExampleId] = useState(poetryExamples[0].id);
  const selectedExample = poetryExamples.find((example) => example.id === exampleId) ?? poetryExamples[0];
  const [autoTashkeel, setAutoTashkeel] = useState(true);
  const [suggestionState, setSuggestionState] = useState<"idle" | "waiting" | "loading" | "suggested" | "edited" | "unchanged" | "error">("idle");
  const [suggestionError, setSuggestionError] = useState("");
  const [inputError, setInputError] = useState(false);
  const [beforeTashkeel, setBeforeTashkeel] = useState<string | null>(null);
  const [suggestionRequest, setSuggestionRequest] = useState<{ text: string; revision: number } | null>(null);
  const inputRevision = useRef(0);
  const parsedInput = parsePoemInput(text);
  const inputMode = mode !== "generate";
  const suggesting = inputMode && (suggestionState === "waiting" || suggestionState === "loading");

  function replaceInput(value: string, suggest = true) {
    inputRevision.current += 1;
    setText(value);
    setInputError(false);
    setError("");
    setBeforeTashkeel(null);
    setSuggestionError("");
    const shouldSuggest = suggest && autoTashkeel && parsePoemInput(value).ready;
    setSuggestionRequest(shouldSuggest ? { text: value, revision: inputRevision.current } : null);
    setSuggestionState(shouldSuggest ? "waiting" : "idle");
  }
  function editPreview(lineIndex: number, part: "sadr" | "ajuz", value: string) {
    inputRevision.current += 1;
    setSuggestionRequest(null);
    setSuggestionState("edited");
    setInputError(false);
    setError("");
    setSuggestionError("");
    setText(editPreviewHalf(text, lineIndex, part, value));
  }
  function addPreviewVerse() {
    if (parsedInput.rows.length >= 8) return;
    inputRevision.current += 1;
    setSuggestionRequest(null);
    setSuggestionState("edited");
    setInputError(false);
    setError("");
    setSuggestionError("");
    const updated = `${text}${text.endsWith("\n") ? "" : "\n"}*`;
    setText(updated);
    const lineIndex = updated.split("\n").length - 1;
    window.requestAnimationFrame(() => document.getElementById(`preview-sadr-${lineIndex}`)?.focus());
  }
  function requestSuggestion() {
    if (suggesting || !parsedInput.ready) return;
    inputRevision.current += 1;
    setSuggestionError("");
    setSuggestionState("waiting");
    setSuggestionRequest({ text, revision: inputRevision.current });
  }
  useEffect(() => {
    if (!inputMode || !autoTashkeel || !suggestionRequest) return;
    const controller = new AbortController();
    const request = suggestionRequest;
    const timer = window.setTimeout(async () => {
      if (inputRevision.current !== request.revision) return;
      setSuggestionState("loading");
      try {
        const suggestion = await api<{ verses: Verse[]; changed: boolean }>("tashkeel", {
          verses: parsePoemInput(request.text).verses,
        }, controller.signal);
        if (controller.signal.aborted || inputRevision.current !== request.revision) return;
        if (suggestion.changed) {
          const updatedText = applySuggestedTashkeel(request.text, suggestion.verses);
          const editor = document.getElementById("topic") as HTMLTextAreaElement | null;
          const selection = editor && document.activeElement === editor
            ? [mapVocalizedCaret(request.text, updatedText, editor.selectionStart), mapVocalizedCaret(request.text, updatedText, editor.selectionEnd)] : null;
          setBeforeTashkeel((original) => original ?? request.text);
          setText(updatedText);
          if (selection) window.requestAnimationFrame(() => {
            if (editor && document.activeElement === editor && inputRevision.current === request.revision) {
              editor.setSelectionRange(selection[0], selection[1]);
            }
          });
        }
        setSuggestionState(suggestion.changed ? "suggested" : "unchanged");
        setSuggestionRequest(null);
      } catch (error) {
        if (controller.signal.aborted || inputRevision.current !== request.revision) return;
        setSuggestionError(error instanceof Error ? error.message : "تعذّر إكمال التشكيل المحلي. يمكنك تعطيله وفحص النص الأصلي.");
        setSuggestionState("error");
        setSuggestionRequest(null);
      }
    }, 900);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [suggestionRequest, autoTashkeel, inputMode]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [result, setResult] = useState<Result | null>(() => ({
    title: defaultExample.title_ar,
    example: defaultExample,
    verses: defaultExample.verses,
    analysis: defaultAnalysis,
    isDefault: true,
  }));
  useEffect(() => {
    api<Config>("config")
      .then(setConfig)
      .catch(() => setConnectionError(true));
  }, []);
  useEffect(() => {
    if (!result || result.isDefault) return;
    setNotice("اكتمل الفحص. يمكنك الآن عرض تقطيع كل بيت.");
    if (!result.isDefault) window.requestAnimationFrame(() => {
      document.getElementById("result-title")?.focus({ preventScroll: window.matchMedia("(max-width: 759px)").matches });
    });
    if (!result.isDefault && window.matchMedia("(max-width: 759px)").matches) {
      document.getElementById("poem-result")?.scrollIntoView({
        behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
          ? "auto"
          : "smooth",
        block: "start",
      });
    }
  }, [result]);
  const detectedRawis = Array.from(
    new Set(
      result?.analysis.verses
        .map((v) => v.qafiyah?.rawi)
        .filter((letter): letter is string => Boolean(letter)) ?? [],
    ),
  );
  const poemText =
    result?.verses.map((v) => `${v.sadr}    ${v.ajuz}`).join("\n") ?? "";
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (suggesting) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      if (mode === "generate")
        setResult(
          await api<Result>("generate", {
            topic,
            meter,
            rawi,
            verse_count: count,
            max_revisions: 2,
          }),
        );
      else {
        if (!parsedInput.ready) {
          setInputError(true);
          window.requestAnimationFrame(() => document.getElementById("topic")?.focus());
          throw new Error(t(
          "اكتب من بيت إلى ثمانية أبيات، وافصل الشطرين بعلامة * واحدة. أكمل كل شطر بالعربية، حتى 240 حرفًا دون الحركات.",
          "Enter 1–8 verses with one * per line. Complete both halves in Arabic, up to 240 characters each without vowel marks.",
        ));
        }
        const verses = parsedInput.verses;
        const analysis = await api<Analysis>(mode === "detect" ? "detect" : "analyze", {
          verses,
          ...(mode === "analyze" ? { meter, rawi } : {}),
          // Analyze exactly the editable preview; do not vocalize it again.
          auto_tashkeel: false,
        });
        setResult({
          title: "قصيدتك تحت المجهر",
          inputText: text,
          verses: analysis.analyzed_verses ?? verses,
          analysis,
        });
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : t("حدث خطأ غير متوقع.", "An unexpected error occurred."));
      if (mode === "generate" || parsedInput.ready) {
        window.requestAnimationFrame(() => document.getElementById("form-error")?.focus());
      }
    } finally {
      setBusy(false);
    }
  }
  async function loadSample(mismatch = false) {
    const sampleMode = mode === "detect" ? "detect" : "analyze";
    setMode(sampleMode);
    const example = selectedExample;
    const targetRawi = mismatch ? (example.rawi === "م" ? "ل" : "م") : example.rawi;
    setMeter(example.meter);
    setRawi(targetRawi);
    replaceInput(example.verses.map((v) => `${v.sadr} * ${v.ajuz}`).join("\n"), false);
    setBusy(true);
    setError("");
    setNotice("");
    try {
      setResult({
        title: example.title_ar,
        example,
        intentionalMismatch: mismatch,
        inputText: example.verses.map((v) => `${v.sadr} * ${v.ajuz}`).join("\n"),
        verses: example.verses,
        analysis: await api<Analysis>(sampleMode, {
          verses: example.verses,
          auto_tashkeel: false,
          ...(sampleMode === "analyze" ? { meter: example.meter, rawi: targetRawi } : {}),
        }),
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : t("تعذّر تحميل المثال", "Unable to load the example."));
      window.requestAnimationFrame(() => document.getElementById("form-error")?.focus());
    } finally {
      setBusy(false);
    }
  }
  function download() {
    const url = URL.createObjectURL(
      new Blob([`${result?.example ? t(result.example.title_ar, result.example.title_en) : translateMessage(result?.title ?? "", locale)}\n\n${poemText}`], {
        type: "text/plain;charset=utf-8",
      }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = "qafiya-poem.txt";
    a.click();
    URL.revokeObjectURL(url);
  }
  return (
    <>
      <a className="skip" href="#workshop">
        {t("انتقل إلى ورشة الكتابة", "Skip to the writing workshop")}
      </a>
      <div className="page">
        <header>
          <button type="button" className="language-switch" lang={locale === "ar" ? "en" : "ar"} onClick={() => setLocale(locale === "ar" ? "en" : "ar")} aria-label={t("التبديل إلى الإنجليزية", "Switch to Arabic")}>{locale === "ar" ? "English" : "العربية"}</button>
          <a className="brand" href={`/?lang=${locale}`} aria-label={t("قافية، الصفحة الرئيسية", "Qafiya home")}>
            {t("قَافِيَة", "Qafiya")}<span>{t("ورشة الشعر العربي", "An Arabic poetry workshop")}</span>
          </a>
          <span className="header-note">{t("للِكلمة وزنٌ، وللخيال متّسع.", "Words have rhythm. Imagination has room to roam.")}</span>
          <span className="edition">{t("نسخة تجريبية", "Beta")}</span>
        </header>
        <main>
          <section className="intro">
            <div>
              <h1>{t("ورشة الشعر العربي", "Your Arabic poetry workshop")}</h1>
              <p className="lead">
                {t("ألّف قصيدة، أو افحص أبياتك، أو اكتشف بحرها وقافيتها.", "Compose Arabic verse, check its rhythm, or discover its meter and rhyme.")}
              </p>
            </div>
            <aside className="hero-verse">
              <blockquote lang="ar" dir="rtl">
                وَمَا الشِّعْرُ إِلَّا شُعُورٌ
                <br />
                يَجِدُ الطَّرِيقَ إِلَى الْكَلِمَةِ
              </blockquote>
              {locale === "en" && <p className="verse-gloss">Poetry is feeling finding its way into words.</p>}
              <span>{t("هنا تبدأ مسوّدتك القادمة", "Your next draft begins here")}</span>
            </aside>
          </section>
              <div className="mode-switch" role="group" aria-label={t("طريقة العمل", "Workshop mode")}>
                <button
                  type="button"
                  disabled={busy} aria-label={t("تأليف قصيدة", "Compose a poem")} aria-pressed={mode === "generate"}
                  onClick={() => {
                    setMode("generate");
                    setInputError(false);
                    setError("");
                  }}
                >
                  <span className="mode-number" aria-hidden="true">01</span><Feather size={20} aria-hidden="true" /><span><strong><span className="mode-full">{t("تأليف قصيدة", "Compose a poem")}</span></strong><small>{t("من فكرة إلى أبيات", "Turn an idea into verse")}</small></span>
                </button>
                <button
                  type="button"
                  disabled={busy} aria-label={t("التحقق من الوزن والقافية", "Check meter and rhyme")} aria-pressed={mode === "analyze"}
                  onClick={() => {
                    setMode("analyze");
                    setInputError(false);
                    setError("");
                  }}
                >
                  <span className="mode-number" aria-hidden="true">02</span><CheckCheck size={20} aria-hidden="true" /><span><strong><span className="mode-full">{t("التحقق من الوزن والقافية", "Check meter and rhyme")}</span></strong><small>{t("قارن ببحر وروي تختارهما", "Compare against your chosen targets")}</small></span>
                </button>
                <button type="button" disabled={busy} aria-label={t("اكتشاف البحر والقافية", "Detect meter and rhyme")} aria-pressed={mode === "detect"} onClick={() => { setMode("detect"); setInputError(false); setError(""); }}>
                  <span className="mode-number" aria-hidden="true">03</span><Search size={20} aria-hidden="true" /><span><strong><span className="mode-full">{t("اكتشاف البحر والقافية", "Detect meter and rhyme")}</span></strong><small>{t("تعرّف إلى إيقاع أبياتك", "Identify the rhythm of your verse")}</small></span>
                </button>
              </div>
          <section className="workshop" id="workshop" tabIndex={-1} aria-label={t("ورشة الكتابة", "Writing workshop")}>
            <div className="desk">
              <div className="desk-heading">
                <Feather size={22} />
                <h2>{t("مساحة الكتابة", "Your writing desk")}</h2>
              </div>
              <p className="field-help">{mode === "detect"
                ? t("أدخل الأبيات لاكتشاف بحرها ورويّها دون تحديدهما مسبقًا.", "Enter verses to identify their meter and rhyme without choosing targets.")
                : mode === "analyze"
                  ? t("اختر البحر والروي المطلوبين للتحقق من مطابقة أبياتك لهما.", "Choose a target meter and rhyme consonant to check whether your verses match.")
                  : ""}</p>
              {mode !== "generate" && <details className="learning-guide editor-guide">
                <summary><BookOpen size={17} aria-hidden="true" />{t("ابدأ بمثال، ثم جرّب أبياتك", "Start with an example, then try your own")}</summary>
                <p>{t("البيت شطران: صدر وعجز. البحر هو الإيقاع المتكرر، والتفعيلة وحدة من هذا الإيقاع. الروي هو الحرف الذي تُبنى عليه القافية، وليس دائمًا آخر حرف مكتوب.", "A verse has two halves: sadr and ajuz. A meter is a repeating rhythm; a tafʿīla is one unit of that rhythm. The rawi anchors the rhyme and is not always the last written letter.")}</p>
                <p>{t("اختر شاهدًا من أمثلة الشعر أدناه، ثم افتح التقطيع لتقارن التفعيلات. في وضع التحقق نختار بحر الشاهد ورويّه، وفي وضع الاكتشاف نترك تحديدهما للفحص.", "Choose a poetry excerpt below, then expand its feet. Checking uses the excerpt’s meter and rawi; detection infers them from the verse.")}</p>
              </details>}
              <form onSubmit={submit}>
                <label htmlFor="topic">
                  {mode === "generate"
                    ? t("عن ماذا تودّ أن تكتب؟", "What would you like to write about?")
                    : t("اكتب أبياتك مع التشكيل", "Enter your Arabic verses with vowel marks")}
                </label>
                {mode === "generate" && <p id="input-help" className="field-help">{t("اختر معنى والبحر وحرف الروي، ثم ابدأ مسوّدتك.", "Choose a theme, meter, and rhyme consonant for your draft.")}</p>}
                {mode === "generate" ? (
                  <textarea
                    id="topic"
                    aria-describedby="input-help"
                    lang="ar" dir="rtl"
                    value={topic}
                    maxLength={500}
                    minLength={3}
                    required
                    onChange={(e) => setTopic(e.target.value)}
                    placeholder="حنين، لقاء، أو مدينة لا تغيب…"
                  />
                ) : (
                  <>
                    <textarea
                      id="topic"
                      className="poem-source"
                      aria-invalid={inputError || undefined}
                      aria-describedby={inputError ? "input-help form-error" : "input-help"}
                      lang="ar" dir="rtl"
                      value={text}
                      maxLength={12000}
                      disabled={busy}
                      required
                      onChange={(e) => replaceInput(e.target.value)}
                      placeholder="صدر البيت * عجز البيت"
                    />
                    <p id="input-help" className="field-help">
                      {t("كل سطر بيت، وبين شطريه *. ستظهر المعاينة فورًا؛ يمكنك الكتابة فيها مباشرة.", "One verse per line, with * between its halves. The live preview below is directly editable.")}
                    </p>
                    <label className="tashkeel-toggle">
                      <input
                        type="checkbox"
                        checked={autoTashkeel}
                        disabled={busy}
                        onChange={(e) => {
                          const enabled = e.target.checked;
                          setAutoTashkeel(enabled);
                          inputRevision.current += 1;
                          setSuggestionError("");
                          setSuggestionRequest(enabled && parsedInput.ready ? { text, revision: inputRevision.current } : null);
                          setSuggestionState(enabled && parsedInput.ready ? "waiting" : "idle");
                        }}
                      />
                      <span>{t("إكمال التشكيل تلقائيًا", "Fill in missing Arabic vowel marks")}</span>
                    </label>
                    <p className="field-help tashkeel-help">
                      {t("عند اكتمال الأبيات نقترح التشكيل في المعاينة. راجعه أو صحّحه قبل الفحص؛ تعديلاتك لن تُستبدل تلقائيًا.", "Once the verses are complete, suggested vowel marks appear in the preview. Review or correct them before analysis; your edits are never replaced automatically.")}
                    </p>
                    {parsedInput.rows.length > 0 && <section className="input-preview" aria-labelledby="preview-heading">
                      <h3 id="preview-heading">{t("المعاينة ونسخة التحليل", "Live preview and analysis text")}</h3>
                      <p id="preview-help" className="field-help">{t("ما تراه هنا هو النص الذي سيُحلَّل. عدّل الصدر أو العجز مباشرة.", "This is the text that will be analyzed. Edit either half-line directly.")}</p>
                      <p id="preview-status" className="preview-status" role="status" aria-atomic="true">
                        {suggesting ? t("جارٍ اقتراح التشكيل… يمكنك مواصلة التحرير.", "Preparing suggested vowel marks… You can keep editing.")
                          : suggestionState === "suggested" ? t("تشكيل مقترح، قابل للتعديل", "Suggested vowel marks, ready to review")
                          : suggestionState === "edited" ? t("نسختك المعدّلة، جاهزة للمراجعة", "Your edited text, ready to review")
                          : suggestionState === "unchanged" ? t("لم تُضف حركات جديدة. يمكنك التعديل يدويًا.", "No new vowel marks were added. You can edit manually.") : ""}
                      </p>
                      {parsedInput.rows.slice(0, 8).map((row, index) => <fieldset className="preview-verse" key={row.lineIndex}>
                        <legend>{t("البيت", "Verse")} {index + 1}</legend>
                        {row.ambiguous ? <p className="field-help">{t("يوجد أكثر من فاصل *. صحّح هذا السطر في مساحة الكتابة.", "This line has more than one *. Correct it in the writing area.")}</p> : <div className="preview-halves">
                          {(["sadr", "ajuz"] as const).map((part) => <div key={part}>
                            <label htmlFor={`preview-${part}-${row.lineIndex}`}>{part === "sadr" ? t("الصدر", "First half-line (sadr)") : t("العجز", "Second half-line (ajuz)")}</label>
                            <AutoGrowingTextarea id={`preview-${part}-${row.lineIndex}`}
                              aria-label={part === "sadr" ? t(`الصدر للبيت ${index + 1}`, `First half-line (sadr) for verse ${index + 1}`) : t(`العجز للبيت ${index + 1}`, `Second half-line (ajuz) for verse ${index + 1}`)}
                              aria-invalid={inputError && !validInputHalf(row[part]) || undefined}
                              aria-describedby={inputError && !validInputHalf(row[part]) ? "preview-help preview-status form-error" : "preview-help preview-status"}
                              lang="ar" dir="rtl" rows={2} maxLength={720} disabled={busy}
                              value={row[part]} onChange={(event) => editPreview(row.lineIndex, part, event.target.value)}
                              placeholder={part === "sadr" ? t("اكتب الصدر", "Enter the first half-line") : t("أكمل العجز هنا", "Complete the second half-line here")} />
                          </div>)}
                        </div>}
                      </fieldset>)}
                      {!parsedInput.ready && <p className="field-help">{t("أكمل الشطرين لكل بيت، بفاصل واحد *، وبحد أقصى ثمانية أبيات و240 حرفًا لكل شطر دون الحركات.", "Complete both halves with one * per line, up to eight verses and 240 characters per half without vowel marks.")}</p>}
                      {suggestionError && <p className="error" role="alert">{translateMessage(suggestionError, locale)} {t("يمكنك التعديل يدويًا ثم الفحص.", "You can edit manually and analyze your text.")}</p>}
                      <div className="preview-actions">
                        <button type="button" disabled={busy || parsedInput.rows.length >= 8} onClick={addPreviewVerse}>{t("إضافة بيت", "Add verse")}</button>
                        {autoTashkeel && <button type="button" disabled={busy || !parsedInput.ready} aria-disabled={suggesting || undefined} onClick={requestSuggestion}>{t("اقتراح التشكيل", "Suggest vowel marks")}</button>}
                        {beforeTashkeel !== null && <button type="button" disabled={busy} onClick={() => {
                          replaceInput(beforeTashkeel, false);
                          window.requestAnimationFrame(() => document.getElementById("topic")?.focus());
                        }}>{t("استعادة النص قبل التشكيل", "Restore text before suggestions")}</button>}
                      </div>
                      {beforeTashkeel !== null && <details className="original-text"><summary>{t("النص قبل التشكيل", "Text before suggestions")}</summary><p lang="ar" dir="rtl">{beforeTashkeel}</p></details>}
                    </section>}
                  </>
                )}
                {mode !== "detect" && <div className="controls">
                  <div>
                    <label htmlFor="meter">{t("البحر الشعري", "Poetic meter")}</label>
                    <select
                      id="meter"
                      value={meter}
                      onChange={(e) => setMeter(e.target.value)}
                    >
                      {(config?.meters ?? initialMeters).map((m) => (
                        <option key={m.key} value={m.key}>
                          {t(m.name, meterNames[m.key] ?? m.name)}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label htmlFor="rawi">{t("الروي المطلوب", "Target rawi")}</label>
                    <select
                      id="rawi"
                      value={rawi}
                      onChange={(e) => setRawi(e.target.value)}
                    >
                      {Array.from("ابتثجحخدذرزسشصضطظعغفقكلمنهويء").map((c) => (
                        <option key={c}>{c}</option>
                      ))}
                    </select>
                  </div>
                  {mode === "generate" && (
                    <div>
                      <label htmlFor="count">{t("عدد الأبيات", "Verses")}</label>
                      <select
                        id="count"
                        value={count}
                        onChange={(e) => setCount(Number(e.target.value))}
                      >
                        {[1, 2, 3, 4, 5, 6, 7, 8].map((n) => (
                          <option key={n} value={n}>
                            {n}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>}
                <button
                  className="primary"
                  disabled={
                    busy || suggesting ||
                    (mode === "generate" && !config?.generation_available)
                  }
                >
                  {busy || suggesting ? (
                    <LoaderCircle className="spin" size={20} />
                  ) : mode === "generate" ? (
                    <Feather size={20} />
                  ) : (
                    <ScanLine size={20} />
                  )}{" "}
                  {suggesting ? t("جارٍ اقتراح التشكيل…", "Preparing vowel marks…") : busy
                    ? t("جارٍ العمل على الأبيات…", "Working on your verses…")
                    : mode === "generate"
                      ? t("انظم القصيدة", "Compose the poem")
                      : mode === "detect" ? t("اكتشف البحر والقافية", "Detect meter and rhyme") : t("افحص الوزن والقافية", "Check meter and rhyme")}

                </button>
                {busy && (
                  <p className="field-help" role="status">
                    {mode === "generate" ? t("قد تستغرق الصياغة والمراجعة بضع دقائق.", "Composition and revision may take a few minutes.") : t("جارٍ تحليل النسخة التي راجعتها.", "Analyzing the text you reviewed.")}
                  </p>
                )}
                {connectionError ? (
                  <p className="warning" role="status">
                    {t("تعذّر الاتصال بالخادم. شغّل الخلفية وأعد تحميل الصفحة.", "Unable to reach the server. Please try reloading the page shortly.")}
                  </p>
                ) : config &&
                  !config.generation_available &&
                  mode === "generate" ? (
                  <p className="warning">
                    {t("التوليد غير مفعّل بعد. يمكنك الآن فحص أبياتك أو تجربة المثال.", "Poem generation is currently unavailable. You can still analyze your verses or try the example.")}
                  </p>
                ) : null}
                {error && (
                  <p id="form-error" tabIndex={-1} className="error" role="alert">
                    {translateMessage(error, locale)}
                  </p>
                )}
              </form>
              <section className="example-picker" aria-label={t("أمثلة للتجربة", "Poetry examples")}>
                <label htmlFor="muallaqa-example">{t("أمثلة للتجربة", "Poetry examples")}</label>
                <select id="muallaqa-example" disabled={busy} value={exampleId} onChange={(event) => setExampleId(event.target.value)}>
                  {(["classical", "muallaqat"] as const).map((collection) => <optgroup key={collection} label={collection === "muallaqat" ? t("المعلّقات", "Muʿallaqāt") : t("المتنبي", "Al-Mutanabbī")}>
                    {poetryExamples.filter((example) => example.collection === collection).map((example) => <option key={example.id} value={example.id}>{t(example.poet_ar, example.poet_en)}: {t(example.title_ar, example.title_en)}</option>)}
                  </optgroup>)}
                </select>
                <blockquote className="example-preview" lang="ar" dir="rtl"><span>{selectedExample.verses[0].sadr}</span><span>{selectedExample.verses[0].ajuz}</span></blockquote>
                <p className="field-help">{mode === "detect" ? t("اكتشف بحر هذا الشاهد ورويّه.", "Discover this excerpt’s meter and rhyme.") : <>{t("البحر:", "Meter:")} {t(selectedExample.meter_name_ar, meterNames[selectedExample.meter])} / {t("الروي:", "Rawi:")} {selectedExample.rawi}</>}</p>
                {selectedExample.note_ar && <p className="field-help">{t(selectedExample.note_ar, selectedExample.note_en)}</p>}
                <a className="example-source" href={selectedExample.source_url} target="_blank" rel="noreferrer">{t("اقرأ القصيدة في الديوان", "Read the poem on Al Diwan")}</a>
                <p className="field-help">{t("شواهد من الديوان، مع إكمال التشكيل للتقطيع.", "Excerpts from Al Diwan, with vowel marks completed for scansion.")}</p>
              <button
                type="button"
                className="sample"
                disabled={busy}
                onClick={() => loadSample()}
              >
                <BookOpen size={17} /> {t("افحص المثال المختار", "Analyze the selected example")}{" "}

              </button>
              {mode === "analyze" && <button type="button" className="sample" disabled={busy} onClick={() => loadSample(true)}>
                <BookOpen size={17} /> {t(`قارن الروي ${selectedExample.rawi} بالمطلوب ${selectedExample.rawi === "م" ? "ل" : "م"}`, `Compare rawi ${selectedExample.rawi} against ${selectedExample.rawi === "م" ? "ل" : "م"}`)}
              </button>}
              </section>
            </div>
            <div id="poem-result" role="region" aria-labelledby="results-region-label" className={`manuscript${busy ? " is-loading" : ""}`} aria-busy={busy}>
              <div className="paper-top">
                <span id="results-region-label">{!busy && result?.isDefault ? t("مثال محلّل: المتنبي", "Analyzed example: Al-Mutanabbī") : t("دفتر القصائد", "Poetry notebook")}</span>
                <span dir="auto">{t("قَافِيَة", "Qafiya")} / {result ? "01" : "—"}</span>
              </div>
              {busy && <div className="result-loading"><LoaderCircle className="spin" size={24} aria-hidden="true" /><p>{t("جارٍ العمل على الأبيات…", "Working on your verses…")}</p><div className="loading-lines" aria-hidden="true"><span /><span /><span /></div></div>}
              {!busy && (result ? (
                <>
                  <div className="result-heading">
                    <div className="result-meta">
                      <span>{t(result.analysis.meter_name, meterNames[result.analysis.meter] ?? result.analysis.meter_name)}</span><span>{t("الروي المكتشف:", "Detected rhyme consonant:")}{" "}
                      {detectedRawis.length
                        ? detectedRawis.join("، ")
                        : t("غير محدد", "Not identified")}
                      </span>
                      {!result.analysis.detection && !result.analysis.verses.every((v) => v.rawi_matches) && (
                        <span>{t("المطلوب:", "Target:")} {result.analysis.requested_rawi}</span>
                      )}
                    </div>
                    <h2 id="result-title" tabIndex={-1} dir="auto">{result.example ? t(result.example.title_ar, result.example.title_en) : translateMessage(result.title, locale)}</h2>
                    {result.example && <p className="field-help">{t(result.example.poet_ar, result.example.poet_en)} / <a href={result.example.source_url} target="_blank" rel="noreferrer">{t("المصدر: الديوان", "Source: Al Diwan")}</a></p>}
                    <p
                      className={
                        result.analysis.accepted ? "status good" : "status"
                      }
                    >
                      {result.analysis.detection
                        ? (result.analysis.meter === "unknown"
                          ? t("تعذّر تحديد البحر", "Meter could not be identified")
                          : t("البحر الأقرب وفق الفحص الآلي", "Closest meter from automated analysis"))
                        : result.analysis.accepted
                        ? t("مطابق في الفحص الآلي", "Passed the automated checks")
                        : t("مسوّدة تحتاج مراجعة عروضية", "Draft needs a prosody review")}
                    </p>
                  </div>
                  {result.example?.note_ar && <p className="warning">{t(result.example.note_ar, result.example.note_en)}</p>}
                  {result.example && !result.intentionalMismatch && !result.example.note_ar && !result.analysis.detection && !result.analysis.accepted && <p className="warning">{t("هذا شاهد شعري معروف؛ قد يخطئ الفحص الآلي في بعض صيغ الوزن أو استخراج الروي. قارن النتيجة بالشاهد ومصدره قبل الحكم على البيت.", "This is an established verse. Automated analysis can misread metrical variations or the rawi. Compare the result with the excerpt and its source before judging the verse.")}</p>}
                  {result.analysis.detection && <p className="analysis-note">{result.analysis.rhyme_consistent
                    ? t("روي موحّد في الأبيات المدخلة", "Consistent rhyme consonant across the supplied verses")
                    : t("الروي مختلف أو غير محدد في بعض الأبيات", "Rhyme consonants vary or could not be identified in some verses")}</p>}
                  {result.inputText !== undefined && result.inputText !== text && <p className="warning" role="status">{t("تغيّر النص في المعاينة. أعد الفحص لتحديث هذه النتيجة.", "The preview has changed. Analyze again to update this result.")}</p>}
                  {result.revision_warning && (
                    <p className="warning" role="status">
                      {t("توقفت المراجعة:", "Revision stopped:")} {translateMessage(result.revision_warning, locale)}
                    </p>
                  )}
                  {result.analysis.tashkeel?.changed && (
                    <p className="tashkeel-notice" role="status">
                      {t("أُكمل التشكيل محليًا. النص أدناه هو ما جرى فحصه؛ نصّك الأصلي باقٍ في مساحة الكتابة.", "Missing vowel marks were added locally. The text below is the version analyzed; your original remains in the writing area.")}
                    </p>
                  )}
                  <div className="poem">
                    {result.verses.map((verse, i) => (
                      <article key={i}>
                        <div className="verse" lang="ar" dir="rtl">
                          <span>{verse.sadr}</span>
                          <span>{verse.ajuz}</span>
                        </div>
                        <details open={i === 0}>
                          <summary>
                            <span>{t("التقطيع والتفعيلات للبيت", "Scansion and feet for verse")} {i + 1}</span><span>
                            {result.analysis.verses[i].is_valid
                              ? t("وزن مطابق", "Meter matches")
                              : t("راجع الوزن", "Check meter")}{" "}
                            </span><span>
                            {result.analysis.detection
                              ? (result.analysis.verses[i].qafiyah?.rawi
                                ? t(`الروي: ${result.analysis.verses[i].qafiyah?.rawi}`, `Rhyme consonant: ${result.analysis.verses[i].qafiyah?.rawi}`)
                                : t("تعذّر تحديد الروي", "Rhyme consonant could not be identified"))
                              : result.analysis.verses[i].rawi_matches
                              ? t("رويّ مطابق", "Rhyme consonant matches")
                              : result.analysis.verses[i].qafiyah?.rawi
                                ? t(`الروي ${result.analysis.verses[i].qafiyah?.rawi}، المطلوب ${result.analysis.requested_rawi}`, `Rhyme consonant: ${result.analysis.verses[i].qafiyah?.rawi}; target: ${result.analysis.requested_rawi}`)
                                : t("تعذّر تحديد الروي", "Rhyme consonant could not be identified")}
                            </span>
                          </summary>
                          <details className="learning-guide rhythm-guide">
                            <summary>{t("كيف أقرأ التقطيع؟", "How do I read the rhythm?")}</summary>
                            <p>{t("نقرأ الشعر كما يُنطق. الكتابة العروضية تُظهر الحروف المنطوقة، ثم نحولها إلى إيقاع: 1 = متحرك، 0 = ساكن. حدود التفعيلة قد تقع داخل الكلمة.", "Scan the sounds you pronounce. Prosodic spelling shows those sounds, then encodes them as 1 = a vowel-bearing consonant, 0 = a quiescent consonant. A foot can end inside a word.")}</p>
                            <p>{t("مثال: فَعُولُنْ = 11010. وقد تأتي فَعُولُ = 1101 بالقبض؛ التغيير المسموح ليس كسرًا في الوزن.", "Example: فَعُولُنْ = 11010. Its qabḍ form فَعُولُ = 1101 is a permitted variation, rather than a broken rhythm.")}</p>
                          </details>
                          <div className="scansion">
                            {(["sadr", "ajuz"] as const).map((part) => {
                              const scan = result.analysis.verses[i][part];
                              return <section key={part}>
                                <h3>{part === "sadr" ? t("الصدر", "First half-line (sadr)") : t("العجز", "Second half-line (ajuz)")}</h3>
                                {scan ? <>
                                  <p>{t("كما يُنطق (الكتابة العروضية)", "Pronounced form (prosodic spelling)")}</p>
                                  <p className="arudi-text" lang="ar" dir="rtl">{scan.arudi_text || t("غير متاح", "Unavailable")}</p>
                                  <p>{t("إيقاع الشطر كاملًا", "Rhythm of the complete half-line")}</p>
                                  <code dir="ltr">{scan.pattern || "—"}</code>
                                  <p className="rhythm-key">{t("1 = متحرك، 0 = ساكن. افتح أي تفعيلة للمقارنة.", "1 = vowel-bearing, 0 = quiescent. Expand a foot to compare patterns.")}</p>
                                  {scan.letter_alignment && !scan.letter_alignment.available && <p className="alignment-note">{t("تعذّرت محاذاة الحروف مع الإيقاع في هذا الشطر. نعرض النمط والتفعيلات دون تقسيم حرفي قد يكون مضلّلًا.", "Letters could not be aligned reliably with the rhythm in this half-line. Its pattern and feet remain available without a potentially misleading letter division.")}</p>}
                                  <ol className="foot-breakdown">
                                    {scan.feet.map((f, j) => <li key={j} className={f.status === "ok" ? "foot-detail" : "foot-detail broken"}>
                                      <details className="foot-explanation" open={j === 0}>
                                      <summary>
                                        <span className="foot-index">{t("التفعيلة", "Foot")} {j + 1}</span>
                                        <bdi lang="ar" className="foot-name">{f.actual_tafeela || f.base_tafeela || t("زيادة", "Extra sounds")}</bdi>
                                        <code dir="ltr">{f.status === "missing" ? "—" : f.actual_segment}</code>
                                        <span className="foot-state">{f.status === "ok" ? t("مطابقة", "Matches") : t("تحتاج مراجعة", "Review")}</span>
                                      </summary>
                                      {Boolean(f.letters?.length) && <div className="letter-scansion">
                                        <h4>{t("الحروف المنطوقة في هذه التفعيلة", "Pronounced letters in this foot")}</h4>
                                        <p className="pronounced-segment" lang="ar" dir="rtl">{f.pronounced_segment}</p>
                                        <ol className="letter-cells" dir="rtl">
                                          {f.letters?.map((letter) => <li key={letter.position}>
                                            <span className="scanned-letter" lang="ar">{letter.letter}</span>
                                            <code dir="ltr">{letter.symbol}</code>
                                            <span className="letter-state">{letter.symbol === "1" ? t("متحرك", "Vowel-bearing") : t("ساكن", "Quiescent")}</span>
                                          </li>)}
                                        </ol>
                                        <p>{t("نقسّم المنطوق، لا الرسم الإملائي. قد تنقسم الكلمة بين تفعيلتين؛ وتظهر الشدّة حرفين والتنوين نونًا منطوقة. الحركات الدقيقة لا تظهر في هذا التمثيل.", "This divides pronounced sounds, not original spelling. A word may cross feet; shadda expands to two letters and tanween adds a pronounced ن. Exact vowel marks are not represented here.")}</p>
                                      </div>}
                                      <dl>
                                        <div><dt>{t("التفعيلة الأصلية", "Base foot")}</dt><dd lang="ar" dir="rtl">{f.base_tafeela || "—"}</dd></div>
                                        <div><dt>{t("النمط المتوقع في هذا الموضع", "Expected pattern at this position")}</dt><dd><code dir="ltr">{f.expected_pattern || "—"}</code></dd></div>
                                        <div><dt>{t("النمط في نصك", "Pattern in your verse")}</dt><dd><code dir="ltr">{f.status === "missing" ? t("مفقود", "Missing") : f.actual_segment || "—"}</code></dd></div>
                                        <div><dt>{t("الصيغة العروضية", "Metrical variation")}</dt><dd>{f.status === "ok" ? footVariant(f.zihaf_name_ar, locale) : t("لا توجد مطابقة معتمدة لهذا الجزء", "No accepted match for this segment")}</dd></div>
                                      </dl>
                                      <p className="foot-feedback">{f.status === "ok"
                                        ? t("مطابقة لصيغة مسموحة في هذا الموضع.", "Matches an allowed form at this position.")
                                        : f.status === "missing"
                                          ? t("ينقص هذا الموضع جزء من الإيقاع. راجع نطق الشطر والتشكيل.", "This position is missing part of the rhythm. Review pronunciation and vowel marks.")
                                          : f.status === "extra_bits"
                                            ? t("أصوات زائدة بعد نهاية الوزن المتوقع. راجع نهاية الشطر.", "Extra sounds remain after the expected rhythm. Review the end of the half-line.")
                                            : t("قارن النمطين، ثم راجع التشكيل والنطق قبل تعديل كلماتك.", "Compare the two patterns, then check vowel marks and pronunciation before changing your words.")}</p>
                                      </details>
                                    </li>)}
                                  </ol>
                                </> : <p>{t("تعذّر تقطيع هذا الشطر. راجع النص والتشكيل ثم أعد المحاولة.", "This half-line could not be scanned. Review its text and vowel marks, then retry.")}</p>}
                              </section>;
                            })}
                          </div>
                          <details className="learning-guide rhyme-breakdown">
                            <summary>{t("كيف تنتهي القافية؟", "Understanding the rhyme")}</summary>
                            <p>{t("الروي هو محور تكرار القافية. نعرض هنا مكونات القافية التي استطاع الفحص استخراجها؛ غياب مكوّن لا يعني وجود خطأ.", "The rawi is the recurring anchor of the rhyme. These are the components the analyzer could extract; an absent component is not itself an error.")}</p>
                            <dl>{([
                              ["qafiyah_text", t("مقطع القافية", "Rhyme passage")],
                              ["rawi", t("الروي: الحرف المحوري", "Rawi: rhyme consonant")],
                              ["rawi_haraka", t("حركة الروي", "Rawi vowel mark")],
                              ["ridf", t("الردف: حرف مد قبل الروي مباشرة", "Ridf: long vowel directly before the rawi")],
                              ["tasees", t("التأسيس: ألف يفصلها حرف عن الروي", "Taʾsīs: alif separated from the rawi by one letter")],
                              ["dakhil", t("الدخيل: الحرف بين التأسيس والروي", "Dakhīl: consonant between taʾsīs and rawi")],
                              ["wasl", t("الوصل: امتداد بعد الروي", "Waṣl: extension after the rawi")],
                              ["khuruj", t("الخروج: مد بعد هاء الوصل", "Khurūj: long vowel after the waṣl hāʾ")],
                            ] as const).map(([key, label]) => <div key={key}><dt>{label}</dt><dd lang="ar" dir="rtl">{result.analysis.verses[i].qafiyah?.[key] || "—"}</dd></div>)}</dl>
                          </details>
                        </details>
                      </article>
                    ))}
                  </div>
                  <p className="analysis-note">{translateMessage(result.analysis.note, locale)}</p>
                  <div className="result-actions">
                    <button
                      onClick={async () => {
                        try {
                          await navigator.clipboard.writeText(poemText);
                          setNotice("نُسخت الأبيات.");
                        } catch {
                          setNotice("تعذّر النسخ. يمكنك تنزيل الأبيات.");
                        }
                      }}
                    >
                      <Copy size={16} /> {t("نسخ الأبيات", "Copy verses")}
                    </button>
                    <button onClick={download}>
                      <Download size={16} /> {t("تنزيل النص", "Download text")}
                    </button>
                  </div>
                  <p className="notice" role="status">
                    {translateMessage(notice, locale)}
                  </p>
                </>
              ) : (
                <div className="empty">
                  <blockquote className="empty-verse" lang="ar" dir="rtl"><span>{selectedExample.verses[0].sadr}</span><span>{selectedExample.verses[0].ajuz}</span></blockquote>
                  <h2>{t("لكلّ قصيدة بداية.", "Every poem begins somewhere.")}</h2>
                  <p>
                    {t("اختر المعنى والبحر، وستجد أبياتك هنا.", "Choose a theme and a meter. Your verses will appear here.")}
                    <br />
                    {t("أو افتح بيتًا من المعلّقات واكتشف إيقاعه.", "Or explore the rhythm of a verse from the Muʿallaqāt.")}
                  </p>
                  <button type="button" disabled={busy} onClick={() => loadSample()}>
                    {t("استكشف مثالًا", "Explore an example")}
                  </button>
                  <span className="paper-mark">{t("حيث يلتقي الخيال بالإيقاع", "Where imagination meets rhythm")}</span>
                </div>
              ))}
            </div>
          </section>
          <section className="method" aria-label={t("كيف تعمل الورشة", "How the workshop works")}>
            <div>
              <span>{t("١", "1")}</span>
              <h3>{t("معنى من اختيارك", "Choose your theme")}</h3>
              <p>{t("حدّد الفكرة والبحر وحرف الروي.", "Set the theme, meter, and rhyme consonant.")}</p>
            </div>
            <div>
              <span>{t("٢", "2")}</span>
              <h3>{t("صياغة ثم مراجعة", "Compose, then revise")}</h3>
              <p>{t("يقترح النموذج أبياتًا ويراجعها بتغذية عروضية.", "AI drafts verses and revises them using feedback from the meter analysis.")}</p>
            </div>
            <div>
              <span>{t("٣", "3")}</span>
              <h3>{t("إيقاع يمكنك قراءته", "See the rhythm")}</h3>
              <p>{t("افتح كل بيت لترى تقطيعه والتفعيلات.", "Expand each verse to see its scansion and metrical feet.")}</p>
            </div>
          </section>
        </main>
        <footer>
          <span className="footer-brand">{t("قَافِيَة", "Qafiya")}</span>
          <p>{t("الشعر تجربة إنسانية. هذه أداة للمحاولة والتعلّم.", "Poetry is a human art. This is a space to experiment and learn.")}</p>
          <span className="footer-credit" dir="ltr">
            Created by <a href="https://tahachelly.com/" target="_blank" rel="noreferrer">Taha Chelly</a>
            <span aria-hidden="true">: </span>
            <a href="https://qafiya.tahachelly.com/">qafiya.tahachelly.com</a>
          </span>
          <span className="prosody-credit">
            {t("التحليل العروضي باستخدام", "Prosody analysis powered by")}{" "}
            <a href="https://github.com/cnemri/pyarud" target="_blank" rel="noreferrer">PyArud</a>
            {": "}<bdi>Chouaieb Nemri</bdi>{": "}<bdi>Maged Saeed</bdi>
            {": "}<a href="/licenses/pyarud.txt" target="_blank" rel="noreferrer">{t("ترخيص MIT", "MIT license")}</a>
          </span>
        </footer>
      </div>
    </>
  );
}
createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
