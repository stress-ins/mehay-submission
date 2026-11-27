import test from "node:test";
import assert from "node:assert/strict";
import { buildPartOfferComparison, searchPartOffers } from "./part-offers.mjs";

test("supplier prices require a shop citation snippet with explicit RUB currency", async () => {
  const sources = await searchPartOffers({ make: "МАЗ", model: "МАЗ-5337", engine: "ЯМЗ-236М2", partName: "Масляный фильтр", apiKey: "test", fetchImpl: async (_url, options) => {
    const prompt = JSON.parse(options.body).messages[0].content;
    assert.match(prompt, /МАЗ-5337/);
    assert.doesNotMatch(prompt, /DEMO-|VIN|SYNTH-002/);
    return Response.json({ choices: [{ message: { content: "listing results", annotations: [
      { type: "url_citation", url_citation: { url: "https://www.exist.ru/price.aspx?pcode=filter", title: "Масляный фильтр", content: "Товар | Цена\nМасляный фильтр | 1 250 руб." } },
      { type: "url_citation", url_citation: { url: "https://autodoc.ru/catalog/part", title: "Part", content: "Доставка доступна, уточняйте цену." } },
      { type: "url_citation", url_citation: { url: "https://evil.example/item", title: "Bad", content: "Цена 50 000 руб." } },
    ] } }] });
  } });
  assert.equal(sources.length, 2);
  assert.equal(sources[0].price, 1250);
  assert.equal(sources[0].priceBasis, "citation_snippet");
  assert.equal(sources[1].price, null);
  assert.equal(sources[1].currency, null);
});

test("provider errors are surfaced and unsupported fit stays unknown", async () => {
  await assert.rejects(searchPartOffers({ make: "МАЗ", model: "МАЗ-5337", engine: "ЯМЗ-236М2", partName: "Фильтр", apiKey: "test", fetchImpl: async () => new Response("", { status: 500 }) }), { code: "upstream" });
  await assert.rejects(searchPartOffers({ make: "МАЗ", model: "МАЗ-5337", engine: "ЯМЗ-236М2", partName: "Фильтр", apiKey: "test", fetchImpl: async () => Response.json({ choices: [] }) }), { code: "invalid" });
  const comparison = buildPartOfferComparison({ partName: "Фильтр", quantity: 2, city: "Москва", distanceKm: 12, sources: [], history: { orders: 0, defects: 0, rework: 0, realRequests: 1 } });
  assert.equal(comparison.fit.status, "unknown");
  assert.equal(comparison.demoQuotes[0].totalPrice, comparison.demoQuotes[0].price * 2);
  assert.equal(comparison.recommendation.price, null);
  assert.equal(comparison.analogsMinimum.price, null);
  assert.equal(comparison.history.realRequests, 1);
});

test("unverified citations can supply an analog minimum but never a recommended price", () => {
  const source = { title: "Part", url: "https://auto2.ru/part", snippet: "Цена 1 200 ₽", price: 1200, currency: "RUB", priceBasis: "citation_snippet" };
  const result = buildPartOfferComparison({ partName: "Ремень", quantity: 1, city: "Москва", distanceKm: 12, sources: [source], history: { orders: 0, defects: 0, rework: 0 } });
  assert.equal(result.recommendation.price, null);
  assert.equal(result.analogsMinimum.price, 1200);
  assert.equal(result.analogsMinimum.sourceUrl, source.url);
  assert.match(result.analogsMinimum.basis, /применимость не проверена/);
});

