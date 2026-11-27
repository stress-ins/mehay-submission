import { Languages } from "lucide-react";
import { changeSystemLanguage, systemLanguageNames, useSystemLanguage } from "./systemLanguage";
import type { MechanicLanguageCode } from "./neuroVoiceIntents";

const labels = { ru: "Язык интерфейса", en: "Interface language", hi: "इंटरफ़ेस की भाषा", tg: "Забони интерфейс", uz: "Interfeys tili" };
export default function SystemLanguagePicker() {
  const language = useSystemLanguage();
  return <label className="system-language" title={labels[language]}>
    <Languages size={18} aria-hidden="true" />
    <select value={language} aria-label={labels[language]} onChange={(event) => changeSystemLanguage(event.target.value as MechanicLanguageCode)}>
      {Object.entries(systemLanguageNames).map(([code, name]) => <option key={code} value={code} lang={code}>{name}</option>)}
    </select>
  </label>;
}
