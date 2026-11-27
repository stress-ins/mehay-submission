import { useEffect, useState } from "react";
import { ClipboardCheck } from "lucide-react";
import { useSystemLanguage } from "./systemLanguage";
import { translateSystemText } from "./systemTranslations";

type Ticket = { ticket_id: string; createdAt: string; payload: { vehicle_id: string; session_id: string; anomaly_type: string; urgency: string; conclusion: string; operations: string[]; references: { manual: string; pdf_page: number }[] } };
export default function SubmittedTickets({ api }: { api: <T>(url: string) => Promise<T> }) {
  const locale = useSystemLanguage();
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    api<{ tickets: Ticket[] }>("/api/neuro/created-tickets").then(data => { if (active) setTickets(data.tickets); }).catch(() => { if (active) setError("Не удалось получить отправленные заявки ТОиР."); });
    return () => { active = false; };
  }, [api]);
  if (error) return <p role="alert">{translateSystemText(error, locale)}</p>;
  if (!tickets.length) return null;
  return <section><h2><ClipboardCheck size={21}/> Передано в ТОиР</h2>{tickets.map(({ ticket_id, payload, createdAt }) => <details key={payload.vehicle_id + payload.session_id}>
    <summary>{ticket_id} · {payload.vehicle_id} · {new Date(createdAt).toLocaleDateString("ru-RU")}</summary>
    <p>{payload.conclusion}</p><p>Приоритет · {(() => { const label = ({ high: "Высокий", medium: "Средний", low: "Низкий" } as Record<string, string>)[payload.urgency]; return label ? translateSystemText(label, locale) : payload.urgency; })()}</p>
    <ul>{payload.operations.map(text => <li key={text}>{text}</li>)}</ul>
    {payload.references.map(ref => <small key={ref.manual + ref.pdf_page}>{ref.manual} · стр. {ref.pdf_page} </small>)}
  </details>)}</section>;
}
