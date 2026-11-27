import { getSystemLanguage } from "./systemLanguage";
import { translateInterfaceText } from "./systemTranslations";
import { useMemo, useState } from "react";
import { Activity, ChevronRight, ClipboardList } from "lucide-react";

export type NeuroTrendSession = {
  session_id: string;
  checked_at: string;
  status: string;
  anomaly_type?: string | null;
  anomaly_score?: number | null;
  confidence?: number | null;
  signal_quality?: string | null;
  reliable?: boolean;
  model_conflict?: boolean;
};
export type NeuroPriorityVehicle = {
  vehicle_id: string;
  model: string;
  engine_model: string;
  status: string;
  reason: string;
  session_id: string;
  checked_at: string;
  anomaly_type?: string | null;
  anomaly_score?: number | null;
  confidence?: number | null;
  signal_quality?: string | null;
};
export type StoredHistory = { diagnoses: { session_id: string; created_at: string; status: string; timingMarks?: "matched" | "mismatched"; anomaly_type?: string; anomaly_title?: string; confidence?: number; anomaly_score?: number }[]; tickets: { ticket_id: string; session_id: string; created_at: string; anomaly_type?: string; urgency: string }[] };
type Props = {
  selectedVehicleId: string;
  sessions: NeuroTrendSession[];
  history?: StoredHistory | null;
  historyError?: string;
  onOpen: (vehicleId: string, sessionId: string, focusHistory?: boolean) => void;
};
const statusText: Record<string, string> = { normal: "Без отклонений", anomaly: "Есть отклонение", check_failed: "Замер не прошёл" };
const qualityText: Record<string, string> = { good: "хорошее", warning: "снижено", bad: "плохое" };
const qualityLevel = (quality?: string | null) => quality === "good" ? "good" : quality === "warning" ? "warning" : quality === "bad" ? "bad" : "unknown";
const urgencyText: Record<string, string> = { low: "низкий", medium: "средний", high: "высокий" };
const label = (text: string) => translateInterfaceText(text, getSystemLanguage());
const dateText = (value: string) => new Date(value).toLocaleString(getSystemLanguage(), { dateStyle: "short", timeStyle: "short" });
const percent = (value?: number | null) => typeof value === "number" && Number.isFinite(value) ? `${Math.round(value * 100)}%` : label("нет данных");

const reliableScore = (item: NeuroTrendSession): item is NeuroTrendSession & { anomaly_score: number } =>
  item.reliable === true && typeof item.anomaly_score === "number" && Number.isFinite(item.anomaly_score);

export function MeasurementTrend({ sessions }: { sessions: NeuroTrendSession[] }) {
  const trend = useMemo(() => sessions.slice(0, 5).reverse(), [sessions]);
  const plotted = trend.map((item, index) => ({ item, index, score: item.anomaly_score })).filter((point): point is { item: NeuroTrendSession; index: number; score: number } => point.item.status !== "check_failed" && !point.item.model_conflict && typeof point.score === "number" && Number.isFinite(point.score));
  const segments = trend.reduce<{ item: NeuroTrendSession; index: number; score: number }[][]>((all, item, index) => {
    if (reliableScore(item)) {
      const segment = all[all.length - 1] || [];
      if (!all.length) all.push(segment);
      segment.push({ item, index, score: item.anomaly_score });
    } else if (all.length && all[all.length - 1].length) all.push([]);
    return all;
  }, []).filter((segment) => segment.length);
  const plotX = (index: number) => trend.length < 2 ? 176 : 40 + index * 272 / (trend.length - 1);
  const plotY = (score: number) => 84 - Math.max(0, Math.min(1, score)) * 68;
  const lastPair = trend.slice(-2);
  const reliablePair = lastPair.length === 2 && lastPair.every(reliableScore);
  const firstScore = reliablePair ? lastPair[0].anomaly_score as number : 0;
  const lastScore = reliablePair ? lastPair[1].anomaly_score as number : 0;
  const trendFact = reliablePair
    ? firstScore === lastScore ? `Две соседние достоверные оценки без изменения: ${percent(firstScore)} → ${percent(lastScore)}.`
      : `Две соседние достоверные оценки ${lastScore > firstScore ? "выросли" : "снизились"}: ${percent(firstScore)} → ${percent(lastScore)} (${lastScore > firstScore ? "+" : "−"}${Math.round(Math.abs(lastScore - firstScore) * 100)} п. п.).`
    : "Для сравнения нужны два последних достоверных замера подряд.";
  return <section className="neuro-trend" id="neuro-vehicle-history" aria-label="График замеров двигателя">
    <h3>Динамика оценки аномалии</h3>
    {trend.length ? <><svg viewBox="0 0 344 110" role="img" aria-label="Оценка аномалии в процентах по датам замеров">
      {[1, 0.5, 0].map((score) => <g key={score}>
        <text x="32" y={plotY(score) + 4} textAnchor="end">{percent(score)}</text>
        <line x1="40" x2="312" y1={plotY(score)} y2={plotY(score)} />
      </g>)}
      {segments.map((segment) => <polyline key={segment[0].item.session_id}
        points={segment.map(({ index, score }) => `${plotX(index)},${plotY(score)}`).join(" ")} />)}
      {plotted.map(({ item, index, score }) => <circle key={item.session_id} cx={plotX(index)} cy={plotY(score)} r="3.5" className={reliableScore(item) ? undefined : "uncertain-point"}>
        <title>{item.session_id} · {percent(score)}</title>
      </circle>)}
      {trend.map((item, index) => <text key={item.session_id} x={plotX(index)} y="105" textAnchor="middle">
        {new Date(item.checked_at).toLocaleDateString(getSystemLanguage(), { day: "2-digit", month: "2-digit" })}
      </text>)}
    </svg>{plotted.some(({ item }) => !reliableScore(item)) && <small>Пустой маркер — замер с ограничением.</small>}<p>{getSystemLanguage() === "ru" ? trendFact : reliablePair ? translateInterfaceText("Последние два достоверных замера: {0} → {1} ({2} п. п.).", getSystemLanguage(), [percent(firstScore), percent(lastScore), (lastScore > firstScore ? "+" : "") + Math.round((lastScore - firstScore) * 100)]) : label(trendFact)}</p><details><summary>Значения по датам ({trend.length})</summary><div className="neuro-trend-list">{trend.map((item) => <div className={item.status === "check_failed" || item.model_conflict ? "neuro-trend-row neuro-trend-row--failed" : "neuro-trend-row"} key={item.session_id}><span>{dateText(item.checked_at)} · {item.session_id}</span><strong>{item.model_conflict ? "Код не соответствует двигателю" : item.status === "check_failed" ? "Замер не прошёл" : typeof item.anomaly_score === "number" ? `Оценка аномалии ${percent(item.anomaly_score)}` : "Оценка не предоставлена"}</strong><small>{item.anomaly_type || (statusText[item.status] ? label(statusText[item.status]) : item.status)}{item.confidence != null ? ` · уверенность ${percent(item.confidence)}` : ""}</small>{item.signal_quality && <span className={`neuro-quality-label neuro-quality-label--${qualityLevel(item.signal_quality)}`}>Качество замера: {(qualityText[item.signal_quality] ? label(qualityText[item.signal_quality]) : item.signal_quality)}</span>}</div>)}</div></details></> : <p>Для выбранной машины нет записей проверок.</p>}
    </section>;
}

