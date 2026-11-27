const engines = ["ЯМЗ-236М2", "ЯМЗ-536", "ЗМЗ-5234.10", "ЗМЗ-40905.10", "ЗМЗ-40904.10"];
const manualEngine = (engine) => engine === engines[4] ? engines[3] : engine;
const defaultPages = engines.slice(0, 4).map((engine, index) => ({
  engine,
  title: "Учебный демонстрационный фрагмент, не руководство изготовителя",
  page: index + 1,
  text: `Учебный текст для демонстрации диагностики двигателя ${engine}. При постороннем шуме проверьте характер и место его появления. Для определения причины выполните дефектовку узла по документации изготовителя. Этот фрагмент не содержит норм, деталей или операций ремонта.`
}));

const models = [
  { prefix: "maz236", names: ["МАЗ-5337", "МАЗ-5551", "МАЗ-54331", "Урал-4320-10", "Урал-5557-10", "Урал-43206"], engine: engines[0], count: 13 },
  { prefix: "maz536", names: ["МАЗ"], engine: engines[1], count: 12 },
  { prefix: "paz", names: ["ПАЗ-3205", "ПАЗ-3206"], engine: engines[2], count: 13 },
  { prefix: "uaz40905", names: ["УАЗ Патриот"], engine: engines[3], count: 8 },
  { prefix: "uaz40904", names: ["УАЗ Патриот"], engine: engines[4], count: 4 }
];
const codes = Array.from({ length: 14 }, (_, i) => `F${String(i + 1).padStart(2, "0")}`);
const symptoms = ["Появился посторонний шум при работе двигателя", "Шум усиливается после прогрева двигателя", "Слышен неравномерный стук на холостом ходу", "При увеличении нагрузки меняется характер шума", "Появилась вибрация и посторонний звук двигателя"];
const maxSubmissions = 5000;
const checksPerVehicle = (vehicleId, vehicleIndex) => Array.from({ length: 3 + vehicleIndex % 3 }, (_, i) => ({
  id: `${vehicleId}-check-${i + 1}`,
  occurredAt: new Date(Date.UTC(2026, 0, 20 - i, 8 + i, 15)).toISOString(),
  code: codes[(vehicleIndex + i) % codes.length],
  symptoms: symptoms[(vehicleIndex + i) % symptoms.length]
}));
const vehicles = models.flatMap((group) => Array.from({ length: group.count }, (_, i) => {
  const id = `${group.prefix}-${String(i + 1).padStart(2, "0")}`;
  return { id, name: group.names[i % group.names.length], engine: group.engine, checks: checksPerVehicle(id, i) };
}));

function normalizePages(pages) {
  if (!Array.isArray(pages)) throw new TypeError("pages must be an array");
  return pages.map((page) => {
    if (!page || !engines.includes(page.engine) || typeof page.title !== "string" || !page.title.trim() || !Number.isInteger(page.page) || page.page < 1 || typeof page.text !== "string" || !page.text.trim()) {
      throw new TypeError("Each page must have a known engine, title, positive physical page, and text");
    }
    return { engine: manualEngine(page.engine), title: page.title.trim(), page: page.page, text: page.text.trim() };
  });
}

const stopWords = new Set([
  "при", "для", "это", "как", "что", "или", "его", "она", "они", "также",
  "если", "после", "перед", "есть", "этот", "того", "надо",
  "опишите", "расскажите", "покажите", "подскажите", "пожалуйста",
  "какой", "какая", "какие", "какое", "нужен", "нужна", "нужны", "нужно"
]);
function tokens(value) {
  return String(value ?? "").toLocaleLowerCase("ru").match(/[а-яёa-z0-9]+/gu)?.filter((word) => word.length > 2 && !(stopWords.has(word) || /^f(?:0[1-9]|1[0-4])$|^двигател[ьяюеи]?$/u.test(word))).map((word) => word.replace(/(?:иями|ями|ами|ого|ему|ому|ем|ом|ыми|ими|ать|ять|ить|ый|ий|ая|яя|ое|ее|ые|ие|ов|ев|ам|ям|ах|ях|ы|и|а|я|у|ю|е|о)$/u, "")) ?? [];
}

