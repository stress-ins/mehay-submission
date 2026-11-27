import { useEffect, useRef, useState } from "react";
import { AlertTriangle, BookOpen, ExternalLink, Search } from "lucide-react";

type Manual = { id: string; title: string; pageCount: number; engineKeys: string[] };
type SearchResult = { manual: Pick<Manual, "id" | "title">; pdfPage: number; text: string; url: string };
type Props = {
  api: <T>(path: string, init?: RequestInit) => Promise<T>;
  appPath: (url: string) => string;
  engines: readonly { value: string }[];
};

export default function KnowledgeLibrary({ api, appPath, engines }: Props) {
  const [manuals, setManuals] = useState<Manual[] | null>(null);
  const [engine, setEngine] = useState("");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[] | null>(null);
  const [answer, setAnswer] = useState("");
  const [assessment, setAssessment] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const request = useRef(0);
  useEffect(() => {
    let active = true;
    api<{ manuals: Manual[] }>("/api/manuals").then(data => { if (active) setManuals(data.manuals); })
      .catch(() => { if (active) setError("Не удалось загрузить список руководств."); });
    return () => { active = false; request.current++; };
  }, [api]);
  function reset() {
    request.current++;
    setResults(null); setAnswer(""); setBusy(false);
  }
  const filtered = manuals?.filter(book => !engine || book.engineKeys.includes(engine.toLowerCase()));
  async function search() {
    if (!query.trim() || !engine || busy) return;
    const run = ++request.current;
    setBusy(true); setError(""); setResults(null); setAnswer("");
    try {
      const data = await api<{ results: SearchResult[]; answer?: string; manualAssessment?: string }>("/api/manuals/search", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ engineModel: engine, query: query.trim(), answer: true })
      });
      if (run === request.current) { setResults(data.results); setAnswer(data.answer || ""); setAssessment(data.manualAssessment || ""); }
    } catch { if (run === request.current) setError("Поиск недоступен. Повторите запрос или откройте руководство ниже."); }
    finally { if (run === request.current) setBusy(false); }
  }
  return <>
    <header className="page-heading"><div><h1>База знаний</h1><p>Заводские руководства по двигателям парка</p></div></header>
    <section className="panel full-panel workshop-library">
      <form onSubmit={event => { event.preventDefault(); void search(); }}>
        <label>Двигатель<select aria-label="Двигатель" value={engine} onChange={e => { reset(); setEngine(e.target.value); }}>
          <option value="">Все руководства</option>{engines.map(item => <option key={item.value}>{item.value}</option>)}
        </select></label>
        <label>Вопрос по руководству<input value={query} maxLength={2000} onChange={e => { reset(); setQuery(e.target.value); }} placeholder="Например, как проверить зазор клапанов?" /></label>
        <button type="submit" disabled={!engine || !query.trim() || busy}><Search size={18}/>{busy ? "Ищем…" : "Найти страницы"}</button>
      </form>
      {!engine && <small>Для поиска по страницам выберите двигатель.</small>}
      {error && <p role="alert">{error}</p>}
      {answer && <div className="library-answer" role="status">
        {assessment === "conflict" && <strong><AlertTriangle size={18} aria-hidden="true"/> Требуется сверка руководств</strong>}
        <p>{assessment === "conflict" ? answer : assessment ? answer.split("\n\n")[0] : answer}</p>
      </div>}
      {results && <section aria-label="Результаты поиска"><h2>Найденные страницы · {results.length}</h2>{!results.length && <p>Подтверждения в руководствах не найдено. Проверьте модификацию двигателя и укажите узел или название операции из руководства изготовителя.</p>}
        {results.map(r => <details key={r.url}><summary>{r.manual.title} · стр. {r.pdfPage}</summary><p>{r.text}</p><a href={appPath(r.url)} target="_blank" rel="noreferrer">Открыть страницу PDF</a></details>)}</section>}
      <h2>Руководства{filtered && ' · ' + filtered.length}</h2>
      {manuals === null && !error && <p role="status">Загружаем перечень…</p>}
      {filtered?.length === 0 && <p>Подключённых руководств для этого выбора пока нет.</p>}
      <div className="manual-shelf">{filtered?.map(book => <a key={book.id} href={appPath('/api/manuals/' + encodeURIComponent(book.id) + '.pdf')} target="_blank" rel="noreferrer"><BookOpen size={23}/><span><strong>{book.title}</strong><small>{engines.filter(e => book.engineKeys.includes(e.value.toLowerCase())).map(e => e.value).join(' · ')} · PDF · {book.pageCount} стр.</small></span><ExternalLink size={16}/></a>)}</div>
    </section>
  </>;
}
