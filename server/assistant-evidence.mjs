const limits = { history: 100, request: 50, otherRequest: 30, diagnostic: 30, note: 30 };
const text = (value, max = 500) => typeof value === "string" ? value.slice(0, max) : "";
const dateValue = (item) => Date.parse(item.date || item.completedAt || item.createdAt || item.recordedAt || "") || 0;
const newest = (items, cap, newestFirst = false) => items.map((item, index) => ({ item, index })).sort((a, b) => dateValue(b.item) - dateValue(a.item) || (newestFirst ? a.index - b.index : b.index - a.index)).slice(0, cap).map(({ item }) => item);
const valueText = (value, max = 100) => typeof value === "string" ? value.slice(0, max) : value == null ? "" : String(value);
const listText = (items, titleKey, catalogById) => (items || []).slice(0, 5).map((item) => {
  if (typeof item === "string") return item.slice(0, 60);
  if (!item || typeof item !== "object") return "";
  const title = item[titleKey] || item.name || item.partId && catalogById.get(item.partId)?.name || item.partId || item.sku || item.id || "";
  const count = item.quantity == null ? "" : ` × ${item.quantity}${item.unit ? ` ${item.unit}` : ""}`;
  return `${valueText(title, 60)}${count}`;
}).filter(Boolean).join(", ");
const recordSummary = (kind, item, catalogById, vehicle) => {
  if (kind === "diagnostic") return [item.source && `Источник: ${valueText(item.source, 50)}`, item.recordedAt && `Дата: ${valueText(item.recordedAt, 30)}`, item.odometerKm != null && `Пробег: ${item.odometerKm} км`, item.code && `Код: ${valueText(item.code, 30)}`, (item.dtcs || vehicle.dtcs || []).length && `Коды: ${(item.dtcs || vehicle.dtcs || []).slice(0, 10).map((code) => valueText(code, 30)).join(", ")}`, item.rpm != null && `Обороты: ${item.rpm} об/мин`, item.speed != null && `Скорость: ${item.speed} км/ч`, item.coolantTemp != null && `Охлаждающая жидкость: ${item.coolantTemp} °C`, item.batteryVoltage != null && `Напряжение: ${item.batteryVoltage} В`].filter(Boolean).join("; ");
  const fields = [];
  if (item.status) fields.push(`Статус: ${({ done: "выполнена", open: "открыта", pending: "ожидает", approved: "согласована" })[item.status] || valueText(item.status, 30)}`);
  if (item.result) fields.push(`Результат: ${valueText(item.result, 120)}`);
  if (item.work) fields.push(`Выполнено: ${valueText(item.work, 100)}`);
  if (item.workItems?.length) fields.push(`Работы: ${listText(item.workItems, "title", catalogById)}`);
  if (item.pendingWorkItems?.length) fields.push(`Осталось: ${listText(item.pendingWorkItems, "title", catalogById)}`);
  if (item.parts?.length) fields.push(`Детали: ${listText(item.parts, "name", catalogById)}`);
  if (item.part) fields.push(`Деталь: ${valueText(item.part, 60)}`);
  if (item.finding) fields.push(`Наблюдение: ${valueText(item.finding, 100)}`);
  if (item.odometerKm != null) fields.push(`Пробег: ${item.odometerKm} км`);
  if (item.description) fields.push(`Описание: ${valueText(item.description, 100)}`);
  if (item.text) fields.push(`Заметка: ${valueText(item.text, 120)}`);
  return fields.join("; ");
};

export function buildAssistantEvidence({ vehicle, vehicleRequests = [], otherRequests = [], partsCatalog = [], message = "", truncated: upstreamTruncated = false, now = new Date() }) {
  const catalogById = new Map(partsCatalog.map((part) => [part.id, part]));
  const raw = [];
  let truncated = upstreamTruncated || (vehicle.history || []).length > limits.history || vehicleRequests.length > limits.request || otherRequests.length > limits.otherRequest || (vehicle.telemetry || []).length > limits.diagnostic || (vehicle.notes || []).length > limits.note;
  for (const item of newest(vehicle.history || [], limits.history)) raw.push({ kind: "history", item, vehicle });
  for (const item of newest(vehicleRequests, limits.request, true)) raw.push({ kind: "request", item, vehicle });
  for (const item of newest(otherRequests.filter((entry) => entry.vehicle?.id), limits.otherRequest, true)) raw.push({ kind: "otherRequest", item, vehicle: item.vehicle });
  const telemetry = newest(vehicle.telemetry || [], limits.diagnostic);
  for (const item of telemetry) raw.push({ kind: "diagnostic", item, vehicle });
  if (!telemetry.length && (vehicle.dtcs?.length || vehicle.dtcDetails?.length)) raw.push({ kind: "diagnostic", item: { id: "current", title: "Текущая диагностика", summary: (vehicle.dtcs || []).join(", ") }, vehicle });
  for (const item of newest(vehicle.notes || [], limits.note)) raw.push({ kind: "note", item, vehicle });
  const counts = {}, records = [];
  for (const { kind, item, vehicle: owner } of raw) {
    counts[kind] = (counts[kind] || 0) + 1;
    if (counts[kind] > limits[kind]) { truncated = true; continue; }
    const recordId = String(item.id || (kind === "diagnostic" ? "current" : ""));
    if (!recordId) continue;
    const id = `R${records.length + 1}`;
    const recordKind = kind === "otherRequest" ? "request" : kind;
    const title = text(item.title || item.label || (kind === "diagnostic" ? "Диагностика" : kind === "note" ? "Заметка" : "Работа"), 180);
    const summary = text(item.summary || recordSummary(kind, item, catalogById, vehicle) || item.code || item.type || title, 500);
    const vehicleId = String(owner.id || "");
    if (!vehicleId) continue;
    const href = `/app?vehicle=${encodeURIComponent(vehicleId)}&record=${recordKind}&id=${encodeURIComponent(recordId)}`;
    records.push({ id, kind: recordKind, recordId, vehicleId, vehiclePlate: owner.plate || null, title, date: text(item.date || item.createdAt || item.completedAt || item.recordedAt, 40), summary, href });
  }
  const torqueQuery = isTorqueQuery(message);
  const technicalCards = torqueQuery ? [{ id: "torque", title: "Момент затяжки", status: "needs_verification", value: null, unit: "Н·м", appliesTo: `${vehicle.model || "Автомобиль"}${vehicle.engine ? `, ${vehicle.engine}` : ""}`, missing: ["узел и крепёж", "точная модификация", "подтверждённая сервисная документация"], reason: "Нет утверждённой спецификации с подтверждённой применимостью." }] : [];
  const evidence = { records, citedRecordIds: [], unresolvedCitations: [], technicalCards, checkedAt: now.toISOString(), truncated };
  return { evidence, contextRecords: records.map(({ id, kind, recordId, vehicleId, title, date, summary }) => ({ id, kind, recordId, vehicleId, title, date, summary })) };
}

