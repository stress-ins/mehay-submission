import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Check, Mic, MicOff, Volume2, BookOpen } from "lucide-react";
import { hasStepValue, type MechanicPlanLanguage } from "./neuroPlanIntents";
import { useSystemLanguage } from "./systemLanguage";
import { translateInterfaceText as t } from "./systemTranslations";
import "./NeuroWorkflow.css";

export type ManualEvidenceItem = { text: string; sourceText?: string; language?: MechanicPlanLanguage; originalLanguage?: boolean; translations?: Partial<Record<Exclude<MechanicPlanLanguage, "ru">, string>>; title?: string; manual: string; pdfPage: number; url: string };
export type NeuroChatTurn = { manualVerified?: boolean; sessionId?: string; author?: string; role: "mechanic" | "assistant"; text: string; evidence: ManualEvidenceItem[] };

export function normalizeManualLineBreaks(text: string): string {
  return text.replace(/([\p{L}])[-‐‑]\r?\n[\t ]*([\p{L}])/gu, "$1$2");
}

export function NeuroChatHistory({ turns, appPath }: { turns: NeuroChatTurn[]; appPath: (path: string) => string }) {
  const language = useSystemLanguage();
  if (!turns.length) return null;
  return <div className="neuro-chat-history" aria-live="polite"><h3>{t("История вопросов по машине", language)}</h3>{turns.map((turn, i) => <article key={`${i}-${turn.role}`} className={`neuro-turn ${turn.role}`}><strong>{turn.role === "mechanic" ? turn.author || t("Механик", language) : turn.manualVerified === false ? ({ ru: "Запись механика", en: "Mechanic’s record", hi: "मैकेनिक का नोट", tg: "Сабти механик", uz: "Mexanik qaydi" })[language] : t("Ответ по источникам", language)}</strong>{turn.sessionId && turn.role === "mechanic" && <small> · {turn.sessionId}</small>}<p>{turn.text}</p>{turn.evidence.map((item, j) => <ManualEvidence key={`${item.manual}-${item.pdfPage}-${j}`} item={item} appPath={appPath} />)}</article>)}</div>;
}

function pageImageUrl(pdfUrl: string): string | null {
  try {
    const url = new URL(pdfUrl, window.location.origin);
    const match = url.pathname.match(/\/api\/manuals\/([^/]+)\.pdf$/u);
    const page = Number(url.hash.match(/page=(\d+)/u)?.[1]);
    if (!match || !Number.isInteger(page) || page < 1) return null;
    return `/api/manuals/${encodeURIComponent(decodeURIComponent(match[1]))}/pages/${page}.png`;
  } catch { return null; }
}

export function ManualEvidence({ item, appPath, pageRequest = 0, linkLabel }: { pageRequest?: number; item: ManualEvidenceItem; appPath: (path: string) => string; linkLabel?: string }) {
  const language = useSystemLanguage();
  const [failed, setFailed] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const image = pageImageUrl(item.url);
  const details = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    if (pageRequest && details.current) {
      details.current.open = true;
    }
  }, [pageRequest]);
  return <div className="neuro-evidence">
    <a href={appPath(item.url)} target="_blank" rel="noreferrer">{linkLabel || `${item.manual}, ${t("стр.", language)} ${item.pdfPage}`}</a>
    {image && !failed ? <details ref={details} onToggle={(event) => setExpanded(event.currentTarget.open)}><summary><BookOpen size={17} aria-hidden="true" />{t(expanded ? "Скрыть страницу руководства" : "Показать страницу руководства", language)}</summary>{expanded && <img src={appPath(image)} alt={`${item.manual}, ${t("страница", language)} ${item.pdfPage}`} onError={() => setFailed(true)} />}</details> : failed ? <small role="status">{t("Изображение страницы временно недоступно. Откройте PDF.", language)}</small> : null}
  </div>;
}

