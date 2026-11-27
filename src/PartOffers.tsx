import { useEffect, useRef, useState } from "react";
import { MapPin, PackageCheck, Search, Truck } from "lucide-react";
import { categoryPhotoForPart } from "./partCategoryPhotos";
import "./PartOffers.css";
import { useSystemLanguage } from "./systemLanguage";
import { translateSystemText } from "./systemTranslations";

type OfferResult = {
  vehicleId: string;
  partName: string;
  fit: { status: string; reason: string };
  sources: { title: string; url: string; snippet: string; price: number | null; currency: string | null; priceBasis: string }[];
  demoQuotes: { supplier: string; label: string; price: number; currency: string; deliveryDays: number; distanceKm: number; totalPrice: number; estimated: boolean }[];
  recommendation: { price: number | null; currency: string | null; basis: string; sourceUrl?: string };
  analogsMinimum?: { price: number | null; currency: string | null; sourceUrl?: string; basis: string };
  history: { orders: number; defects: number; rework: number; realRequests?: number; serviceEvents?: number; source: string; scope: string; note?: string };
  estimate: { basis: string };
  parks: { id: string; label: string }[];
};
const parks = [
  { id: "moscow", label: "Москва · демо-парк" },
  { id: "kazan", label: "Казань · демо-парк" },
  { id: "ekaterinburg", label: "Екатеринбург · демо-парк" },
];
const parkStorageKey = "mehay-parts-offers-park";
const money = (value: number | null, currency: string | null) => value == null ? "Цена не указана" : new Intl.NumberFormat("ru-RU", { style: "currency", currency: currency || "RUB", maximumFractionDigits: 0 }).format(value);