export default function NeuroFleetOverview({ selectedVehicleId, sessions, history, historyError, onOpen }: Props) {
  const [more, setMore] = useState(false);
  const diagnoses = history?.diagnoses || [];
  const tickets = history?.tickets || [];
  const ticketRow = (ticket: StoredHistory["tickets"][number]) => <p key={ticket.ticket_id}><ClipboardList size={16} aria-hidden="true" /> Заявка {ticket.ticket_id} · приоритет {(urgencyText[ticket.urgency] ? label(urgencyText[ticket.urgency]) : ticket.urgency)} · {dateText(ticket.created_at)}</p>;
  return <section className="panel full-panel neuro-fleet-overview" aria-label="История проверок">
    <MeasurementTrend sessions={sessions} />
    {(history || historyError) && <section className="neuro-stored-history" aria-label="Диагнозы и заявки по машине">
      <h3>Диагнозы и заявки по машине</h3>
      {historyError ? <p role="status">{label(historyError)}</p> : <>
        {(!diagnoses.length && !tickets.length) && <p>Сохранённых диагнозов и заявок пока нет.</p>}
        {(more ? diagnoses : diagnoses.slice(0, 1)).map((item) => <article className="stored-result" key={item.session_id + item.created_at}>
          <strong><Activity size={18} aria-hidden="true" /> {(statusText[item.status] ? label(statusText[item.status]) : item.status)}{item.anomaly_type && ` · ${item.anomaly_type}`}{item.anomaly_title && ` · ${item.anomaly_title}`}</strong>
          <small>{dateText(item.created_at)} · {item.session_id}</small>
          <div>{typeof item.anomaly_score === "number" && <span>Оценка аномалии <b>{percent(item.anomaly_score)}</b></span>} {typeof item.confidence === "number" && <span>Уверенность <b>{percent(item.confidence)}</b></span>}</div>
          {item.timingMarks && <p>{label(item.timingMarks === "matched" ? "Метки совпали." : "Метки не совпадают")}</p>}
          {tickets.filter((t) => t.session_id === item.session_id).map(ticketRow)}
          {!tickets.some((t) => t.session_id === item.session_id) && <p>Заявка по этому замеру пока не создана.</p>}
          {sessions.some((session) => session.session_id === item.session_id) && <button type="button" className="btn btn-outline-secondary" onClick={() => onOpen(selectedVehicleId, item.session_id)}>Открыть замер <ChevronRight size={16} /></button>}
        </article>)}
        {diagnoses.length > 1 && <button type="button" aria-expanded={more} className="btn btn-outline-secondary" onClick={() => setMore(!more)}>{more ? "Свернуть историю" : `Предыдущие диагнозы (${diagnoses.length - 1})`}</button>}
        {tickets.filter((t) => !diagnoses.some((d) => d.session_id === t.session_id)).map(ticketRow)}
      </>}
    </section>}
  </section>;
}
