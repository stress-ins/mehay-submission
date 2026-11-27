// The policy is a workshop demo restriction. Citations and their limits come from the installed manuals.
const policy = {
  ru: ["Конфликт источников: формулировки руководств расходятся", "Недостаточно сопоставимых указаний в руководствах", "Для демонстрации регулируйте клапаны только на холодном двигателе. Одного ожидания после остановки{wait} недостаточно. Перед работой передайте вопрос старшему механику для проверки применимого условия."],
  en: ["The manuals disagree", "The manuals provide insufficient comparable evidence", "For this demonstration, adjust the valves only with the engine cold. Elapsed time alone{wait} is insufficient. Before work, ask the senior mechanic to verify the applicable condition."],
  hi: ["दोनों पुस्तिकाओं के निर्देश अलग हैं", "पुस्तिकाओं में तुलना के लिए पर्याप्त प्रमाण नहीं हैं", "इस प्रदर्शन में वाल्व केवल ठंडे इंजन पर समायोजित करें। रुकने के बाद बीता समय{wait} पर्याप्त नहीं है। काम से पहले वरिष्ठ मैकेनिक से लागू शर्त की पुष्टि कराएँ।"],
  tg: ["Дастурҳо бо ҳам мухолифанд", "Барои муқоисаи дастурҳо далел кофӣ нест", "Дар намоиш клапанҳоро танҳо дар муҳаррики сард танзим кунед. Вақти гузашта пас аз таваққуф{wait} кофӣ нест. Пеш аз кор аз механики калон тасдиқи шарти дахлдорро дархост кунед."],
  uz: ["Qo‘llanmalardagi ko‘rsatmalar farq qiladi", "Qo‘llanmalardagi dalillar solishtirish uchun yetarli emas", "Namoyishda klapanlarni faqat sovuq dvigatelda sozlang. To‘xtatilgandan keyin o‘tgan vaqt{wait}ning o‘zi yetarli emas. Ish boshlashdan oldin tegishli shartni katta mexanik bilan aniqlashtiring."],
};

export function valveTimingTopic(query) {
  if (!/клапан|теплов\S*\s+зазор/iu.test(query)) return false;
  if (/момент|затяж|давлени|диаметр|толщин|сколько\s+мм|в\s+миллиметрах|како[йв]\s+(?:должен\s+быть\s+)?зазор|величин[ауы]\s+зазор|размер\s+зазор/iu.test(query)) return false;
  if (/замен|менять|сняти|снимат|притир|притират|промыв|впрыск|предохранительн|обратн\S*\s+клапан/iu.test(query)) return false;
  if (!/регулир|отрегулир|зазор|холодн|горяч|прогре|осты|осту[дж]|минут|останов/iu.test(query)) return false;
  return /холодн|горяч|прогре|осты|осту[дж]|минут|\b\d+\s*мин|останов|подожд|когда|через\s+сколько|на\s+каком\s+двигател|при\s+какой\s+температур/iu.test(query)
    || /противореч|конфликт|расходятся/iu.test(query)
    || /(?:как|услови\S*)\s+.{0,30}(?:регулир|отрегулир)|^\s*(?:порядок\s+)?регулировк[аи]\s+(?:тепловых\s+зазоров|клапан)/iu.test(query);
}

export function valveTimingPassage(text, pdfPage) {
  const sentences = text.split(/(?<=[.!?])\s+|\n(?=\s*\d+(?:\.\d+)+\s)/u);
  for (let sentence of sentences) {
    sentence = sentence.split("\n").filter(line => line.trim() !== String(pdfPage)).join("\n").trim();
    if (!/клапан|теплов\S*\s+зазор/iu.test(sentence) || !/останов/iu.test(sentence)) continue;
    const match = sentence.match(/(не\s+ранее|не\s+менее|менее)\s*,?\s*(?:чем\s+)?через\s+(\d+)\s+мин/iu);
    if (match) {
      return { text: sentence, direction: /^не\s/iu.test(match[1]) ? "minimum" : "before", minutes: Number(match[2]) };
    }
  }
  return null;
}

export function valveTimingAssessment(pages, language = "ru") {
  const sources = pages.filter(page => page.valveTiming);
  const opposing = sources.find(a => sources.some(b => a.manual.id !== b.manual.id
    && a.valveTiming.direction !== b.valveTiming.direction && a.valveTiming.minutes === b.valveTiming.minutes));
  const [conflict, missing, action] = policy[language] ?? policy.ru;
  const minuteUnit = { ru: "мин", en: "min", hi: "मिनट", tg: "дақ", uz: "daq" }[language] ?? "мин";
  const verifiedWait = opposing ? ` (${opposing.valveTiming.minutes} ${minuteUnit})` : "";
  const citations = sources.map(({ manual, pdfPage, text }) =>
    `${manual.title} · PDF ${pdfPage}: «${text.replace(/\s+/gu, " ").trim()}»`);
  return {
    manualAssessment: opposing ? "conflict" : "insufficient_evidence",
    answer: [`${opposing ? conflict : missing}. ${action.replace("{wait}", verifiedWait)}`, ...citations].join("\n\n"),
    results: sources,
  };
}
