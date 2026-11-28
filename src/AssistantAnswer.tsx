import { citedRecordForMarker, type AssistantEvidence, type EvidenceRecord, type RecordTarget } from "./evidence";
import { Battery, BookOpenText, CircleHelp, ClipboardCheck, Factory, Globe2, MessageCircle, Wrench } from "lucide-react";
import "./ChatExperience.css";
import { useSystemLanguage } from "./systemLanguage";
import { translateSystemText } from "./systemTranslations";

type Source = { title: string; url: string; type: string; origin?: string; verification?: string; manual?: string; pdfPage?: number; description?: string };
const kindLabel = { history: "Работа", request: "Заявка", diagnostic: "Диагностика", note: "Заметка" };
const timestamp = (value: string) => Number.isNaN(Date.parse(value)) ? "Дата не указана" : new Date(value).toLocaleString("ru-RU");

export function AnswerText({ text, evidence, recordLink }: {
  text: string;
  evidence?: AssistantEvidence;
  recordLink?: (record: EvidenceRecord, label: string) => React.ReactNode;
}) {
  return text.split(/\n{2,}/).map((block, blockIndex) => {
    const lines = block.split("\n");
    const formattedHeading = lines[0].match(/^\s*#{1,3}\s+(.+?)\s*$/)?.[1]
      || lines[0].match(/^\s*\*\*([^*]+)\*\*\s*$/)?.[1];
    const heading = formattedHeading || (lines.length > 1 && /^.{1,90}:$/.test(lines[0]) ? lines[0].slice(0, -1) : "");
    const label = heading;
    const Icon = /провер|действ|шаг/i.test(label) ? Wrench : /важно|вниман|не дел/i.test(label) ? CircleHelp : /данн|значен|напряж/i.test(label) ? Battery : /итог|вывод|результ/i.test(label) ? ClipboardCheck : BookOpenText;
    const content = heading ? lines.slice(1).join("\n") : block;
    const highlight = (line: string) => line.split(/(\[[^\]]+\]\(https?:\/\/[^\s)]+\)|\*\*[^*]+\*\*|https?:\/\/[^\s<>]+|\[R\d+\]|(?<![\p{L}\d])\d+(?:[.,]\d+)?\s*(?:вольт|ампер|об\/мин|Н·м|°[CС]|кПа|бар|км|мм|В|V|А)(?![\p{L}\d]))/giu).map((part, index) => {
        const markdownLink = part.match(/^\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)$/i);
        if (markdownLink) {
          try { const url = new URL(markdownLink[2]); if (["http:", "https:"].includes(url.protocol) && !url.username && !url.password) return <a key={index} href={url.href} target="_blank" rel="noopener noreferrer">{markdownLink[1]}</a>; } catch { /* render unsafe or malformed link as text */ }
        }
        if (/^https?:\/\//i.test(part)) {
          const cleanUrl = part.replace(/[.,!?;:)]+$/g, "");
          try { const url = new URL(cleanUrl); if (["http:", "https:"].includes(url.protocol) && !url.username && !url.password) return <span key={index}><a href={url.href} target="_blank" rel="noopener noreferrer">{cleanUrl}</a>{part.slice(cleanUrl.length)}</span>; } catch { /* render malformed URL as text */ }
        }
        if (part.startsWith("**") && part.endsWith("**")) return <strong key={index}>{part.slice(2, -2)}</strong>;
        const record = citedRecordForMarker(part, evidence);
        return record && recordLink ? <span key={index}>{recordLink(record, part)}</span> : index % 2 === 1 && !/^\[R\d+\]$/.test(part) ? <strong className="answer-value" key={index}>{part}</strong> : <span key={index}>{part}</span>;
    });
    const contentLines = content.trim().split("\n");
    const bullets = contentLines.every((line) => /^[-•]\s+/.test(line));
    const numbered = contentLines.every((line) => /^\d+[.)]\s+/.test(line));
    return <section className="answer-section" key={blockIndex}>
      {heading && <h3><Icon size={17} aria-hidden="true" />{heading.replace(/\*\*/g, "")}</h3>}
      {bullets ? <ul>{contentLines.map((line, index) => <li key={index}>{highlight(line.replace(/^[-•]\s+/, ""))}</li>)}</ul> : numbered ? <ol>{contentLines.map((line, index) => <li key={index}>{highlight(line.replace(/^\d+[.)]\s+/, ""))}</li>)}</ol> : content && <p>{contentLines.map((line, index) => <span key={index}>{index > 0 && <br />}{highlight(line)}</span>)}</p>}
      {/(?:\d\s*(?:В|V)(?!\p{L})|вольт|напряжени)/iu.test(content) && <Battery className="answer-voltage-icon" size={17} aria-label="Указано напряжение" />}
    </section>;
  });
}

