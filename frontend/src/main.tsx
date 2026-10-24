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
function App() {
  const [config, setConfig] = useState<Config | null>(null);
  const [connectionError, setConnectionError] = useState(false);
  const [mode, setMode] = useState<"generate" | "analyze">("generate");
  const [topic, setTopic] = useState(
    "الحنين إلى مدينةٍ تركنا فيها شيئًا من أرواحنا",
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
            "اكتب من بيت إلى ثمانية أبيات، وافصل الصدر عن العجز بعلامة * في كل سطر.",
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
      setError(e instanceof Error ? e.message : "حدث خطأ غير متوقع.");
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
      setError(e instanceof Error ? e.message : "تعذّر تحميل المثال");
    } finally {
      setBusy(false);
    }
  }
  function download() {
    const url = URL.createObjectURL(
      new Blob([`${result?.title}\n\n${poemText}`], {
        type: "text/plain;charset=utf-8",
      }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = "bayt-poem.txt";
    a.click();
    URL.revokeObjectURL(url);
  }
  return (
    <>
      <a className="skip" href="#workshop">
        انتقل إلى ورشة الكتابة
      </a>
      <div className="page">
        <header>
          <a className="brand" href="/" aria-label="بيت، الصفحة الرئيسية">
            بَيْت<span>ورشة الشعر العربي</span>
          </a>
          <span className="header-note">للِكلمة وزنٌ، وللخيال متّسع.</span>
          <span className="edition">
            نسخة تجريبية <span dir="ltr">01 / PYARUD</span>
          </span>
        </header>
        <main>
          <section className="intro">
            <div>
              <p className="eyebrow">مِن الفكرة إلى القصيدة</p>
              <h1>
                أعطِ خيالكَ
                <br />
                <em>وزنًا وقافية.</em>
              </h1>
              <p className="lead">
                اكتب ما تشعر به. ودع الذكاء الاصطناعي يصوغ المعنى، ثم استكشف
                إيقاع الأبيات بعلم العَروض.
              </p>
            </div>
            <aside className="hero-verse">
              <span className="ornament" aria-hidden="true">
                ب
              </span>
              <blockquote>
                وَمَا الشِّعْرُ إِلَّا شُعُورٌ
                <br />
                يَجِدُ الطَّرِيقَ إِلَى الْكَلِمَةِ
              </blockquote>
              <span>هنا تبدأ مسوّدتك القادمة</span>
            </aside>
          </section>
          <section className="workshop" id="workshop" aria-label="ورشة الكتابة">
            <div className="desk">
              <div className="desk-heading">
                <Feather size={22} />
                <h2>مساحة الكتابة</h2>
              </div>
              <div className="mode-switch" aria-label="طريقة العمل">
                <button
                  type="button"
                  aria-pressed={mode === "generate"}
                  onClick={() => {
                    setMode("generate");
                    setError("");
                  }}
                >
                  تأليف قصيدة
                </button>
                <button
                  type="button"
                  aria-pressed={mode === "analyze"}
                  onClick={() => {
                    setMode("analyze");
                    setError("");
                  }}
                >
                  فحص أبياتي
                </button>
              </div>
              <form onSubmit={submit}>
                <label htmlFor="topic">
                  {mode === "generate"
                    ? "عن ماذا تودّ أن تكتب؟"
                    : "اكتب أبياتك مع التشكيل"}
                </label>
                {mode === "generate" ? (
                  <textarea
                    id="topic"
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
                      value={text}
                      maxLength={4000}
                      required
                      onChange={(e) => setText(e.target.value)}
                      placeholder="صدر البيت * عجز البيت"
                    />
                    <p className="field-help">
                      كل بيت في سطر. افصل الشطرين بعلامة *. يمكنك ترك التشكيل
                      الناقص للنموذج المحلي.
                    </p>
                    <label className="tashkeel-toggle">
                      <input
                        type="checkbox"
                        checked={autoTashkeel}
                        onChange={(e) => setAutoTashkeel(e.target.checked)}
                      />
                      <span>إكمال التشكيل تلقائيًا</span>
                    </label>
                    <p className="field-help">
                      نُبقي الحركات المكتوبة ونُكمل الناقص محليًا. قد تحتاج
                      قراءة الشعر إلى تصحيح يدوي.
                    </p>
                  </>
                )}
                <div className="controls">
                  <div>
                    <label htmlFor="meter">البحر الشعري</label>
                    <select
                      id="meter"
                      value={meter}
                      onChange={(e) => setMeter(e.target.value)}
                    >
                      {(config?.meters ?? initialMeters).map((m) => (
                        <option key={m.key} value={m.key}>
                          {m.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label htmlFor="rawi">حرف الروي المطلوب</label>
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
                      <label htmlFor="count">عدد الأبيات</label>
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
                    ? "جارٍ العمل على الأبيات…"
                    : mode === "generate"
                      ? "انظم القصيدة"
                      : "افحص الوزن والقافية"}
                  {!busy && <ArrowUpLeft size={19} />}
                </button>
                {busy && (
                  <p className="field-help" role="status">
                    قد تستغرق الصياغة والمراجعة بضع دقائق.
                  </p>
                )}
                {connectionError ? (
                  <p className="warning" role="status">
                    تعذّر الاتصال بالخادم. شغّل الخلفية وأعد تحميل الصفحة.
                  </p>
                ) : config &&
                  !config.generation_available &&
                  mode === "generate" ? (
                  <p className="warning">
                    التوليد غير مفعّل بعد. يمكنك الآن فحص أبياتك أو تجربة
                    المثال.
                  </p>
                ) : null}
                {error && (
                  <p className="error" role="alert">
                    {error}
                  </p>
                )}
              </form>
              <button
                type="button"
                className="sample"
                disabled={busy}
                onClick={loadSample}
              >
                <BookOpen size={17} /> جرّب بيتًا من المعلّقات{" "}
                <ArrowUpLeft size={16} />
              </button>
            </div>
            <div id="poem-result" className="manuscript" aria-busy={busy}>
              <div className="paper-top">
                <span>دفتر القصائد</span>
                <span dir="ltr">بَيْت / {result ? "01" : "—"}</span>
              </div>
              {result ? (
                <>
                  <div className="result-heading">
                    <p className="eyebrow">
                      {result.analysis.meter_name} · الروي المكتشف:{" "}
                      {detectedRawis.length
                        ? detectedRawis.join("، ")
                        : "غير محدد"}
                      {!result.analysis.verses.every((v) => v.rawi_matches) && (
                        <> · المطلوب: {result.analysis.requested_rawi}</>
                      )}
                    </p>
                    <h2>{result.title}</h2>
                    <p
                      className={
                        result.analysis.accepted ? "status good" : "status"
                      }
                    >
                      {result.analysis.accepted
                        ? "مطابق في الفحص الآلي"
                        : "مسوّدة تحتاج مراجعة عروضية"}
                    </p>
                  </div>
                  {result.revision_warning && (
                    <p className="warning" role="status">
                      توقفت المراجعة: {result.revision_warning}
                    </p>
                  )}
                  {result.analysis.tashkeel?.changed && (
                    <p className="tashkeel-notice" role="status">
                      أُكمل التشكيل محليًا. النص أدناه هو ما جرى فحصه؛ نصّك
                      الأصلي باقٍ في مساحة الكتابة.
                    </p>
                  )}
                  <div className="poem">
                    {result.verses.map((verse, i) => (
                      <article key={i}>
                        <div className="verse">
                          <span>{verse.sadr}</span>
                          <span>{verse.ajuz}</span>
                        </div>
                        <details>
                          <summary>
                            عرض التقطيع والتفعيلات · البيت {i + 1} ·{" "}
                            {result.analysis.verses[i].is_valid
                              ? "وزن مطابق"
                              : "راجع الوزن"}{" "}
                            ·{" "}
                            {result.analysis.verses[i].rawi_matches
                              ? "رويّ مطابق"
                              : result.analysis.verses[i].qafiyah?.rawi
                                ? `الروي ${result.analysis.verses[i].qafiyah?.rawi}، المطلوب ${result.analysis.requested_rawi}`
                                : "تعذّر تحديد الروي"}
                          </summary>
                          <div className="scansion">
                            {(["sadr", "ajuz"] as const).map((part) => (
                              <div key={part}>
                                <strong>
                                  {part === "sadr" ? "الصدر" : "العجز"}
                                </strong>
                                <code dir="ltr">
                                  {result.analysis.verses[i][part]?.pattern}
                                </code>
                                <div className="feet">
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
                                          "زيادة"}
                                        <small>
                                          {f.status === "ok"
                                            ? f.zihaf_name_ar
                                            : "غير مطابق"}
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
                  <p className="analysis-note">{result.analysis.note}</p>
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
                      <Copy size={16} /> نسخ الأبيات
                    </button>
                    <button onClick={download}>
                      <Download size={16} /> تنزيل النص
                    </button>
                  </div>
                  <p className="notice" role="status">
                    {notice}
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
                  <h2>لكلّ قصيدة بداية.</h2>
                  <p>
                    اختر المعنى والبحر، وستجد أبياتك هنا.
                    <br />
                    أو افتح بيتًا من المعلّقات واكتشف إيقاعه.
                  </p>
                  <button type="button" disabled={busy} onClick={loadSample}>
                    استكشف مثالًا <ArrowUpLeft size={17} />
                  </button>
                  <span className="paper-mark">حيث يلتقي الخيال بالإيقاع</span>
                </div>
              )}
            </div>
          </section>
          <section className="method" aria-label="كيف تعمل الورشة">
            <div>
              <span>١</span>
              <h3>معنى من اختيارك</h3>
              <p>حدّد الفكرة والبحر وحرف الروي.</p>
            </div>
            <div>
              <span>٢</span>
              <h3>صياغة ثم مراجعة</h3>
              <p>يقترح النموذج أبياتًا ويراجعها بتغذية عروضية.</p>
            </div>
            <div>
              <span>٣</span>
              <h3>إيقاع يمكنك قراءته</h3>
              <p>افتح كل بيت لترى تقطيعه والتفعيلات.</p>
            </div>
          </section>
        </main>
        <footer>
          <span className="footer-brand">بَيْت</span>
          <p>الشعر تجربة إنسانية. هذه أداة للمحاولة والتعلّم.</p>
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
