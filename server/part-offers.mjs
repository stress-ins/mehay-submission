const shops = new Set(["autodoc.ru", "exist.ru", "emex.ru", "zzap.ru", "rossko.ru", "avto.pro", "detali.ru", "partarium.ru", "speckomzapchast.ru", "auto2.ru", "mos.parts"]);

const shopUrl = (value) => {
  try {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol) && [...shops].some((domain) => url.hostname === domain || url.hostname.endsWith(`.${domain}`)) ? url : null;
  } catch { return null; }
};

function partTypes(value) {
  const text = String(value || "").toLocaleLowerCase("ru").replace(/[ё]/gu, "е");
  const found = [];
  if (/(?:^|[^\p{L}])рем(?:ень|ня|ню|нем|ни|ней|нями|нях)(?=$|[^\p{L}])/u.test(text)) {
    if (/(?:грм|газораспредел|зубчат)/u.test(text)) found.push("belt:timing");
    else if (/(?:привод|генератор|поликлин|ручейн|агрегат)/u.test(text)) found.push("belt:auxiliary");
  }
  if (/фильтр/u.test(text)) {
    if (/масл\w*/u.test(text)) found.push("filter:oil");
    if (/топлив\w*/u.test(text)) found.push("filter:fuel");
    if (/воздуш\w*/u.test(text)) found.push("filter:air");
    if (/салон\w*/u.test(text)) found.push("filter:cabin");
  }
  if (/проклад\w*/u.test(text) && /клапан\w*/u.test(text) && /крышк\w*/u.test(text)) found.push("gasket:valve-cover");
  if (/шпильк\w*/u.test(text) && /клапан\w*/u.test(text) && /крышк\w*/u.test(text)) found.push("stud:valve-cover");
  return [...new Set(found)];
}
function parseAmount(value) {
  if (!value) return null;
  const price = Number(value.replace(/[\s\u00a0]/gu, "").replace(",", "."));
  return Number.isFinite(price) && price > 0 && price < 100_000_000 ? price : null;
}
function normalizedPartLabel(value) {
  return String(value || "").toLocaleLowerCase("ru").replace(/[ё]/gu, "е").match(/[\p{L}\p{N}]+/gu)?.sort().join(" ") || "";
}

const commercialQualifier = /ремонт|замен\p{L}*|установ\p{L}*|монтаж\p{L}*|работ\p{L}*|услуг\p{L}*|достав\p{L}*|самовывоз|опт\p{L}*|скид\p{L}*|акци\p{L}*|при\s+заказе|(?:^|\s)от\s*\d|(?:^|\s)до\s*\d|бесплатн\p{L}*/iu;

