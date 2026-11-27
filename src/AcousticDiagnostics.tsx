import { getSystemLanguage } from "./systemLanguage";
import { translateInterfaceText } from "./systemTranslations";
import { useEffect, useMemo, useRef, useState } from "react";
import { PButton, PSpinner } from "./BootstrapUI";

type Api = <T>(url: string, init?: RequestInit) => Promise<T>;
type Vehicle = { id: string; name: string; engine: string };
type Check = { id: string; occurredAt: string; code: string; symptoms: string };
type Detail = Vehicle & { checks: Check[] };
const matchesQuery = (vehicle: Vehicle, query: string) => `${vehicle.name} ${vehicle.engine} ${vehicle.id}`.toLowerCase().includes(query.trim().toLowerCase());
type Answer = { status: "supported" | "insufficient"; sources: { title: string; page: number; text: string }[]; recommendation: string };

function value(event: { target: { value: string } }): string {
  return event.target.value;
}

export default function AcousticDiagnostics({ api }: { api: Api }) {
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [vehicleId, setVehicleId] = useState("");
  const [detail, setDetail] = useState<Detail | null>(null);
  const [checkId, setCheckId] = useState("");
  const [query, setQuery] = useState("");
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState<Answer | null>(null);
  const [observation, setObservation] = useState("");
  const [works, setWorks] = useState("");
  const [parts, setParts] = useState("");
  const [ticket, setTicket] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [vehiclesState, setVehiclesState] = useState<"loading" | "error" | "empty" | "ready">("loading");
  const [fleetAttempt, setFleetAttempt] = useState(0);
  const answerRead = useRef<AbortController | null>(null);
  const vehicleRead = useRef<AbortController | null>(null);
  const keyRef = useRef<{ payload: string; key: string } | null>(null);
  const selectedCheck = detail?.checks.find((check) => check.id === checkId) ?? null;
  const shownVehicles = useMemo(() => vehicles.filter((v) => matchesQuery(v, query)), [vehicles, query]);

  useEffect(() => {
    const controller = new AbortController();
    setVehiclesState("loading");
    api<{ vehicles: Vehicle[] }>("/api/acoustic/vehicles", { signal: controller.signal }).then(({ vehicles: rows }) => {
      if (controller.signal.aborted) return;
      setVehicles(rows);
      setVehicleId(rows[0]?.id ?? "");
      setVehiclesState(rows.length ? "ready" : "empty");
    }).catch((error: unknown) => {
      if (controller.signal.aborted || (error instanceof DOMException && error.name === "AbortError")) return;
      setVehiclesState("error");
    });
    return () => controller.abort();
  }, [api, fleetAttempt]);

  useEffect(() => {
    answerRead.current?.abort();
    setAnswer(null); setCheckId(""); setQuestion("");
    resetDraft();
    if (!vehicleId) { setDetail(null); return; }
    const controller = new AbortController(); vehicleRead.current?.abort(); vehicleRead.current = controller;
    setDetail(null); setError("");
    api<Detail>(`/api/acoustic/vehicles/${encodeURIComponent(vehicleId)}`, { signal: controller.signal }).then((row) => {
      if (!controller.signal.aborted) { setDetail(row); setCheckId(row.checks[0]?.id ?? ""); }
    }).catch((e: unknown) => { if (!(e instanceof DOMException && e.name === "AbortError")) setError("Не удалось загрузить историю проверок."); });
    return () => { controller.abort(); answerRead.current?.abort(); };
  }, [api, vehicleId]);

  function searchVehicles(event: { target: { value: string } }) {
    const nextQuery = value(event);
    setQuery(nextQuery);
    if (!vehicles.some((v) => v.id === vehicleId && matchesQuery(v, nextQuery))) setVehicleId("");
  }

  function resetAnswer() {
    answerRead.current?.abort();
    setAnswer(null);
  }

  function resetDraft() {
    setObservation("");
    setWorks("");
    setParts("");
    setTicket("");
    keyRef.current = null;
  }
  async function ask() {
    if (!selectedCheck || !detail) return;
    const targetVehicle = detail.id, targetCheck = selectedCheck.id;
    const controller = new AbortController(); answerRead.current?.abort(); answerRead.current = controller;
    setBusy(true); setError(""); setAnswer(null);
    try {
      const result = await api<Answer>(`/api/acoustic/vehicles/${encodeURIComponent(targetVehicle)}/checks/${encodeURIComponent(targetCheck)}/answer`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ question }), signal: controller.signal });
      if (!controller.signal.aborted && vehicleId === targetVehicle && checkId === targetCheck) setAnswer(result);
    } catch (e) { if (!(e instanceof DOMException && e.name === "AbortError")) setError("Не удалось получить ответ по руководству."); }
    finally { if (answerRead.current === controller) setBusy(false); }
  }
  async function submit() {
    if (!selectedCheck || !detail) return;
    const targetVehicle = detail.id, targetCheck = selectedCheck.id;
    const payload = JSON.stringify({ observation, works, parts });
    if (keyRef.current?.payload !== payload) keyRef.current = { payload, key: crypto.randomUUID() };
    setBusy(true); setError(""); setTicket("");
    try {
      const result = await api<{ number: string }>(`/api/acoustic/vehicles/${encodeURIComponent(targetVehicle)}/checks/${encodeURIComponent(targetCheck)}/requests`, { method: "POST", headers: { "Content-Type": "application/json", "Idempotency-Key": keyRef.current.key }, body: payload });
      if (vehicleId === targetVehicle && checkId === targetCheck) setTicket(String(result.number));
    } catch { setError("Не удалось отправить заявку. Повтор отправки без изменения данных сохранит тот же ключ."); }
    finally { setBusy(false); }
  }

  return <div className="acoustic-diagnostics">
    <section className="page-heading"><div><div className="eyebrow">ИЗМЕРЕНИЯ · РУКОВОДСТВА · ЗАЯВКА</div><h1>Акустическая диагностика</h1><p>Демонстрационный режим · данные проверок синтетические</p></div></section>
    {error && <div className="alert alert-danger" role="alert">{translateInterfaceText(error, getSystemLanguage())}</div>}
    {vehiclesState === "loading" && <div role="status"><PSpinner size="sm" aria={{ "aria-label": translateInterfaceText("Загружаем автомобили", getSystemLanguage()) }} /> Загрузка автомобилей…</div>}
    {vehiclesState === "error" && <div><div className="alert alert-danger" role="alert">Не удалось загрузить парк автомобилей.</div><PButton type="button" variant="secondary" onClick={() => setFleetAttempt((attempt) => attempt + 1)}>Повторить загрузку автомобилей</PButton></div>}
    {vehiclesState === "empty" && <p>В парке пока нет автомобилей.</p>}
    {vehiclesState === "ready" && <>
    <label className="form-label d-block">Поиск автомобиля<input className="form-control" name="acoustic-search" disabled={busy} value={query} onChange={searchVehicles} /></label>
    {shownVehicles.length === 0 ? <p>Автомобили не найдены.</p> : <label className="form-label d-block">Автомобиль<select className="form-select" name="acoustic-vehicle" disabled={busy} value={shownVehicles.some((v) => v.id === vehicleId) ? vehicleId : ""} onChange={(e) => setVehicleId(value(e))}>
      {!shownVehicles.some((v) => v.id === vehicleId) && <option value="">Выберите автомобиль</option>}
      {shownVehicles.map((v) => <option key={v.id} value={v.id}>{v.name} · {v.engine} · {v.id}</option>)}
    </select></label>}
    </>}
    {detail && detail.id === vehicleId && <>
      <section className="panel full-panel mt-3"><p>Двигатель: <strong>{detail.engine}</strong></p><h2>История проверок</h2>
      <label className="form-label d-block">Проверка<select className="form-select" name="acoustic-check" disabled={busy} value={checkId} onChange={(e) => { setCheckId(value(e)); resetAnswer(); resetDraft(); }}>
        {detail.checks.map((c) => <option key={c.id} value={c.id}>{new Date(c.occurredAt).toLocaleString()} · {c.code}</option>)}
      </select></label>
      {selectedCheck && <><p>{selectedCheck.symptoms}</p>
        <label className="form-label d-block">Вопрос по признакам и руководству<input className="form-control" name="acoustic-question" maxLength={1000} value={question} onChange={(e) => { setQuestion(e.target.value); resetAnswer(); }} /></label>
        <PButton type="button" disabled={busy || !question.trim()} onClick={ask}>Найти в руководстве</PButton>
        {answer && detail.id === vehicleId && selectedCheck.id === checkId && <div aria-live="polite" className="mt-3"><h3>{answer.status === "supported" ? "Фрагменты по вопросу" : "Подтверждение не найдено"}</h3><p>{answer.recommendation}</p>{answer.sources.map((s, i) => <article className="panel mt-2" key={`${s.title}-${s.page}-${i}`}><strong>{s.title} · стр. {s.page}</strong><p>{s.text}</p></article>)}</div>}
        <h3 className="mt-4">Заявка в сервис</h3><p>Уточните работы и запчасти по руководству перед отправкой.</p>
        <label className="form-label d-block">Наблюдение<textarea className="form-control" name="acoustic-observation" disabled={busy} maxLength={2000} rows={3} value={observation} onChange={(e) => setObservation(e.target.value)} /></label>
        <label className="form-label d-block">Требуемые работы<textarea className="form-control" name="acoustic-works" disabled={busy} maxLength={2000} rows={3} value={works} onChange={(e) => setWorks(e.target.value)} /></label>
        <label className="form-label d-block">Запчасти<textarea className="form-control" name="acoustic-parts" disabled={busy} maxLength={2000} rows={3} value={parts} onChange={(e) => setParts(e.target.value)} /></label>
        <PButton type="button" disabled={busy || !observation.trim()} onClick={submit}>Отправить заявку</PButton>
        {ticket && <div className="alert alert-success mt-3" role="status">Номер заявки сервиса: {ticket}</div>}
      </>}
      </section>
    </>}
  </div>;
}
