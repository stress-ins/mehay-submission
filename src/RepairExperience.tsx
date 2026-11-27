import { useState } from "react";
import { ChevronDown, ChevronUp, Clock3, Search, Wrench } from "lucide-react";
import { repairExample } from "./repairExample";
import "./RepairExperience.css";
import { useSystemLanguage } from "./systemLanguage";
import { translateInterfaceText, translateSystemText } from "./systemTranslations";

type RepairCase = {
  id: string;
  vehicleId: string;
  model: string;
  engineModel: string;
  completedAt: string;
  plannedHours: number;
  actualHours: number;
  waitingHours: number;
  cause: string;
  part: string;
  match: "vehicle" | "engine" | "similar";
  synthetic: boolean;
};
export type RepairExperienceData = {
  engineModel: string;
  faultCode: string;
  cases: RepairCase[];
  summary: string;
};
const matchLabel = (match: RepairCase["match"], locale: ReturnType<typeof useSystemLanguage>) => translateSystemText(({
  vehicle: "Эта машина",
  engine: "Тот же двигатель",
  similar: "Похожая машина",
})[match], locale);
const dateLabel = (value: string) => new Date(value).toLocaleDateString("ru-RU", { day: "numeric", month: "long", year: "numeric" });

export function RepairInsight({ item }: { item: RepairCase }) {
  const locale = useSystemLanguage();
  return <aside className="repair-insight" aria-label="Подсказка из истории ремонта">
    <strong>{item.model} · {item.vehicleId} · {matchLabel(item.match, locale)}</strong>
    <p>{item.cause || "Причина в заказ-наряде не указана."}</p>
    <p>Трудозатраты по записи: план {item.plannedHours} ч, факт {item.actualHours} ч. Ожидание отдельно: {item.waitingHours} ч.</p>
    {item.part && <p>В прошлой работе указана деталь «{item.part}». {item.match === "similar" ? "Двигатель другой. Применимость нужно установить отдельно." : "До начала работ сверьте её с комплектацией этой машины."}</p>}
    <small>{dateLabel(item.completedAt)}{item.synthetic ? " · Демонстрационная история" : ""} · Для планирования работ</small>
  </aside>;
}

