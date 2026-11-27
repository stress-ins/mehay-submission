import { useEffect, useState } from "react";

type Api = <T>(url: string, init?: RequestInit) => Promise<T>;
type Observation = {
  id: string; created_at: string; user_id: string; vehicle_id: string | null; vehicle_model: string | null;
  engine: string | null; session_id: string | null; surface: string; request_text: string;
  route_decision: string | null; action: string; tool: string | null;
  source_refs: { manual: string; page: number }[]; outcome: string; error_code: string | null; duration_ms: number;
};
type ReviewCase = { id: string; status: "open" | "reviewed"; first_seen: string; updated_at: string; category: string; last_observation_id: string; events: Observation[] };

const nextAction: Record<string, string> = {
  conflict: "Сопоставить указанные страницы и условия применимости. При необходимости уточнить процедуру у автора вопроса и обновить индекс источников.",
  no_evidence: "Проверить, есть ли нужная процедура в загруженном руководстве. Уточнить двигатель, узел или условия вопроса, если данных недостаточно.",
  error: "Проверить этап и код ошибки в карточке ниже, затем повторить запрос после восстановления соответствующего маршрута.",
};

export default function AdminQaReview({ api }: { api: Api }) {
  const [cases, setCases] = useState<ReviewCase[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  async function load() {
    setLoading(true);
    try { setCases((await api<{ cases: ReviewCase[] }>("/api/admin/qa-review")).cases); setError(""); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Не удалось загрузить обращения"); }
    finally { setLoading(false); }
  }
  useEffect(() => { void load(); }, []);
  async function markReviewed(id: string) {
    try {
      await api(`/api/admin/qa-review/${encodeURIComponent(id)}/review`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
      await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Не удалось отметить обращение"); }
  }
  return <section className="admin-users" aria-labelledby="qa-review-heading">
    <header><div><h2 id="qa-review-heading">Проверка ответов</h2><p>Внутренний список вопросов без подтверждённого ответа, конфликтов источников и ошибок обработки.</p></div></header>
    {error && <p className="auth-error" role="alert">{error}</p>}
    {loading ? <p className="muted" role="status">Загружаем обращения…</p> : cases.length === 0 ? <p className="muted">Открытых и проверенных обращений пока нет.</p> : <div className="admin-user-list">{cases.map((item) => {
      const last = item.events.find(event => event.id === item.last_observation_id);
      if (!last) return null;
      return <article className="admin-user" key={item.id}>
        <div className="admin-user-heading"><strong>{item.category === "conflict" ? "Конфликт источников" : item.category === "no_evidence" ? "Недостаточно данных" : "Ошибка обработки"}</strong><span>{item.status === "open" ? "Требует проверки" : "Проверено"}</span><span>{new Date(item.updated_at).toLocaleString()}</span></div>
        <p><strong>Вопрос:</strong> {last.request_text || "(текст не передан)"}</p>
        <p><strong>Машина:</strong> {[last.vehicle_id, last.vehicle_model, last.engine].filter(Boolean).join(" · ") || "не указана"} <strong>Сессия:</strong> {last.session_id || "не указана"}</p>
        <p><strong>Что произошло:</strong> {last.action}; этап {last.surface}; маршрут {last.route_decision || "не выбран"}; инструмент {last.tool || "не выбран"}; исход {last.outcome}{last.error_code ? ` (${last.error_code})` : ""}; {last.duration_ms} мс.</p>
        {last.source_refs.length > 0 && <p><strong>Источники:</strong> {last.source_refs.map((source, index) => <span key={`${source.manual}-${source.page}`}>{index > 0 ? ", " : ""}{source.manual}, стр. {source.page}</span>)}</p>}
        <p><strong>Следующий шаг:</strong> {nextAction[item.category] || nextAction.error}</p>
        {item.events.length > 1 && <details><summary>Хронология ({item.events.length})</summary><ol>{item.events.map((event) => <li key={event.id}>{new Date(event.created_at).toLocaleString()} · {event.surface}: {event.action} → {event.outcome}{event.error_code ? ` (${event.error_code})` : ""}, {event.duration_ms} мс</li>)}</ol></details>}
        {item.status === "open" && <button className="button secondary" onClick={() => void markReviewed(item.id)}>Отметить проверенным</button>}
      </article>;
    })}</div>}
    {!loading && <button className="button secondary" onClick={() => void load()}>Обновить список</button>}
  </section>;
}