const pressureUnits = "бар|[км]?па|psi|кгс/см[²2]";
const torqueUnits = "н\\s*[·⋅*]?\\s*м";
const lengthUnits = "мм|см";
const temperatureUnits = "°\\s*[cс]";
const measurementTerms = /^(?:норм|значен|давлен|момент|зазор|допуск|температур)/u;
const conditionWords = /(?:^|\s)(?:при|после|перед|если|когда|выше|ниже|до|от)(?!\p{L})/iu;
const questionWords = /(?:^|\s)(?:как|како[йеию]|какая|какие|каких|каким|почему|отчего|сколько|что|чем|где|когда)(?!\p{L})/iu;
function hasMeasurement(text, questionTokens) {
  const requestedUnits = [];
  if (questionTokens.some((term) => /^давлен/u.test(term))) requestedUnits.push(pressureUnits);
  if (questionTokens.some((term) => /^момент/u.test(term))) requestedUnits.push(torqueUnits);
  if (questionTokens.some((term) => /^зазор/u.test(term))) requestedUnits.push(lengthUnits);
  if (questionTokens.some((term) => /^температур/u.test(term))) requestedUnits.push(temperatureUnits);
  if (!requestedUnits.length) requestedUnits.push(`${pressureUnits}|${torqueUnits}|${lengthUnits}|${temperatureUnits}|об/мин`);
  const [, subject, value] = text.match(/^([\p{L} ]+)\s*[:—–]\s*(.+)$/u) ?? [];
  if (!value || conditionWords.test(subject) || /(?:^|\s)(?:не|без)(?!\p{L})/iu.test(subject)) return false;
  if (!requestedUnits.every((units) => new RegExp(`^\\d+(?:[.,]\\d+)?\\s*(?:${units})\\.?$`, "iu").test(value))) return false;
  const subjectTokens = tokens(subject);
  return subjectTokens.length === questionTokens.length && questionTokens.every((term) => subjectTokens.includes(term));
}

export function createAcousticDiagnostics({ pages = defaultPages } = {}) {
  const index = normalizePages(pages).flatMap((page) =>
    page.text.match(/[\s\S]{1,1200}(?=\s|$)|[\s\S]{1,1200}/gu).map((text) => ({
      source: { ...page, text: text.trim() },
      terms: [...new Set(tokens(text))],
    }))
  );
  const replay = new Map();
  let nextNumber = 1;
  return {
    listVehicles() { return vehicles.map(({ id, name, engine }) => ({ id, name, engine })); },
    getVehicle(id) {
      const vehicle = vehicles.find((item) => item.id === id);
      return vehicle ? { id: vehicle.id, name: vehicle.name, engine: vehicle.engine, checks: vehicle.checks.map((check) => ({ ...check })) } : null;
    },
    answer(vehicleId, checkId, question) {
      const vehicle = vehicles.find((item) => item.id === vehicleId);
      const check = vehicle?.checks.find((item) => item.id === checkId);
      if (!vehicle || !check || typeof question !== "string") return null;
      const questionTokens = [...new Set(tokens(question))];
      const query = new Set([...questionTokens, ...tokens(check.symptoms)]);
      const generic = /^что\s+делать(?:\s+по\s+(?:признакам|симптомам))?[?!. ]*$/iu.test(question.trim());
      const asksMeasurement = questionTokens.some((term) => measurementTerms.test(term));
      const simpleMeasurement = asksMeasurement && !/\p{N}/u.test(question) && !conditionWords.test(question);
      const excerptQuery = question.trim().replace(/^(опишите|расскажите|покажите|подскажите)(\s+[^?]+)\?$/iu, "$1$2");
      const asksForExcerpt = !asksMeasurement && !excerptQuery.includes("?") && !questionWords.test(excerptQuery)
        && !questionTokens.some((term) => /^(?:причин|диагноз|артикул)/u.test(term));
      const matches = index.filter(({ source }) => source.engine === manualEngine(vehicle.engine))
        .filter(({ source, terms }) => {
          if (generic) return true;
          if (!questionTokens.length || !questionTokens.every((term) => terms.includes(term))) return false;
          return asksForExcerpt || (simpleMeasurement && hasMeasurement(source.text, questionTokens));
        })
        .map(({ source, terms }) => ({ source, score: terms.filter((term) => query.has(term)).length }))
        .filter(({ score }) => score > 0).sort((a, b) => b.score - a.score).slice(0, 3);
      if (!matches.length) return { status: "insufficient", sources: [], recommendation: "Недостаточно подтверждённых сведений; рекомендуется дефектовка узла." };
      return { status: "supported", sources: matches.map(({ source }) => ({ title: source.title, page: source.page, text: source.text })), recommendation: "Сопоставьте наблюдаемый шум с приведённым фрагментом; для установления причины выполните дефектовку узла." };
    },
    submit(vehicleId, checkId, { observation, works, parts } = {}, idempotencyKey) {
      const vehicle = vehicles.find((item) => item.id === vehicleId);
      if (!vehicle?.checks.some((check) => check.id === checkId)) return null;
      const payload = JSON.stringify({ observation, works, parts });
      const key = `${vehicleId}\0${checkId}\0${idempotencyKey}`;
      if (replay.has(key)) {
        const previous = replay.get(key);
        return previous.payload === payload ? { ...previous.result } : { conflict: true };
      }
      if (replay.size >= maxSubmissions) return { capacity: true };
      const result = { number: `TKT-${String(nextNumber++).padStart(4, "0")}` };
      replay.set(key, { payload, result });
      return { ...result };
    }
  };
}