test("prose-only supplier prices remain links without a quote", async () => {
  const sources = await searchPartOffers({ make: "Ford", model: "Transit", engine: "2.0 EcoBlue", partName: "Ремень генератора", apiKey: "test", fetchImpl: async () => Response.json({ choices: [{ message: { content: "results", annotations: [
    { type: "url_citation", url_citation: { url: "https://www.detali.ru/code/a", title: "Ремень генератора", content: "Ремень генератора — цена: 2 436 ₽ -6% 2 272 ₽." } },
    { type: "url_citation", url_citation: { url: "https://auto2.ru/item", title: "Ремень генератора", content: "Ремень генератора — цена: 2 050 ₽. Доставка сегодня, от 300 ₽." } },
    { type: "url_citation", url_citation: { url: "https://www.exist.ru/belt", title: "Ремень генератора", content: "Ремень генератора. О наличии и стоимости уточняйте. Доставка 350 ₽." } },
    { type: "url_citation", url_citation: { url: "https://www.exist.ru/filter", title: "Масляный фильтр", content: "Масляный фильтр. Цена: 680 ₽." } },
  ] } }] }) });
  assert.deepEqual(sources.map((source) => source.price), [null, null, null, null]);
});

test("quoted table prices stay with the matching product row", async () => {
  const source = await searchPartOffers({ make: "МАЗ", model: "МАЗ-5337", engine: "ЯМЗ-236М2", partName: "Ремень генератора", apiKey: "test", fetchImpl: async () => Response.json({ choices: [{ message: { content: "results", annotations: [
    { type: "url_citation", url_citation: { url: "https://www.exist.ru/items", title: "Товар | Цена", content: "Товар | Цена\nМасляный фильтр | 680 ₽\nРемень генератора | 2400 ₽" } },
  ] } }] }) });
  assert.equal(source[0].price, 2400);
});

test("unlabeled and ambiguous candidates remain links without quotes", async () => {
  const sources = await searchPartOffers({ make: "МАЗ", model: "МАЗ-5337", engine: "ЯМЗ-236М2", partName: "Ремень генератора", apiKey: "test", fetchImpl: async () => Response.json({ choices: [{ message: { content: "results", annotations: [
    { type: "url_citation", url_citation: { url: "https://www.exist.ru/a", title: "Ремень генератора", content: "Ремень генератора в наличии. Самовывоз бесплатно. Курьерская доставка. Стоимость: 350 ₽." } },
    { type: "url_citation", url_citation: { url: "https://www.exist.ru/b", title: "Ремень генератора", content: "Ремень генератора. Цена: 680 ₽ — Масляный фильтр." } },
    { type: "url_citation", url_citation: { url: "https://www.exist.ru/c", title: "Ремень генератора", content: "Ремень генератора и масляный фильтр — цена: 2 400 ₽." } },
    { type: "url_citation", url_citation: { url: "https://www.exist.ru/d", title: "Ремень генератора", content: "Товар | Цена\nРемень генератора | 2 400 ₽\nРемень генератора | 2 500 ₽" } },
    { type: "url_citation", url_citation: { url: "https://www.exist.ru/e", title: "Ремень генератора", content: "Ремень генератора. О наличии и стоимости уточняйте. Доставка 350 ₽." } },
    { type: "url_citation", url_citation: { url: "https://www.exist.ru/f", title: "Ремень генератора", content: "Ремень генератора, курьерская доставка, стоимость: 350 ₽." } },
    { type: "url_citation", url_citation: { url: "https://www.exist.ru/g", title: "Ремень генератора", content: "Ремень генератора в наличии. стоимость: 350 ₽." } },
    { type: "url_citation", url_citation: { url: "https://www.exist.ru/h", title: "Ремень генератора", content: "Ремень генератора | от 600 ₽" } },
    { type: "url_citation", url_citation: { url: "https://www.exist.ru/i", title: "Товар | Цена", content: "Товар | Цена\nРемень генератора | 2 400 ₽ / 2 500 $" } },
    { type: "url_citation", url_citation: { url: "https://www.exist.ru/j", title: "Товар | Цена", content: "Товар | Цена\nРемень генератора | 2 400 ₽ / 2 500 ₽" } },
    { type: "url_citation", url_citation: { url: "https://www.exist.ru/k", title: "Ремень генератора", content: "Ремень генератора — цена от 600 ₽." } },
  ] } }] }) });
  assert.deepEqual(sources.map((item) => item.price), [null, null, null, null, null, null, null, null]);
});