export default function RepairExperience({ data, engineModel, error, onSelectPart, onComparePart, selectedHistoricalPart, selectionLocked }: {
  data: RepairExperienceData | null;
  engineModel: string;
  error: string;
  onSelectPart: (part: string) => void;
  onComparePart: (part: string) => void;
  selectedHistoricalPart: string;
  selectionLocked: boolean;
}) {
  const locale = useSystemLanguage();
  const [expanded, setExpanded] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [matchFilter, setMatchFilter] = useState<RepairCase["match"] | "all">("all");
  const [showAll, setShowAll] = useState(false);
  const cases = data?.cases || [];
  const filteredCases = cases.filter((item) => (matchFilter === "all" || item.match === matchFilter) && `${item.vehicleId} ${item.model} ${item.engineModel} ${item.cause} ${item.part}`.toLocaleLowerCase("ru-RU").includes(search.trim().toLocaleLowerCase("ru-RU")));
  const visibleCases = showAll ? filteredCases : filteredCases.slice(0, 3);
  const maxHours = Math.max(1, ...filteredCases.flatMap((item) => [item.plannedHours, item.actualHours]));
  const example = repairExample(filteredCases, { includeSimilar: true });
  return <section className="repair-experience" id="repair-experience" tabIndex={-1}>
    <header className="repair-experience__heading"><div><div className="repair-experience__eyebrow">ИСТОРИЯ РЕМОНТОВ ПО ПОХОЖИМ СЛУЧАЯМ</div><h2>Опыт ремонтов</h2><p>Данные для ориентира механика, не норматив из PDF.</p></div><Wrench size={19} aria-hidden="true" /></header>
    <div className="repair-experience__engine"><span>Двигатель этой машины</span><strong>{data?.engineModel || engineModel || "Не указан"}</strong>{data?.faultCode && <span className="repair-experience__fault">Случай {data.faultCode}</span>}</div>
    {!data && !error ? <p className="repair-experience__state" role="status">Загружаем историю ремонтов…</p>
      : error ? <p className="repair-experience__state repair-experience__state--error" role="alert">{error}</p>
        : !cases.length ? <p className="repair-experience__state">Для этого диагноза пока нет сопоставимых записей о ремонте.</p>
          : <>
            <div className="repair-experience__legend" aria-label="Тип записи"><span><i className="repair-experience__key repair-experience__key--vehicle" /> Эта машина</span><span><i className="repair-experience__key repair-experience__key--engine" /> Тот же двигатель</span><span><i className="repair-experience__key repair-experience__key--similar" /> Похожая машина</span></div>
            <label className="repair-experience__search"><Search size={17} aria-hidden="true" /><span className="repair-experience__sr-only">Поиск по машине, причине или детали</span><input type="search" value={search} onChange={(event) => { setSearch(event.target.value); setShowAll(false); setExpanded(null); }} placeholder="Поиск по машине, причине или детали" /></label>
            <div className="repair-experience__filters" role="group" aria-label="Фильтр сопоставимых случаев">{([["all", "Все случаи"], ["vehicle", "Эта машина"], ["engine", "Тот же двигатель"], ["similar", "Похожие машины"]] as const).map(([value, label]) => <button type="button" key={value} className={matchFilter === value ? "is-active" : ""} aria-pressed={matchFilter === value} onClick={() => { setMatchFilter(value); setExpanded(null); setShowAll(false); }}>{translateSystemText(label, locale)}</button>)}</div>
            <p className="repair-experience__count" aria-live="polite">Найдено случаев: {filteredCases.length} из {cases.length} · На экране: {visibleCases.length}</p>
            {example && <RepairInsight item={example} />}
            <div className="repair-experience__list">
              {visibleCases.map((item) => <article className={`repair-case repair-case--${item.match}`} key={item.id}>
                <button className="repair-case__toggle" type="button" aria-expanded={expanded === item.id} onClick={() => setExpanded((current) => current === item.id ? null : item.id)}>
                  <span className="repair-case__identity"><strong>{item.vehicleId}</strong><span>{item.model} · {item.engineModel}</span><small>{matchLabel(item.match, locale)} · {dateLabel(item.completedAt)}{item.synthetic ? " · Синтетические данные" : ""}</small></span>
                  <span className="repair-case__hours"><span>Трудозатраты</span><span className="repair-case__bar-row"><b>План</b><span className="repair-case__bar" role="img" aria-label={`План ${item.plannedHours} часов`}><span className="repair-case__bar-fill repair-case__bar-fill--plan" style={{ width: `${Math.min(100, item.plannedHours / maxHours * 100)}%` }} /></span><strong>{item.plannedHours} ч</strong></span><span className="repair-case__bar-row"><b>Факт</b><span className="repair-case__bar" role="img" aria-label={`Факт ${item.actualHours} часов`}><span className="repair-case__bar-fill repair-case__bar-fill--actual" style={{ width: `${Math.min(100, item.actualHours / maxHours * 100)}%` }} /></span><strong>{item.actualHours} ч</strong></span><small className="repair-case__variance">Разница: {item.actualHours - item.plannedHours > 0 ? "+" : ""}{item.actualHours - item.plannedHours} ч</small></span>
                  <span className="repair-case__waiting"><Clock3 size={14} /><span>Простой<b>{item.waitingHours} ч</b></span></span>
                  {expanded === item.id ? <ChevronUp size={17} /> : <ChevronDown size={17} />}
                </button>
                {expanded === item.id && <div className="repair-case__details"><p><b>Причина</b>{item.cause || "В записи не указана"}</p><p><b>Деталь</b>{item.part || "В записи не указана"}</p>{item.part && <div className="repair-case__part-choice">{item.match !== "similar" && <button type="button" disabled={selectionLocked} aria-pressed={selectedHistoricalPart === item.part} onClick={() => { if (selectedHistoricalPart === item.part) onSelectPart(""); else if (window.confirm(translateInterfaceText("Добавить «{0}» в заявку? Историческая запись не подтверждает совместимость с этой машиной.", locale, [item.part]))) onSelectPart(item.part); }}>{selectedHistoricalPart === item.part ? "Убрать из заявки" : "Учесть в заявке"}</button>}<button type="button" disabled={selectionLocked} onClick={() => onComparePart(item.part)}>Сравнить предложения</button><small>Кандидат из истории; применимость к этой машине не проверена.</small></div>}{item.synthetic && <p className="repair-case__notice">Синтетическая запись для демонстрации. Не использовать как норматив.</p>}</div>}
              </article>)}
              {!filteredCases.length && <p className="repair-experience__state">Совпадений нет. Измените запрос или фильтр.</p>}
            </div>
            {filteredCases.length > 3 && <button type="button" className="repair-experience__more" aria-expanded={showAll} onClick={() => { setShowAll((current) => !current); setExpanded(null); }}>{showAll ? "Свернуть список" : `Показать ещё ${filteredCases.length - 3} из ${filteredCases.length}`}</button>}
            <p className="repair-experience__note">Плановые и фактические трудозатраты, а также простой показываются раздельно. План не является нормативом руководства.</p>
          </>}
  </section>;
}
