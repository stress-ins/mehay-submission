import { selectNeuroTool } from "./neuroTools.ts";

export type MechanicLanguageCode = "ru" | "en" | "hi" | "tg" | "uz";

export const mechanicVoiceExamples: Record<MechanicLanguageCode, string[]> = {
  ru: ["Проведи диагностику", "Сколько часов занял ремонт?", "Какую деталь ставили?", "Создай заявку ТОиР"],
  en: ["Run diagnostics", "How many hours did the repair take?", "Which part was installed?", "Create a repair ticket"],
  hi: ["निदान करें", "मरम्मत में कितने घंटे लगे?", "कौन सा पुर्जा लगाया?", "मरम्मत टिकट बनाएँ"],
  tg: ["Ташхис гузаронед", "Таъмир чанд соат давом кард?", "Кадом қисм насб шуд?", "Дархости таъмир созед"],
  uz: ["Ташхисни ўтказинг", "Таъмир неча соат давом этди?", "Қайси қисм ўрнатилди?", "Таъмир учун буюртма яратинг"],
};

const normalize = (text: string) => text.toLocaleLowerCase().trim().replace(/[.!?…]+$/u, "").replace(/\s+/gu, " ");

export function isDiagnosisCommand(text: string, language: MechanicLanguageCode) {
  const value = normalize(text);
  return selectNeuroTool(text) === "diagnose" || ({
    en: /^(run|start|perform) diagnostics?$/u, hi: /^(निदान करें|जाँच करें|डायग्नोस्टिक्स चलाएँ)$/u, tg: /^(ташхис гузаронед|ташхис кунед|санҷиш гузаронед)$/u, uz: /^(ташхисни ўтказинг|ташхис қилинг|текширув ўтказинг)$/u, ru: /$^/u,
  } as const)[language].test(value);
}

export function isTicketCommand(text: string, language: MechanicLanguageCode) {
  const value = normalize(text);
  return selectNeuroTool(text) === "ticket" || ({
    en: /^(create|open|submit) (a )?(repair )?(ticket|work order)$/u, hi: /^(मरम्मत टिकट बनाएँ|टिकट बनाएँ|कार्य आदेश बनाएँ)$/u, tg: /^(таъмир.*дархост созед|дархост.*созед|фармоиши кор созед)$/u, uz: /^(таъмир.*буюртма яратинг|буюртма яратинг)$/u, ru: /$^/u,
  } as const)[language].test(value);
}

export function historyAnswerKind(text: string, language: MechanicLanguageCode): "hours" | "part" | null {
  const value = normalize(text);
  const hours: Record<MechanicLanguageCode, RegExp> = {
    ru: /сколько.*(?:час|времен)|(?:час|времен).*ремонт/u,
    en: /how many hours|hours.*repair/u,
    hi: /कितने.*घंटे|घंटे.*मरम्मत/u,
    tg: /(?:таъмир.*чанд.*соат|чанд.*соат)|соат.*таъмир/u,
    uz: /(?:таъмир.*неча.*соат|неча.*соат)|соат.*таъмир/u,
  };
  if (hours[language].test(value)) return "hours";
  const parts: Record<MechanicLanguageCode, RegExp> = {
    ru: /какую.*детал.*(?:ставил|менял|установил)|что меняли/u,
    en: /(?:which|what).*part|part.*(?:installed|fitted|changed|used)/u,
    hi: /कौन.*पुर्ज.*(?:लगाया|बदला)|पुर्ज.*(?:लगाया|बदला)/u,
    tg: /(?:кадом.*қисм|қисм.*кадом|қисм.*(?:насб|иваз)|(?:насб|иваз).*қисм)/u,
    uz: /(?:қайси.*қисм|қисм.*қайси|қисм.*(?:ўрнат|алмаш)|(?:ўрнат|алмаш).*қисм)/u,
  };
  return parts[language].test(value) ? "part" : null;
}

export function isRepairHistoryQuestion(text: string, language: MechanicLanguageCode) {
  const value = normalize(text);
  if (historyAnswerKind(value, language)) return true;
  return ({
    ru: /истори(я|ю) ремонтов|что известно о ремонте/u,
    en: /repair history|what do you know about.*repair/u,
    hi: /मरम्मत.*इतिहास/u,
    tg: /таърих.*таъмир/u,
    uz: /таъмир.*тарих/u,
  } as const)[language].test(value);
}

export function voiceConfirmation(text: string, language: MechanicLanguageCode) {
  const value = normalize(text);
  return ({ ru: /^(да,? подтверждаю|подтверждаю|создавай|оформляй)$/u, en: /^(yes,? confirm|yes,? i confirm|confirm|create it)$/u, hi: /^(हाँ,? पुष्टि|हाँ|पुष्टि|बनाएँ)$/u, tg: /^(ҳа,? тасдиқ мекунам|ҳа|тасдиқ|созед)$/u, uz: /^(ҳа,? тасдиқлайман|ҳа|тасдиқ|яратинг)$/u } as const)[language].test(value);
}

export function voiceCancellation(text: string, language: MechanicLanguageCode) {
  const value = normalize(text);
  return ({ ru: /^(нет|отмена|не надо)$/u, en: /^(no|cancel|don't|do not)$/u, hi: /^(नहीं|रद्द|मत करें)$/u, tg: /^(не|бекор|лозим нест)$/u, uz: /^(йўқ|бекор|керак эмас)$/u } as const)[language].test(value);
}