test("ambiguous currency cells and Russian starting prices are rejected", async () => {
  const sources = await searchPartOffers({ make: "МАЗ", model: "МАЗ-5337", engine: "ЯМЗ-236М2", partName: "Ремень генератора", apiKey: "test", fetchImpl: async () => Response.json({ choices: [{ message: { content: "results", annotations: [
    { type: "url_citation", url_citation: { url: "https://www.exist.ru/a", title: "Товар | Цена", content: "Товар | Цена\nРемень генератора | 2 400 ₽ / 2 500 $" } },
    { type: "url_citation", url_citation: { url: "https://www.exist.ru/b", title: "Товар | Цена", content: "Товар | Цена\nРемень генератора | 2 400 ₽ / 2 500 ₽" } },
    { type: "url_citation", url_citation: { url: "https://www.exist.ru/c", title: "Ремень генератора", content: "Ремень генератора — цена от 600 ₽." } },
  ] } }] }) });
  assert.deepEqual(sources.map((item) => item.price), [null, null, null]);
});

test("service, repair, discount, wholesale and minimum-quantity prose never become quotes", async () => {
  const sources = await searchPartOffers({ make: "МАЗ", model: "МАЗ-5337", engine: "ЯМЗ-236М2", partName: "Ремень генератора", apiKey: "test", fetchImpl: async () => Response.json({ choices: [{ message: { content: "results", annotations: [
    { type: "url_citation", url_citation: { url: "https://www.exist.ru/a", title: "Ремонт генератора", content: "Ремонт генератора — цена: 6500 ₽." } },
    { type: "url_citation", url_citation: { url: "https://www.exist.ru/b", title: "Замена ремня генератора", content: "Замена ремня генератора — цена: 1500 ₽." } },
    { type: "url_citation", url_citation: { url: "https://www.exist.ru/c", title: "Ремень генератора", content: "Ремень генератора — цена 2400 ₽, скидка -50% на установку: 450 ₽." } },
    { type: "url_citation", url_citation: { url: "https://www.exist.ru/d", title: "Ремень генератора", content: "Ремень генератора оптовая цена: 650 ₽ при заказе от 20 шт." } },
  ] } }] }) });
  assert.deepEqual(sources.map((item) => item.price), [null, null, null, null]);
});

test("table prices require exactly two clear columns, one exact product row and one fixed price", async () => {
  const sources = await searchPartOffers({ make: "МАЗ", model: "МАЗ-5337", engine: "ЯМЗ-236М2", partName: "Ремень генератора", apiKey: "test", fetchImpl: async () => Response.json({ choices: [{ message: { content: "results", annotations: [
    { type: "url_citation", url_citation: { url: "https://www.exist.ru/quantity", title: "Товар | Количество | Цена", content: "Товар | Количество | Цена\nРемень генератора | 20 шт. | 650 ₽" } },
    { type: "url_citation", url_citation: { url: "https://www.exist.ru/markdown", title: "Товар | Цена", content: "| Товар | Цена |\n| --- | --- |\n| Ремень генератора | 2 400 ₽ |\n| Масляный фильтр | 680 ₽ |" } },
    { type: "url_citation", url_citation: { url: "https://www.exist.ru/duplicate", title: "Товар | Цена | Цена", content: "Товар | Цена | Цена\nРемень генератора | 2 400 ₽ | 2 500 ₽" } },
    { type: "url_citation", url_citation: { url: "https://www.exist.ru/incomplete", title: "Товар | Цена", content: "Товар | Цена\nРемень генератора |" } },
    { type: "url_citation", url_citation: { url: "https://www.exist.ru/extra", title: "Товар | Цена", content: "Товар | Цена\nРемень генератора | 20 шт. | 650 ₽" } },
    { type: "url_citation", url_citation: { url: "https://www.exist.ru/terms", title: "Товар | Цена", content: "Товар | Цена\nРемень генератора | 2 400 ₽\n\nСкидка 50% на установку" } },
    { type: "url_citation", url_citation: { url: "https://www.exist.ru/mixed", title: "Товар | Цена", content: "Товар | Цена\nРемень генератора и масляный фильтр | 2 400 ₽" } },
    { type: "url_citation", url_citation: { url: "https://www.exist.ru/near", title: "Товар | Цена", content: "Товар | Цена\nРемонт генератора | 6 500 ₽\nРемень генератора | 2 400 ₽" } },
  ] } }] }) });
  assert.deepEqual(sources.map((item) => item.price), [null, 2400, null, null, null, null, null, null]);
});