function tableCells(line) {
  const cells = line.split("|").map((cell) => cell.trim());
  if (cells[0] === "") cells.shift();
  if (cells.at(-1) === "") cells.pop();
  return cells;
}
function citedPrice(title, snippet, partName, requestedType) {
  if (typeof snippet !== "string" || !requestedType || commercialQualifier.test(title + "\n" + snippet)) return { price: null, currency: null };
  const titleCells = tableCells(title);
  const neutralTitle = titleCells.length === 2 &&
    /^(?:товар|деталь|наименование|название|описание)$/iu.test(titleCells[0]) &&
    /^(?:цена|стоимость)$/iu.test(titleCells[1]);
  if (!neutralTitle && normalizedPartLabel(title) !== normalizedPartLabel(partName)) return { price: null, currency: null };
  if (title.length > 240 || snippet.length > 1000) return { price: null, currency: null };
  const lines = snippet.split(/\r?\n/).filter((line) => line.trim());
  if (!lines.length || lines.some((line) => !line.includes("|"))) return { price: null, currency: null };
  const targetRows = [];
  let ambiguousSameFamilyRow = false;
  const headers = tableCells(lines[0]);
  const priceColumn = headers.findIndex((cell) => /^(?:цена|стоимость)$/iu.test(cell));
  const productColumn = headers.findIndex((cell) => /^(?:товар|деталь|наименование|название|описание)$/iu.test(cell));
  if (headers.length !== 2 || priceColumn < 0 || productColumn < 0 || priceColumn === productColumn) return { price: null, currency: null };
  for (const [rowIndex, line] of lines.slice(1).entries()) {
    const cells = tableCells(line);
    if (cells.length !== 2) return { price: null, currency: null };
    // Only a two-cell Markdown separator directly below the header is structural.
    if (rowIndex === 0 && cells.every((cell) => /^:?-{3,}:?$/u.test(cell))) continue;
    const product = cells[productColumn];
    const types = partTypes(product);
    if (!product || product.length > 160 || types.length !== 1 || commercialQualifier.test(product) ||
        (types[0].startsWith("item:") && normalizedPartLabel(product) !== normalizedPartLabel(partName))) return { price: null, currency: null };
    const priceCell = cells[priceColumn];
    if (priceCell.length > 60) return { price: null, currency: null };
    const match = priceCell.match(/^((?:\d+|\d{1,3}(?:[ \u00a0]\d{3})+)(?:[,.]\d{2})?)\s*(₽|руб(?:\.|лей|ля)?|RUB|р\.)$/iu);
    const price = parseAmount(match?.[1]);
    if (price === null) return { price: null, currency: null };
    if (types[0] !== requestedType) continue;
    if (normalizedPartLabel(product) !== normalizedPartLabel(partName)) {
      ambiguousSameFamilyRow = true;
      continue;
    }
    targetRows.push(price);
  }
  return targetRows.length === 1 && targetRows[0] !== null && !ambiguousSameFamilyRow
    ? { price: targetRows[0], currency: "RUB" }
    : { price: null, currency: null };
}

function partType(value) {
  const text = String(value || "").toLocaleLowerCase("ru").replace(/[ё]/gu, "е");
  if (/(?:^|[^\p{L}])рем(?:ень|ня|ню|нем|ни|ней|нями|нях)(?=$|[^\p{L}])/u.test(text)) {
    if (/(?:грм|газораспредел|зубчат)/u.test(text)) return "belt:timing";
    if (/(?:привод|генератор|поликлин|ручейн|агрегат)/u.test(text)) return "belt:auxiliary";
    return null;
  }
  if (/фильтр/u.test(text)) {
    if (/масл\w*/u.test(text)) return "filter:oil";
    if (/топлив\w*/u.test(text)) return "filter:fuel";
    if (/воздуш\w*/u.test(text)) return "filter:air";
    if (/салон\w*/u.test(text)) return "filter:cabin";
    return null;
  }
  if (/проклад\w*/u.test(text) && /клапан\w*/u.test(text) && /крышк\w*/u.test(text)) return "gasket:valve-cover";
  if (/шпильк\w*/u.test(text) && /клапан\w*/u.test(text) && /крышк\w*/u.test(text)) return "stud:valve-cover";
  const words = text.replace(/[^\p{L}\p{N}]+/gu, " ").split(/\s+/u)
    .filter((word) => word.length > 2 && !/^\d+$/u.test(word) && !/^(?:для|на|и|шт|демо|автомобил|автомобилей)$/u.test(word))
    .map((word) => word.slice(0, Math.min(word.length, 7))).sort();
  return words.length >= 2 ? `item:${words.join(":")}` : null;
}