export default function NeuroWorkflow({ vehicle, engine, session, checkedAt, confidence, status, fault, recommendations, appPath, step, completed, onComplete, onStep, listening, onVoice, onRead, voiceNote, pageRequest, planOnly = false }: {
  vehicle: string; engine: string; session: string; checkedAt: string; confidence: string; status: string; fault: string;
  recommendations: ManualEvidenceItem[]; appPath: (path: string) => string;
  listening: boolean; onVoice?: () => void; onRead?: () => void; voiceNote: string; pageRequest: number;
  step: number; completed: number[]; onComplete: () => void; onStep: (step: number) => void; planOnly?: boolean;
}) {
  const language = useSystemLanguage();
  const current = recommendations[step];
  const measurements = recommendations.map((item, index) => ({ item, index })).filter(({ item }) => hasStepValue("torque", item.sourceText || item.text) || hasStepValue("clearance", item.sourceText || item.text));
  return <section className={`neuro-workflow${planOnly ? " neuro-workflow--plan-only" : ""}`} aria-label={t(planOnly ? "План работ по руководству" : "Рабочий контекст механика", language)}>
    {!planOnly && <div className="neuro-system-message" role="status"><strong>{t("Система · анализ измерения", language)}</strong><span>{t("Сессия", language)} {session || "—"} · {vehicle || "—"} · {engine || t("двигатель не указан", language)}</span><span>{checkedAt ? new Date(checkedAt).toLocaleString(language === "tg" ? "tg-TJ" : language) : t("Время измерения не указано", language)} · {t("Уверенность", language)}: {confidence || t("не определена", language)} · {status || t("ожидает анализа", language)}{fault ? ` · ${fault}` : ""}</span></div>}
    {current && <div className="neuro-step-plan" tabIndex={-1}>
      <h3>{`${t("План работ · шаг", language)} ${step + 1} ${t("из", language)} ${recommendations.length}`}</h3>
        <div className="workshop-step-body" aria-live="polite" aria-atomic="true">
          <div>{current.title && <h4>{current.title}</h4>}{current.originalLanguage && <small>{t("Текст и озвучивание на языке руководства · Русский", language)}</small>}<p lang={current.language}>{normalizeManualLineBreaks(current.text).split(/(\d+(?:[,.]\d+)?(?:\s*[–—±-]\s*\d+(?:[,.]\d+)?)?\s*(?:Н[·•⋅.]?м|мм|°С|°)|S=\d+)/gu).map((part, index) => index % 2 ? <strong key={index}>{part}</strong> : part)}</p></div>
        </div>
        <ManualEvidence key={current.url} pageRequest={pageRequest} item={current} appPath={appPath} linkLabel={t("Открыть руководство · стр. {page}", language).replace("{page}", String(current.pdfPage))} />
        {measurements.length > 0 && <details className="workshop-values"><summary>{t("Моменты и зазоры по шагам", language)}</summary>
          {measurements.map(({ item, index }) => <button type="button" key={index} onClick={() => { onStep(index); }}>{index + 1}. {item.title || item.text}</button>)}
        </details>}
        <div className="neuro-step-actions">
          <button type="button" disabled={completed.includes(step)} onClick={onComplete}><Check size={17}/>{t(completed.includes(step) ? "Выполнено" : "Отметить выполненным", language)}</button>
          {recommendations.length > 1 && <>
            <button type="button" disabled={step === 0} onClick={() => onStep(step - 1)}><ChevronLeft size={17}/>{t("Предыдущий шаг", language)}</button>
            <button type="button" disabled={step >= recommendations.length - 1} onClick={() => onStep(step + 1)}>{t("Читать следующий шаг", language)}<ChevronRight size={17}/></button>
          </>}
        </div>
        <div className="workshop-voice-actions">
          {onVoice && <button type="button" aria-pressed={listening} onClick={onVoice}>{listening ? <MicOff size={18}/> : <Mic size={18}/>} {t(listening ? "Остановить микрофон" : "Управлять голосом", language)}</button>}
          {onRead && <button type="button" onClick={onRead}><Volume2 size={18}/>{t("Прочитать шаг", language)}</button>}
        </div>
        {listening && <small>{t("Скажите «дальше», «повтори», «как затянуть» или «покажи рисунок».", language)}</small>}
        {voiceNote && <p className="workshop-voice-note" role="status">{voiceNote}</p>}
    </div>}
  </section>;
}