export default function PartOffers({ vehicleId, vehicleName, partName, quantity, onProcure }: { vehicleId: string; vehicleName: string; partName: string; quantity: number; onProcure: () => void }) {
  const locale = useSystemLanguage();
  const translate = (text: string) => translateSystemText(text, locale);
  const displayMoney = (value: number | null, currency: string | null) => translate(money(value, currency));
  const [parkId, setParkId] = useState(() => { try { return window.localStorage.getItem(parkStorageKey) || "moscow"; } catch { return "moscow"; } });
  const [result, setResult] = useState<OfferResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const requestId = useRef(0);
  const categoryPhoto = categoryPhotoForPart(partName);
  const categoryPhotoSrc = categoryPhoto ? `${import.meta.env.BASE_URL.replace(/\/$/, "")}${categoryPhoto.src}` : "";
  useEffect(() => { try { window.localStorage.setItem(parkStorageKey, parkId); } catch { /* Storage is optional. */ } }, [parkId]);
  async function compare() {
    const id = ++requestId.current;
    const requestedPark = parkId;
    setLoading(true); setError(""); setResult(null);
    try {
      const apiPath = `${import.meta.env.BASE_URL.replace(/\/$/, "")}/api/parts/compare`;
      const response = await fetch(apiPath, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ vehicleId, partName, quantity, parkId: requestedPark }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Не удалось сравнить предложения.");
      if (id !== requestId.current || requestedPark !== parkId) return;
      if (body.parks?.length && !body.parks.some((park: { id: string }) => park.id === requestedPark)) { setParkId(body.parks[0].id); return; }
      setResult(body as OfferResult);
    } catch (cause) { if (id === requestId.current && requestedPark === parkId) setError(cause instanceof Error ? cause.message : "Не удалось сравнить предложения."); }
    finally { if (id === requestId.current) setLoading(false); }
  }
  useEffect(() => {
    void compare();
    return () => { requestId.current += 1; };
  }, [parkId, vehicleId, partName, quantity]);
  return <section className="part-offers" aria-label={`Предложения по детали ${partName}`}>
    <header className="part-offers__head"><div><span className="eyebrow">СРАВНЕНИЕ ПРЕДЛОЖЕНИЙ</span><h3>{partName}</h3><p>{vehicleName} · применимость детали не подтверждена</p></div><label className="part-offers__park"><MapPin size={16} /><span>Парк</span><select aria-label="Парк для сравнения" value={parkId} onChange={(event) => { requestId.current += 1; setLoading(false); setError(""); setResult(null); setParkId(event.target.value); }}>{(result?.parks?.length ? result.parks : parks).map((park) => <option key={park.id} value={park.id}>{result?.parks?.length ? park.label : translate(park.label)}</option>)}</select></label></header>
    {categoryPhoto && <figure className="part-offers__photo"><img src={categoryPhotoSrc} alt={categoryPhoto.alt} /><figcaption><span>{categoryPhoto.label}</span><span>Фото: <a href={categoryPhoto.sourceUrl} target="_blank" rel="noreferrer">{categoryPhoto.credit}</a> · <a href={categoryPhoto.licenseUrl} target="_blank" rel="noreferrer">{categoryPhoto.license}</a></span></figcaption></figure>}
    <div className="part-offers__actions"><button type="button" onClick={() => void compare()} disabled={loading}>{loading ? "Ищем предложения…" : <><Search size={16} /> Сравнить цены и сроки</>}</button><small>Парк сохраняется на этом устройстве. Демо-база предложений условная.</small></div>
    {error && <p className="part-offers__error" role="alert">{translate(error)}</p>}
    {result && <>
      <div className="part-offers__summary"><div><span>Минимальная цена в публикациях</span><strong>{result.analogsMinimum?.price != null ? displayMoney(result.analogsMinimum.price, result.analogsMinimum.currency) : "Нет подтверждённой цены"}</strong><small>Минимум среди непроверенных аналогов — сверить применимость. {result.analogsMinimum?.basis || result.estimate.basis}{result.analogsMinimum?.sourceUrl && <> · <a href={result.analogsMinimum.sourceUrl} target="_blank" rel="noreferrer">источник</a></>}</small></div><div><span>История по детали</span><strong>{result.history.orders} демо-заказов</strong><small>{result.history.realRequests || 0} внутренних заявок · {result.history.serviceEvents || 0} синтетических ремонтов · {result.history.defects} дефектов · {result.history.rework} возвратов на доработку</small></div></div>
      <div className="part-offers__columns">
        <section className="part-offers__real"><h4>Источники для проверки</h4><p className="part-offers__caption">Реальные публикации; цена показывается только при явном подтверждении в источнике.</p>{result.sources.length ? result.sources.map((source) => <article key={source.url}><div><b>{source.title}</b><strong>{source.priceBasis === "citation_snippet" ? displayMoney(source.price, source.currency) : "Цена не подтверждена"}</strong></div><p>{source.snippet}</p><a href={source.url} target="_blank" rel="noreferrer">Открыть источник ↗</a></article>) : <p className="part-offers__empty">Подходящих публикаций не найдено.</p>}</section>
        <section className="part-offers__demo"><h4><PackageCheck size={16} /> Демо-база поставщиков</h4><p className="part-offers__caption">Синтетическая оценка, не предложение поставщика.</p>{result.demoQuotes.map((quote, index) => <article key={`${quote.supplier}-${index}`}><div><b>{quote.supplier}</b><strong>{displayMoney(quote.totalPrice, quote.currency)}</strong></div><p>{displayMoney(quote.price, quote.currency)} за шт. · {quantity} шт.</p><small><Truck size={14} /> {quote.deliveryDays} дн. · <MapPin size={14} /> {quote.distanceKm} км</small><em>Демо-оценка</em></article>)}</section>
      </div>
      <footer className="part-offers__foot"><span>История: {result.history.source === "synthetic_demo_procurement_events" ? "демо-данные" : result.history.source} · {result.history.scope}</span><button type="button" onClick={onProcure}>Перейти к внутренней заявке</button></footer>
    </>}
  </section>;
}
