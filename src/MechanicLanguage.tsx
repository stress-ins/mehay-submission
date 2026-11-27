import { useSystemLanguage } from "./systemLanguage";
import { translateNeuroDvs as t } from "./neuroDvsTranslations";

type Language = "ru" | "en" | "uz" | "tg" | "hi";
type TranslationLanguage = Exclude<Language, "ru">;
type Status = "normal" | "anomaly" | "check_failed" | "uncertain";
type Reference = { stepKey?: string; text: string; translations?: Partial<Record<TranslationLanguage, string>>; excerpt?: string; manual: string; pdfPage: number; url: string };

const statusCopy: Record<TranslationLanguage, Record<Status, string>> = {
  en: {
    normal: "The acoustic check found no deviation. After the usual required checks, follow the manufacturer's standard procedure.",
    anomaly: "The acoustic check found a deviation. Only the procedure supported by the manual for this selected engine is shown below.",
    check_failed: "The measurement did not pass validation. No diagnosis was made from this recording. Select another measurement.",
    uncertain: "There is not enough evidence for a reliable conclusion. Repeat the measurement; do not treat a fault as confirmed.",
  },
  uz: {
    normal: "Akustik tekshiruvda og‘ish aniqlanmadi. Odatdagi majburiy tekshiruvlardan so‘ng ishlab chiqaruvchining belgilangan tartibiga amal qiling.",
    anomaly: "Akustik tekshiruvda og‘ish aniqlandi. Quyida faqat tanlangan dvigatel uchun qo‘llanma bilan tasdiqlangan tekshiruv keltirilgan.",
    check_failed: "O‘lchov tekshiruvdan o‘tmadi. Bu yozuv bo‘yicha tashxis qo‘yilmadi. Boshqa o‘lchovni tanlang.",
    uncertain: "Natija aniq xulosa uchun yetarli emas. O‘lchovni takrorlang; nosozlikni tasdiqlangan deb hisoblamang.",
  },
  tg: {
    normal: "Санҷиши акустикӣ инҳирофро ошкор накард. Пас аз санҷишҳои ҳатмии маъмулӣ тартиби муқарраркардаи истеҳсолкунандаро риоя кунед.",
    anomaly: "Санҷиши акустикӣ инҳирофро ошкор кард. Дар поён танҳо санҷише оварда шудааст, ки дастур барои ҳамин муҳаррик тасдиқ мекунад.",
    check_failed: "Андозагирӣ аз санҷиш нагузашт. Аз рӯи ин сабт ташхис гузошта нашуд. Андозагирии дигарро интихоб кунед.",
    uncertain: "Натиҷа барои хулосаи боэътимод кофӣ нест. Андозагириро такрор кунед; нуқсонро тасдиқшуда ҳисоб накунед.",
  },
  hi: {
    normal: "ध्वनिक जाँच में कोई विचलन नहीं मिला। सामान्य अनिवार्य जाँचों के बाद निर्माता की निर्धारित प्रक्रिया का पालन करें।",
    anomaly: "ध्वनिक जाँच में विचलन मिला। नीचे केवल इस इंजन के लिए मैनुअल में प्रमाणित जाँच दी गई है।",
    check_failed: "माप जाँच में सफल नहीं हुआ। इस रिकॉर्ड से निदान नहीं किया गया। कोई दूसरा माप चुनें।",
    uncertain: "नतीजा निश्चित निष्कर्ष के लिए पर्याप्त नहीं है। माप दोहराएँ; खराबी को पुष्ट न मानें।",
  },
};

const citationCopy: Record<TranslationLanguage, string> = {
  en: "Technical procedures remain in the original Russian. Open the cited PDF page and verify the steps before use.",
  uz: "Texnik amallar rus tilidagi asl nusxada beriladi. Ishlatishdan oldin havoladagi PDF sahifasini ochib, bosqichlarni tekshiring.",
  tg: "Қадамҳои техникӣ ба забони аслии русӣ оварда мешаванд. Пеш аз истифода саҳифаи PDF-и истинодшударо кушода санҷед.",
  hi: "तकनीकी प्रक्रिया मूल रूसी में दिखाई जाती है। उपयोग से पहले उद्धृत PDF पृष्ठ खोलकर चरणों की पुष्टि करें।",
};

export function mechanicInstruction(language: Language, _engineModel: string, _anomalyCode: string, item: { text: string; translations?: Partial<Record<TranslationLanguage, string>>; stepKey?: string }) {
  return language === "ru" ? item.text : item.translations?.[language] || item.text;
}

export function MechanicLanguage({ status, engineModel, anomalyCode, recommendations, onOpenStep }: {
  status: Status;
  engineModel: string;
  anomalyCode?: string;
  recommendations: Reference[];
  onOpenStep?: (index: number) => void;
}) {
  const language = useSystemLanguage();
  return <section className="neuro-section" aria-label={t("Инструкции для механика", language)}>
    {language !== "ru" && <>
    <p>{statusCopy[language][status]}</p>
    {status === "anomaly" && (recommendations.length
      ? <ul>{recommendations.map((item, index) => <li key={item.text}>
        <p>{mechanicInstruction(language, engineModel, anomalyCode || "", item)}</p>
        {onOpenStep && <button type="button" onClick={() => onOpenStep(index)}>{t("Открыть этот шаг в плане работ", language)}</button>}
        <p><a href={item.url} target="_blank" rel="noreferrer">{item.manual}, {t("стр.", language)} {item.pdfPage} · {t("оригинал PDF", language)}</a></p>
        {item.excerpt && <details><summary>{t("Цитата из оригинала на русском", language)}</summary><p className="neuro-excerpt">{item.excerpt}</p></details>}
      </li>)}</ul>
      : <p>{language === "en" ? "No verified procedure for this fault and engine. Check the relevant manual section." : language === "uz" ? "Bu nosozlik kodi uchun tasdiqlangan ko‘rsatma topilmadi; PDF dagi tegishli bo‘limni mexanik bilan tekshiring." : language === "tg" ? "Барои ин рамзи нуқсон дастури тасдиқшуда ёфт нашуд; бахши мувофиқи PDF-ро бо механик санҷед." : "इस खराबी कोड के लिए प्रमाणित निर्देश नहीं मिला; मैनुअल का संबंधित भाग मैकेनिक के साथ जाँचें।"}</p>)}
    <p>{citationCopy[language]}</p>
    </>}
  </section>;
}
