export type MechanicPlanLanguage = "ru" | "en" | "hi" | "tg" | "uz";
export type MechanicPlanIntent = "next" | "done" | "repeat" | "previous" | "torque" | "clearance" | "figure";

const commands: Record<MechanicPlanLanguage, Partial<Record<MechanicPlanIntent, RegExp>>> = {
  ru: {
    next: /^(следующий шаг|читать следующий шаг|дальше по плану|что дальше|дальше)$/u,
    done: /^(отметить выполненным|отметить выполнено|шаг выполнен|выполнено|сделал|готово)$/u,
    figure: /^(?:покажи|открой) (?:рисунок|схему|страницу|иллюстрацию)(?: руководства)?$/u,
    previous: /^(назад|предыдущий шаг|шаг назад)$/u,
    torque: /^(как (?:это |его |её )?затянуть|(?:какой )?момент(?: затяжки)?|с каким моментом затянуть)$/u,
    clearance: /^(какой (?:нужен )?зазор|каким щупом|зазор)$/u,
    repeat: /^(повтори|повтори шаг|повторить шаг|ещё раз|(?:ну )?что (?:мне )?(?:дальше(?: делать)?|делать дальше))$/u,
  },
  en: {
    next: /^(next step|read next step|continue the plan|what next|next)$/u,
    done: /^(mark done|mark completed|step completed|done)$/u,
    repeat: /^(repeat step|repeat that|again)$/u,
    previous: /^(?:(?:go )?back(?: one step)?|previous(?: step)?|go to (?:the )?previous step)$/u,
    figure: /^(?:(?:show|open)(?: me)? )?(?:the )?(?:diagram|illustration|figure|drawing)$/u,
    torque: /^(?:(?:what is the )?(?:tightening )?torque(?: value)?|how (?:tight|hard) should I tighten it|how do I tighten it)$/u,
    clearance: /^(?:(?:what is the )?(?:valve )?clearance(?: value)?|what gap|which feeler gauge|gap size)$/u,
  },
  hi: {
    next: /^(अगला चरण|अगला कदम|अगला चरण पढ़ें|आगे क्या)$/u,
    done: /^(पूरा हुआ चिह्नित करें|चरण पूरा हुआ|हो गया)$/u,
    repeat: /^(चरण दोहराएँ|फिर से)$/u,
    previous: /^(?:पिछला चरण|पिछला कदम|वापस|पिछले चरण पर जाएँ|एक चरण पीछे)$/u,
    figure: /^(?:(?:दिखाएँ|खोलें) )?(?:आरेख|डायग्राम|चित्र|रेखाचित्र)(?: दिखाएँ| खोलें)?$/u,
    torque: /^(?:(?:कसने का )?(?:टॉर्क|बल)(?: कितना| क्या है)?|कितना कसें|किस टॉर्क से कसें)$/u,
    clearance: /^(?:(?:वाल्व )?(?:क्लियरेंस|निकासी|गैप) कितना|कितना अंतर|कौन सा फीलर गेज|कितनी दूरी रखें)$/u,
  },
  tg: {
    next: /^(қадами навбатӣ|қадами дигар|қадами навбатиро хонед|баъд чӣ)$/u,
    done: /^(иҷрошударо қайд кунед|қадам иҷро шуд|тайёр)$/u,
    repeat: /^(қадамро такрор кунед|такрор кунед)$/u,
    previous: /^(қадами пешина|қадами гузашта|ба қафо|ба қадами пешина баргард)$/u,
    figure: /^(?:нақша|диаграмма|схема|расм)(?:ро)? нишон деҳ$/u,
    torque: /^(?:(?:моменти кашиш|моменти маҳкамкунӣ|момент)(?: чанд| чӣ қадар)?|бо кадом момент маҳкам кунам)$/u,
    clearance: /^(?:(?:фосила|зазор)(?:и клапан)? чанд|бо кадом щуп|фосилаи клапан чанд)$/u,
  },
  uz: {
    next: /^(keyingi qadam|keyingi bosqich|keyingi qadamni o'qing|keyin nima)$/u,
    done: /^(bajarildi deb belgilang|qadam bajarildi|tayyor)$/u,
    repeat: /^(qadamni takrorlang|yana bir marta)$/u,
    previous: /^(?:oldingi qadam|avvalgi bosqich|orqaga|bir qadam orqaga)$/u,
    figure: /^(?:(?:sxemani|diagrammani|rasmni|chizmani) ko'rsat|(?:sxemani|diagrammani|rasmni|chizmani) och)$/u,
    torque: /^(?:(?:tortish momenti|moment)(?: qancha| qiymati)?|qanday moment bilan tortay|qanday tortish kerak)$/u,
    clearance: /^(?:(?:klapan )?(?:bo'shliq|zazor|oraliq) qancha|qaysi shchup|qanday shchup bilan tekshiray)$/u,
  },
};

export function mechanicPlanIntent(text: string, language: MechanicPlanLanguage): MechanicPlanIntent | null {
  const normalized = text.trim().toLocaleLowerCase("ru").replace(/[‘’ʻʼ]/gu, "'").replace(/[.!?…।]+$/u, "").replace(/\s+/gu, " ");
  for (const intent of ["next", "done", "repeat", "previous", "torque", "clearance", "figure"] as const) if (commands[language][intent]?.test(normalized)) return intent;
  return null;
}

export function stepHint(intent: "torque" | "clearance", text: string, page: number, language: MechanicPlanLanguage = "ru", sourceHasValue?: boolean) {
  const hasValue = sourceHasValue ?? hasStepValue(intent, text);
  const missing: Record<MechanicPlanLanguage, string> = {
    ru: intent === "torque" ? "Для этого шага отдельный момент затяжки не указан." : "На этом шаге числовой зазор не указан.",
    en: intent === "torque" ? "No torque value is specified for this step." : "No numeric clearance is specified for this step.",
    hi: intent === "torque" ? "इस चरण के लिए टॉर्क मान निर्दिष्ट नहीं है।" : "इस चरण के लिए संख्यात्मक क्लियरेंस निर्दिष्ट नहीं है।",
    tg: intent === "torque" ? "Барои ин қадам моменти маҳкамкунӣ нишон дода нашудааст." : "Дар ин қадам фосилаи ададӣ нишон дода нашудааст.",
    uz: intent === "torque" ? "Bu qadam uchun tortish momenti ko‘rsatilmagan." : "Bu qadamda sonli oraliq ko‘rsatilmagan.",
  };
  const pageLabel: Record<MechanicPlanLanguage, string> = { ru: "Страница", en: "Page", hi: "पृष्ठ", tg: "Саҳифа", uz: "Sahifa" };
  return `${hasValue ? "" : missing[language] + " "}${text} ${pageLabel[language]} ${page}.`;
}

export function hasStepValue(kind: "torque" | "clearance", text: string) {
  return kind === "torque" ? /\d\s*Н\s*[·•⋅.]?\s*м/iu.test(text) : /зазор/iu.test(text) && /\d\s*(?:мм|миллиметр)/iu.test(text);
}
