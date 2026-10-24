import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  ArrowUpLeft,
  Feather,
  Copy,
  Download,
  LoaderCircle,
  BookOpen,
  ScanLine,
} from "lucide-react";
import "@fontsource/amiri/arabic-400.css";
import "@fontsource/amiri/arabic-700.css";
import "@fontsource/ibm-plex-sans-arabic/arabic-400.css";
import "@fontsource/ibm-plex-sans-arabic/arabic-500.css";
import "./style.css";
import { footVariant, meterNames, translateMessage } from "./translations";
type Verse = {
  sadr: string;
  ajuz: string;
};
type Foot = {
  actual_tafeela: string;
  base_tafeela: string;
  status: string;
  actual_segment: string;
  zihaf_name_ar: string;
};
type Scan = {
  pattern: string;
  feet: Foot[];
};
type Row = {
  is_valid: boolean;
  rawi_matches: boolean;
  qafiyah: { rawi: string } | null;
  sadr: Scan | null;
  ajuz: Scan | null;
};
type Analysis = {
  meter: string;
  requested_rawi: string;
  accepted: boolean;
  meter_name: string;
  average_score: number;
  note: string;
  verses: Row[];
  analyzed_verses?: Verse[];
  tashkeel?: { enabled: boolean; changed: boolean; original_verses: Verse[] };
};
type Result = {
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
const sample: Verse[] = [
  {
    sadr: "قِفَا نَبْكِ مِنْ ذِكْرَى حَبِيبٍ وَمَنْزِلِ",
    ajuz: "بِسِقْطِ اللِّوَى بَيْنَ الدَّخُولِ فَحَوْمَلِ",
  },
];
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
async function api<T>(path: string, body?: unknown): Promise<T> {
  const response = await fetch(
    `${apiBase}/api/${path}`,
    body
      ? {
          method: "POST",
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
  try { return localStorage.getItem("qafiya-language") === "en" ? "en" : "ar"; }
  catch { return "ar"; }
}
function App() {
  const [locale, setLocale] = useState<Locale>(initialLocale);
  const t = (ar: string, en: string) => locale === "en" ? en : ar;
  useEffect(() => {
    document.documentElement.lang = locale;
    document.documentElement.dir = locale === "en" ? "ltr" : "rtl";
    document.title = locale === "en" ? "Qafiya | Arabic poetry workshop" : "قافية | ورشة الشعر العربي";
    try { localStorage.setItem("qafiya-language", locale); } catch { /* Storage may be blocked. */ }
    const url = new URL(window.location.href);
    url.searchParams.set("lang", locale);
    window.history.replaceState(null, "", url);
  }, [locale]);
  const [config, setConfig] = useState<Config | null>(null);
  const [connectionError, setConnectionError] = useState(false);
  const [mode, setMode] = useState<"generate" | "analyze">("generate");
  const [topic, setTopic] = useState(
    locale === "en" ? "Longing for a city where we left a part of ourselves" : "الحنين إلى مدينةٍ تركنا فيها شيئًا من أرواحنا",
  );
  const [meter, setMeter] = useState("taweel");
  const [rawi, setRawi] = useState("م");
  const [count, setCount] = useState(3);
  const [text, setText] = useState("");
  const [autoTashkeel, setAutoTashkeel] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [result, setResult] = useState<Result | null>(null);
  useEffect(() => {
    api<Config>("config")
      .then(setConfig)
      .catch(() => setConnectionError(true));
  }, []);
  useEffect(() => {
    if (!result) return;
    setNotice("اكتمل الفحص. يمكنك الآن عرض تقطيع كل بيت.");
    if (window.matchMedia("(max-width: 759px)").matches) {
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
        const lines = text
          .trim()
          .split("\n")
          .filter((line) => line.trim());
        if (
          lines.length === 0 ||
          lines.length > 8 ||
          lines.some((line) => line.split("*").length !== 2)
        )
          throw new Error(
            t("اكتب من بيت إلى ثمانية أبيات، وافصل الصدر عن العجز بعلامة * في كل سطر.", "Enter 1–8 verses, one per line, with * between the two half-lines."),
          );
        const verses = lines.map((line) => {
          const [sadr, ajuz] = line.split("*");
          return { sadr: sadr.trim(), ajuz: ajuz.trim() };
        });
        const analysis = await api<Analysis>("analyze", {
          verses,
          meter,
          rawi,
          auto_tashkeel: autoTashkeel,
        });
        setResult({
          title: "قصيدتك تحت المجهر",
          verses: analysis.analyzed_verses ?? verses,
          analysis,
        });
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : t("حدث خطأ غير متوقع.", "An unexpected error occurred."));
    } finally {
      setBusy(false);
    }
  }
  async function loadSample() {
    setMode("analyze");
    setMeter("taweel");
    setRawi("ل");
    setText(sample.map((v) => `${v.sadr} * ${v.ajuz}`).join("\n"));
    setBusy(true);
    setError("");
    setNotice("");
    try {
      setResult({
        title: "من معلّقة امرئ القيس",
        verses: sample,
        analysis: await api<Analysis>("analyze", {
          verses: sample,
          meter: "taweel",
          rawi: "ل",
        }),
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : t("تعذّر تحميل المثال", "Unable to load the example."));
    } finally {
      setBusy(false);
    }
  }
  function download() {
    const url = URL.createObjectURL(
      new Blob([`${translateMessage(result?.title ?? "", locale)}\n\n${poemText}`], {
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
          <span className="edition">
            {t("نسخة تجريبية", "Beta")} <span dir="ltr">01 / PYARUD</span>
          </span>
        </header>
        <main>
          <section className="intro">
            <div>
              <p className="eyebrow">{t("مِن الفكرة إلى القصيدة", "From an idea to a poem")}</p>
              <h1>
                {t("أعطِ خيالكَ", "Give your imagination")}
                <br />
                <em>{t("وزنًا وقافية.", "rhythm and rhyme.")}</em>
              </h1>
              <p className="lead">
                {t("اكتب ما تشعر به. ودع الذكاء الاصطناعي يصوغ المعنى، ثم استكشف إيقاع الأبيات بعلم العَروض.", "Start with a feeling. Let AI shape it into Arabic verse, then explore its rhythm through the rules of Arabic prosody.")}
              </p>
            </div>
            <aside className="hero-verse">
              <span className="ornament" aria-hidden="true">
                ب
              </span>
              <blockquote lang="ar" dir="rtl">
                وَمَا الشِّعْرُ إِلَّا شُعُورٌ
                <br />
                يَجِدُ الطَّرِيقَ إِلَى الْكَلِمَةِ
              </blockquote>
              {locale === "en" && <p className="verse-gloss">Poetry is feeling finding its way into words.</p>}
              <span>{t("هنا تبدأ مسوّدتك القادمة", "Your next draft begins here")}</span>
            </aside>
          </section>
          <section className="workshop" id="workshop" aria-label={t("ورشة الكتابة", "Writing workshop")}>
            <div className="desk">
              <div className="desk-heading">
                <Feather size={22} />
                <h2>{t("مساحة الكتابة", "Your writing desk")}</h2>
              </div>
              <div className="mode-switch" aria-label={t("طريقة العمل", "Workshop mode")}>
                <button
                  type="button"
                  aria-pressed={mode === "generate"}
                  onClick={() => {
                    setMode("generate");
                    setError("");
                  }}
                >
                  {t("تأليف قصيدة", "Compose a poem")}
                </button>
                <button
                  type="button"
                  aria-pressed={mode === "analyze"}
                  onClick={() => {
                    setMode("analyze");
                    setError("");
                  }}
                >
                  {t("فحص أبياتي", "Analyze my verses")}
                </button>
              </div>
              <form onSubmit={submit}>
                <label htmlFor="topic">
                  {mode === "generate"
                    ? t("عن ماذا تودّ أن تكتب؟", "What would you like to write about?")
                    : t("اكتب أبياتك مع التشكيل", "Enter your Arabic verses with vowel marks")}
                </label>
                {mode === "generate" ? (
                  <textarea
                    id="topic"
                    dir="auto"
                    value={topic}
                    maxLength={500}
                    minLength={3}
                    required
                    onChange={(e) => setTopic(e.target.value)}
                    placeholder={t("حنين، لقاء، أو مدينة لا تغيب…", "A longing, a reunion, a city you cannot forget…")}
                  />
                ) : (
                  <>
                    <textarea
                      id="topic"
                      lang="ar" dir="rtl"
                      value={text}
                      maxLength={4000}
                      required
                      onChange={(e) => setText(e.target.value)}
                      placeholder={t("صدر البيت * عجز البيت", "First half-line * second half-line")}
                    />
                    <p className="field-help">
                      {t("كل بيت في سطر. افصل الشطرين بعلامة *. يمكنك ترك التشكيل الناقص للنموذج المحلي.", "Use one line per verse, with * between its two halves. The local model can fill in missing vowel marks.")}
                    </p>
                    <label className="tashkeel-toggle">
                      <input
                        type="checkbox"
                        checked={autoTashkeel}
                        onChange={(e) => setAutoTashkeel(e.target.checked)}
                      />
                      <span>{t("إكمال التشكيل تلقائيًا", "Fill in missing Arabic vowel marks")}</span>
                    </label>
                    <p className="field-help">
                      {t("نُبقي الحركات المكتوبة ونُكمل الناقص محليًا. قد تحتاج قراءة الشعر إلى تصحيح يدوي.", "Existing vowel marks are preserved; missing marks are added locally. Poetry may still need manual corrections.")}
                    </p>
                  </>
                )}
                <div className="controls">
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
                    <label htmlFor="rawi">{t("حرف الروي المطلوب", "Target rhyme consonant (rawi)")}</label>
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
                      <label htmlFor="count">{t("عدد الأبيات", "Number of verses")}</label>
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
                </div>
                <button
                  className="primary"
                  disabled={
                    busy ||
                    (mode === "generate" && !config?.generation_available)
                  }
                >
                  {busy ? (
                    <LoaderCircle className="spin" size={20} />
                  ) : mode === "generate" ? (
                    <Feather size={20} />
                  ) : (
                    <ScanLine size={20} />
                  )}{" "}
                  {busy
                    ? t("جارٍ العمل على الأبيات…", "Working on your verses…")
                    : mode === "generate"
                      ? t("انظم القصيدة", "Compose the poem")
                      : t("افحص الوزن والقافية", "Check meter and rhyme")}
                  {!busy && <ArrowUpLeft size={19} />}
                </button>
                {busy && (
                  <p className="field-help" role="status">
                    {t("قد تستغرق الصياغة والمراجعة بضع دقائق.", "Composition and revision may take a few minutes.")}
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
                  <p className="error" role="alert">
                    {translateMessage(error, locale)}
                  </p>
                )}
              </form>
              <button
                type="button"
                className="sample"
                disabled={busy}
                onClick={loadSample}
              >
                <BookOpen size={17} /> {t("جرّب بيتًا من المعلّقات", "Try a verse from the Muʿallaqāt")}{" "}
                <ArrowUpLeft size={16} />
              </button>
            </div>
            <div id="poem-result" className="manuscript" aria-busy={busy}>
              <div className="paper-top">
                <span>{t("دفتر القصائد", "Poetry notebook")}</span>
                <span dir="auto">{t("قَافِيَة", "Qafiya")} / {result ? "01" : "—"}</span>
              </div>
              {result ? (
                <>
                  <div className="result-heading">
                    <p className="eyebrow">
                      {t(result.analysis.meter_name, meterNames[result.analysis.meter] ?? result.analysis.meter_name)} · {t("الروي المكتشف:", "Detected rhyme consonant:")}{" "}
                      {detectedRawis.length
                        ? detectedRawis.join("، ")
                        : t("غير محدد", "Not identified")}
                      {!result.analysis.verses.every((v) => v.rawi_matches) && (
                        <> · {t("المطلوب:", "Target:")} {result.analysis.requested_rawi}</>
                      )}
                    </p>
                    <h2 dir="auto">{translateMessage(result.title, locale)}</h2>
                    <p
                      className={
                        result.analysis.accepted ? "status good" : "status"
                      }
                    >
                      {result.analysis.accepted
                        ? t("مطابق في الفحص الآلي", "Passed the automated checks")
                        : t("مسوّدة تحتاج مراجعة عروضية", "Draft needs a prosody review")}
                    </p>
                  </div>
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
                        <details>
                          <summary>
                            {t("عرض التقطيع والتفعيلات · البيت", "Scansion and metrical feet · Verse")} {i + 1} ·{" "}
                            {result.analysis.verses[i].is_valid
                              ? t("وزن مطابق", "Meter matches")
                              : t("راجع الوزن", "Check meter")}{" "}
                            ·{" "}
                            {result.analysis.verses[i].rawi_matches
                              ? t("رويّ مطابق", "Rhyme consonant matches")
                              : result.analysis.verses[i].qafiyah?.rawi
                                ? t(`الروي ${result.analysis.verses[i].qafiyah?.rawi}، المطلوب ${result.analysis.requested_rawi}`, `Rhyme consonant: ${result.analysis.verses[i].qafiyah?.rawi}; target: ${result.analysis.requested_rawi}`)
                                : t("تعذّر تحديد الروي", "Rhyme consonant could not be identified")}
                          </summary>
                          <div className="scansion">
                            {(["sadr", "ajuz"] as const).map((part) => (
                              <div key={part}>
                                <strong>
                                  {part === "sadr" ? t("الصدر", "First half-line (sadr)") : t("العجز", "Second half-line (ajuz)")}
                                </strong>
                                <code dir="ltr">
                                  {result.analysis.verses[i][part]?.pattern}
                                </code>
                                <div className="feet" lang="ar" dir="rtl">
                                  {result.analysis.verses[i][part]?.feet.map(
                                    (f, j) => (
                                      <span
                                        className={
                                          f.status === "ok"
                                            ? "foot"
                                            : "foot broken"
                                        }
                                        key={j}
                                      >
                                        {f.actual_tafeela ||
                                          f.base_tafeela ||
                                          t("زيادة", "Extra syllables")}
                                        <small lang={locale} dir={locale === "en" ? "ltr" : "rtl"}>
                                          {f.status === "ok"
                                            ? footVariant(f.zihaf_name_ar, locale)
                                            : t("غير مطابق", "Does not match")}
                                        </small>
                                      </span>
                                    ),
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
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
                  <div className="empty-art" aria-hidden="true">
                    <Feather size={40} strokeWidth={1} />
                    <div />
                    <div />
                    <div />
                  </div>
                  <h2>{t("لكلّ قصيدة بداية.", "Every poem begins somewhere.")}</h2>
                  <p>
                    {t("اختر المعنى والبحر، وستجد أبياتك هنا.", "Choose a theme and a meter. Your verses will appear here.")}
                    <br />
                    {t("أو افتح بيتًا من المعلّقات واكتشف إيقاعه.", "Or explore the rhythm of a verse from the Muʿallaqāt.")}
                  </p>
                  <button type="button" disabled={busy} onClick={loadSample}>
                    {t("استكشف مثالًا", "Explore an example")} <ArrowUpLeft size={17} />
                  </button>
                  <span className="paper-mark">{t("حيث يلتقي الخيال بالإيقاع", "Where imagination meets rhythm")}</span>
                </div>
              )}
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
            <span aria-hidden="true"> · </span>
            <a href="https://qafiya.tahachelly.com/">qafiya.tahachelly.com</a>
          </span>
          <span dir="ltr">POWERED BY PYARUD</span>
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