export function resolveAssistantCitations(answer, records) {
  const valid = new Set(records.map((record) => record.id));
  const markers = [...String(answer).matchAll(/\[(R\d+)\]/g)].map((match) => match[1]);
  const citedRecordIds = [...new Set(markers.filter((id) => valid.has(id)))];
  const unresolvedCitations = [...new Set(markers.filter((id) => !valid.has(id)))];
  return { citedRecordIds, unresolvedCitations };
}

export function classifySearchOrigin(url) {
  const host = new URL(url).hostname.toLowerCase();
  if (/^(?:www\.)?(?:drive2\.ru|reddit\.com|forums?\.[a-z0-9.-]+|community\.[a-z0-9.-]+)$/.test(host)) return "community";
  const officialDomains = ["ford.com", "fordservicecontent.com", "mercedes-benz.com", "volkswagen-vans.co.uk", "gaz.ru", "gazglobal.com", "gazgroup.ru"];
  return officialDomains.some((domain) => host === domain || host.endsWith(`.${domain}`)) ? "manufacturer" : "reference";
}

export function scopedWebSearchQuery(query, domain, model = "") {
  const normalized = String(query || "").trim();
  if (domain === "drive.ru" || domain === "drive2.ru") return `site:${domain} ${normalized}`;
  if (domain === "oem") return `${/уаз|uaz/i.test(model) ? "site:uaz.ru" : "site:gaz.ru"} ${normalized}`;
  return normalized;
}

export function searchCitationMatchesScope(url, domain, model = "") {
  if (!domain) return true;
  let parsed;
  try { parsed = new URL(url); } catch { return false; }
  const host = parsed.hostname.toLowerCase().replace(/^www\./, "");
  const allowed = domain === "oem" ? (/уаз|uaz/i.test(model) ? ["uaz.ru"] : ["gaz.ru"]) : [domain];
  const genericPages = new Set(["/", "/cars", "/cars/", "/popular", "/popular/", "/search", "/search/"]);
  return allowed.includes(host) && !genericPages.has(parsed.pathname.toLowerCase());
}

export function sanitizePriorEvidenceMarkers(history) {
  return history.map(({ role, content }) => ({ role, content: role === "assistant" ? content.replace(/\[R\d+\]/g, "[ссылка из прошлого ответа]") : content }));
}

export function findRecordMarkers(message) {
  return [...new Set([...String(message).matchAll(/\[(R\d+)\]/g)].map((match) => match[1]))];
}

export function isTorqueQuery(message) {
  return /момент.{0,30}затяж|затяж.{0,30}момент|крутящ.{0,25}момент|с каким усилием.{0,30}затян|как.{0,40}затян\w*|сколько.{0,30}(?:затян|градус)|\btorque\b|\btighten\w*|how.{0,40}\btighten\w*/i.test(message || "");
}

export function hasTorqueRecommendation(answer) {
  const text = answer || "";
  return /(?:^|\s|\b)[−-]?\d+(?:[.,]\d+)?\s*(?:н\s*[·⋅*.]?\s*м|нм|nm|n\s*m|lb\s*[·.*-]?\s*ft|lbf\s*[·.*-]?\s*ft|фут[оа]?\s*фунт|кгс\s*[·./*-]?\s*(?:м|см)|kgf\s*[·./*-]?\s*(?:m|cm))/i.test(text) || /(?:момент|torque|затяж\w*|затян\w*|доворот\w*|доверн\w*|tighten\w*|turn\w*|rotate\w*).{0,70}(?:^|\s|\b)[−-]?\d+(?:[.,]\d+)?\s*(?:°|градус(?:а|ов)?|degrees?|deg\b)/i.test(text);
}
