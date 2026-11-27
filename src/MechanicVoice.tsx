import { Mic, MicOff } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { PButton } from "./BootstrapUI";
import VoiceInput, { isSpeechRecognitionAvailable } from "./VoiceInput";
import { mechanicVoiceExamples, type MechanicLanguageCode } from "./neuroVoiceIntents";
import { useSystemLanguage } from "./systemLanguage";
import { translateNeuroDvs as t } from "./neuroDvsTranslations";
import "./MechanicVoice.css";

import { speechLocales as recognitionLanguage } from "./systemLanguage";

export type MechanicVoiceProps = {
  disabled: boolean;
  listening: boolean;
  onListeningChange: (active: boolean) => void;
  language: MechanicLanguageCode;
  onCommand: (text: string) => void;
};

export default function MechanicVoice({ disabled, listening, onListeningChange: setListening, language, onCommand }: MechanicVoiceProps) {
  const locale = useSystemLanguage();
  const [supported, setSupported] = useState(false);
  const [draft, setDraft] = useState("");
  const [phrases, setPhrases] = useState<string[]>([]);
  const draftRef = useRef<HTMLInputElement>(null);

  useEffect(() => setSupported(Boolean(isSpeechRecognitionAvailable())), []);
  useEffect(() => { if (disabled) setListening(false); }, [disabled]);

  function dispatch(text: string) {
    const phrase = text.trim();
    if (!phrase || disabled) return;
    setPhrases((items) => [phrase, ...items].slice(0, 4));
    onCommand(phrase);
  }

  function submitFallback(event: FormEvent) {
    event.preventDefault();
    dispatch(draft);
    setDraft("");
    draftRef.current?.focus();
  }

  return (
    <section className="mechanic-voice" aria-label={t("Голосовое управление механика", locale)}>
      <div className="mechanic-voice__heading">
        <div>
          <p className="mechanic-voice__eyebrow">{t("ГОЛОСОВОЙ ПУЛЬТ", locale)}</p>
          <h2>{t("Механик, говорите", locale)}</h2>
          <p className="mechanic-voice__intro">{t("Назовите действие или задайте вопрос. Каждая распознанная фраза сразу передаётся помощнику.", locale)}</p>
        </div>
        <span className={`mechanic-voice__state${listening ? " is-listening" : ""}`} role="status" aria-live="polite">
          <i aria-hidden="true" />{t(listening ? "Слушаю" : "Готов", locale)}
        </span>
      </div>

      {supported ? (
        <div className="mechanic-voice__controls">
          <PButton type="button" className="mechanic-voice__toggle" variant={listening ? "secondary" : "primary"} disabled={disabled} onClick={() => setListening(!listening)}>
            {listening ? <MicOff size={20}/> : <Mic size={20}/>}{t(listening ? "Завершить разговор" : "Начать голосовое управление", locale)}
          </PButton>
          <VoiceInput mode="managed" active={listening} disabled={disabled} language={recognitionLanguage[language]} onTranscript={dispatch} onListeningChange={setListening} />
        </div>
      ) : (
        <form className="mechanic-voice__fallback" onSubmit={submitFallback}>
          <label htmlFor="mechanic-voice-text">{t("Голосовой ввод недоступен. Введите команду или вопрос.", locale)}</label>
          <div>
            <input ref={draftRef} id="mechanic-voice-text" value={draft} maxLength={500} onChange={(event) => setDraft(event.target.value)} placeholder={t("Например: проверь историю ремонтов", locale)} disabled={disabled} />
            <PButton type="submit" className="mechanic-voice__send" variant="primary" disabled={disabled || !draft.trim()}>{t("Передать команду", locale)}</PButton>
          </div>
        </form>
      )}

      <div className="mechanic-voice__commands" aria-label={t("Примеры команд", locale)}>
        {mechanicVoiceExamples[language].map((example) => <button type="button" disabled={disabled} key={example} onClick={() => dispatch(example)}>{example}</button>)}
      </div>
      {phrases.length > 0 && (
        <ol className="mechanic-voice__history" aria-label={t("Последние распознанные команды", locale)} aria-live="polite">
          {phrases.map((phrase, index) => <li key={`${phrase}-${index}`}>{phrase}</li>)}
        </ol>
      )}
    </section>
  );
}