test("full source title and content context must be neutral and table-only", async () => {
  const table = "Товар | Цена\nРемень генератора | 2 400 ₽";
  const sources = await searchPartOffers({ make: "МАЗ", model: "МАЗ-5337", engine: "ЯМЗ-236М2", partName: "Ремень генератора", apiKey: "test", fetchImpl: async () => Response.json({ choices: [{ message: { content: "results", annotations: [
    { type: "url_citation", url_citation: { url: "https://www.exist.ru/wholesale", title: "Оптовый каталог — цены при заказе от 20 шт.", content: table } },
    { type: "url_citation", url_citation: { url: "https://www.exist.ru/service", title: "Стоимость замены деталей — только работа", content: table } },
    { type: "url_citation", url_citation: { url: "https://www.exist.ru/note", title: "Ремень генератора", content: table + "\nСкидка на установку" } },
    { type: "url_citation", url_citation: { url: "https://www.exist.ru/long-title", title: "Ремень генератора " + " ".repeat(250) + "Оптовый", content: table } },
    { type: "url_citation", url_citation: { url: "https://www.exist.ru/long-content", title: "Ремень генератора", content: table + "\nДополнительная информация. " + "условия ".repeat(150) } },
    { type: "url_citation", url_citation: { url: "https://www.exist.ru/valid", title: "Ремень генератора", content: table } },
  ] } }] }) });
  assert.deepEqual(sources.map((item) => item.price), [null, null, null, null, null, 2400]);
  assert.doesNotMatch(sources[3].title, /Оптовый/u);
});

test("only a complete structurally valid product grid can yield a fixed unit price", async () => {
  const citations = [
    ["valid grouped", "Товар | Цена\nРемень генератора | 2 400 ₽\nМасляный фильтр | 680 ₽"],
    ["valid NBSP", "Товар | Цена\nРемень генератора | 2 400,50 руб."],
    ["two ungrouped numbers", "Товар | Цена\nРемень генератора | 2400 2100 ₽"],
    ["two grouped numbers", "Товар | Цена\nРемень генератора | 2 400 2 100 ₽"],
    ["bad grouping", "Товар | Цена\nРемень генератора | 24 00 ₽"],
    ["footer after product", "Товар | Цена\nРемень генератора | 2 400 ₽\nМинимальная партия | 20 шт."],
    ["footer with currency", "Товар | Цена\nРемень генератора | 2 400 ₽\nМинимальная партия | 20 ₽"],
    ["unrecognized footer", "Товар | Цена\nРемень генератора | 2 400 ₽\nПримечание | условия"],
    ["separator after row", "Товар | Цена\nРемень генератора | 2 400 ₽\n| --- | --- |"],
    ["hypersized price", "Товар | Цена\nРемень генератора | 999999999999999 ₽"],
  ];
  const prices = [];
  for (let start = 0; start < citations.length; start += 8) {
    const batch = citations.slice(start, start + 8);
    const sources = await searchPartOffers({ make: "МАЗ", model: "МАЗ-5337", engine: "ЯМЗ-236М2", partName: "Ремень генератора", apiKey: "test", fetchImpl: async () => Response.json({ choices: [{ message: { content: "results", annotations: batch.map(([name, content]) => ({ type: "url_citation", url_citation: { url: `https://www.exist.ru/${encodeURIComponent(name)}`, title: "Товар | Цена", content } })) } }] }) });
    prices.push(...sources.map(({ price }) => price));
  }
  assert.deepEqual(prices, [2400, 2400.5, null, null, null, null, null, null, null, null]);
});