export async function searchPartOffers({ make, model, engine, city = "Москва", partName, fetchImpl = fetch, apiKey = process.env.OPENROUTER_API_KEY, modelName = process.env.OPENROUTER_MODEL || "openai/gpt-5.4-mini" }) {
  if (!apiKey) throw Object.assign(new Error("part_offers_unconfigured"), { code: "unconfigured" });
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12_000);
  try {
    const response = await fetchImpl("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST", headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({
        model: modelName, max_tokens: 500, plugins: [{ id: "web", engine: "exa", max_results: 8 }],
        messages: [{ role: "user", content: `Найди страницы предложений этой автодетали в российских магазинах автозапчастей: ${partName}; автомобиль ${make} ${model}, двигатель ${engine}; город ${city}. Верни ссылки на страницы магазинов. Не выдумывай наличие, применимость или цену. Не используй маркетплейсы, форумы и объявления.` }],
      }),
    });
    if (!response.ok) throw Object.assign(new Error("part_offers_upstream_error"), { code: "upstream" });
    const data = await response.json();
    const message = data.choices?.[0]?.message;
    if (!message || typeof message.content !== "string") throw Object.assign(new Error("part_offers_invalid_response"), { code: "invalid" });
    const annotations = (message.annotations || []).filter((item) => item?.type === "url_citation").map((item) => item.url_citation || item);
    return annotations.map((citation) => {
      const url = shopUrl(citation.url);
      if (!url) return null;
      const rawContent = typeof citation.content === "string" ? citation.content.trim() : "";
      const rawTitle = typeof citation.title === "string" && citation.title.trim() ? citation.title.trim() : url.hostname;
      const snippet = rawContent.slice(0, 1000);
      const title = rawTitle.slice(0, 240);
      const requestedType = partType(partName);
      const citedType = partType(rawTitle + " " + rawContent);
      const parsed = rawContent.length <= 1000 && requestedType && requestedType === citedType
        ? citedPrice(rawTitle, rawContent, partName, requestedType)
        : { price: null, currency: null };
      return {
        title,
        url: url.href, snippet, price: parsed.price, currency: parsed.currency,
        priceBasis: parsed.price === null ? "none" : "citation_snippet",
      };
    }).filter(Boolean).slice(0, 8);
  } catch (error) {
    if (error.code) throw error;
    throw Object.assign(new Error("part_offers_upstream_error"), { code: error.name === "AbortError" ? "timeout" : "upstream" });
  } finally { clearTimeout(timeout); }
}

export const PART_OFFER_PARKS = [
  { id: "moscow", label: "Москва (демо-парк)", city: "Москва", distanceKm: 12 },
  { id: "kazan", label: "Казань (демо-парк)", city: "Казань", distanceKm: 28 },
  { id: "ekaterinburg", label: "Екатеринбург (демо-парк)", city: "Екатеринбург", distanceKm: 35 },
];

export function buildPartOfferComparison({ partName, quantity, city, distanceKm, sources, history }) {
  const seed = [...partName].reduce((sum, char) => sum + char.charCodeAt(0), 0);
  const unitPrice = 600 + (seed % 45) * 100;
  const demoQuotes = [
    { supplier: "Демо-поставщик Север", price: unitPrice, deliveryDays: 2 },
    { supplier: "Демо-поставщик Центр", price: unitPrice + 350, deliveryDays: 1 },
  ].map((quote) => ({ ...quote, label: "Демо-оценка", currency: "RUB", distanceKm, totalPrice: quote.price * quantity, estimated: true, city }));
  const analogMinimum = sources.filter((source) => source.price !== null).sort((a, b) => a.price - b.price)[0];
  return {
    partName, fit: { status: "unknown", reason: "Применимость не подтверждена источником или каталогом производителя." },
    sources, demoQuotes,
    recommendation: { price: null, currency: null, basis: "Рекомендованная цена не указана: применимость детали к двигателю и комплектации не доказана." },
    analogsMinimum: analogMinimum
      ? { price: analogMinimum.price, currency: analogMinimum.currency, sourceUrl: analogMinimum.url, basis: "Минимум среди найденных публикаций с ценой; применимость не проверена, используйте только как аналог для ручной сверки." }
      : { price: null, currency: null, sourceUrl: null, basis: "В цитированных фрагментах нет подтверждённой цены." },
    estimate: { basis: "Синтетический расчёт для демонстрации: условная цена детали × количество; сроки и расстояние заданы демо-парком. Не оферта." },
    history: { ...history, source: "synthetic_demo_procurement_events", scope: "vehicle+part", note: "Счётчики относятся только к помеченным демонстрационным событиям; реальные заявки не включены." },
  };
}