export default function AssistantAnswer({ answer, evidence, sources, webSearch, webDomain, appPath, onOpen }: {
  answer: string;
  evidence?: AssistantEvidence;
  sources?: Source[];
  webSearch?: boolean;
  webDomain?: string;
  appPath: (path: string) => string;
  onOpen: (target: RecordTarget) => void;
}) {
  const locale = useSystemLanguage();
  const recordLink = (record: EvidenceRecord, label: string) => <a href={appPath(`/app?vehicle=${encodeURIComponent(record.vehicleId)}&record=${record.kind}&id=${encodeURIComponent(record.recordId)}`)} onClick={(event) => {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
    event.preventDefault(); onOpen(record);
  }}>{label}</a>;
  const cited = evidence?.records.filter((record) => evidence.citedRecordIds.includes(record.id)) || [];
  const safeSources = (sources || []).filter((source) => {
    try { const url = new URL(source.url); return ["http:", "https:"].includes(url.protocol) && !url.username && !url.password; } catch { return false; }
  });
  const recordList = (records: EvidenceRecord[]) => records.map((record) => <article className="evidence-record" key={record.id}>
    <span className="badge text-bg-secondary">{translateSystemText(kindLabel[record.kind], locale)} · {record.vehiclePlate}</span>
    <strong>{record.title}</strong><small>{timestamp(record.date)}</small><p>{record.summary}</p>
    {recordLink(record, `Открыть запись [${record.id}]`)}
  </article>);
  return <div className="assistant-answer">
    <div className="assistant-answer-text"><AnswerText text={answer} evidence={evidence} recordLink={recordLink} /></div>
    {evidence && <>
      <small className="evidence-caption">Сверка ссылок: {timestamp(evidence.checkedAt)}. Снимок отражает данные на момент ответа; переход открывает актуальную запись.</small>
      {evidence.unresolvedCitations.length > 0 && <p className="alert alert-warning">Не подтверждены ссылки: {evidence.unresolvedCitations.join(", ")}.</p>}
      {evidence.technicalCards.map((card) => <section className="technical-evidence" key={card.id} aria-label="Технические данные">
        <span className="badge text-bg-warning">Требуется спецификация</span><h3>{card.title}</h3>
        <dl><dt>Значение, {card.unit}</dt><dd>Не подтверждено</dd><dt>Автомобиль и двигатель</dt><dd>{card.appliesTo}</dd></dl>
        <p>{card.reason}</p><strong>Для точного значения нужны</strong><ul>{card.missing.map((item) => <li key={item}>{item}</li>)}</ul>
      </section>)}
      <details><summary>По данным машины · {cited.length} ссылок в ответе</summary><div className="evidence-records">{cited.length ? recordList(cited) : <p>Помощник не указал ссылки на записи в этом ответе.</p>}<p>Ссылка подтверждает происхождение данных. Вывод помощника требует проверки.</p></div></details>
      <details><summary>Контекст ответа · {evidence.records.length} записей</summary><div className="evidence-records">{evidence.truncated && <p className="alert alert-info">Использована часть последних записей. Полная история доступна в карточке машины.</p>}{recordList(evidence.records)}</div></details>
    </>}
    {(webSearch || safeSources.length > 0) && <section className="evidence-sources" aria-label="Внешние источники"><h3>Источники</h3>{safeSources.length ? <><p>Сверьте раздел, двигатель и модификацию перед применением.</p>
      {safeSources.map((source) => { const url = new URL(source.url);
        const community = source.origin === "community" || (!source.origin && source.type === "community");
        const manufacturer = source.origin === "manufacturer";
        const Icon = community ? MessageCircle : manufacturer ? Factory : Globe2;
        const evidence = source.description?.replace(/^Provider-supplied citation snippet \(not independently verified; not necessarily a direct quote\):\s*/i, "").trim();
        return <a className="evidence-source-card" href={url.href} key={url.href} target="_blank" rel="noopener noreferrer">
          <span className="evidence-source-icon" aria-hidden="true"><Icon size={20} /></span>
          <span className="evidence-source-copy"><strong>{source.title || url.hostname}</strong><small>{manufacturer ? "Источник производителя · OEM" : community ? (url.pathname !== "/" ? `Форум · ${url.hostname}${url.pathname}` : `Сообщество · ${url.hostname}`) : `Технический источник · ${url.hostname}`}</small>{evidence && <span className="evidence-source-excerpt">{evidence.slice(0, 300)}{evidence.length > 300 ? "…" : ""}</span>}<small>{source.verification === "search_result" ? "Фрагмент результата поиска; применимость требует проверки" : "Источник не проверен"}</small></span>
          <span className="evidence-source-open" aria-hidden="true">↗</span>
        </a>;
      })}</> : <p className="evidence-sources-empty">{webDomain ? `В выбранной области (${webDomain}) подходящих открытых источников не найдено.` : "Подходящих открытых источников не найдено."} Попробуйте другой домен или общий поиск.</p>}
    </section>}
  </div>;
}
