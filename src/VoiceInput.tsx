import { useEffect, useRef, useState } from "react";
import { PButton } from "./BootstrapUI";
import { Mic, MicOff } from "lucide-react";
import "./ChatExperience.css";
import { useSystemLanguage, speechLocales } from "./systemLanguage";
import { translateSystemText } from "./systemTranslations";

type SpeechRecognitionResultLike = {
  isFinal: boolean;
  [index: number]: { transcript: string };
};

type SpeechRecognitionEventLike = {
  resultIndex: number;
  results: ArrayLike<SpeechRecognitionResultLike>;
};

type SpeechRecognitionErrorLike = { error: string };

type SpeechRecognitionLike = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onstart: (() => void) | null;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: SpeechRecognitionErrorLike) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
};

type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;

type SpeechWindow = Window & {
  SpeechRecognition?: SpeechRecognitionConstructor;
  webkitSpeechRecognition?: SpeechRecognitionConstructor;
};

type VoiceInputProps = {
  onTranscript: (text: string) => void;
  disabled?: boolean;
  mode?: "button" | "managed";
  active?: boolean;
  onStatus?: (status: string) => void;
  onListeningChange?: (listening: boolean) => void;
  language?: string;
};

export const isSpeechRecognitionAvailable = () => {
  if (typeof window === "undefined") return undefined;
  const speechWindow = window as SpeechWindow;
  return speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition;
};

const getErrorMessage = (error: string) => {
  let message: string;
  switch (error) {
    case "not-allowed":
    case "service-not-allowed":
      message = "Доступ к микрофону запрещён. Разрешите его в настройках браузера.";
      break;
    case "audio-capture":
      message = "Микрофон не найден или недоступен.";
      break;
    case "network":
      message = "Сетевая служба распознавания недоступна. Проверьте подключение.";
      break;
    case "no-speech":
      message = "Речь не распознана. Попробуйте ещё раз.";
      break;
    case "aborted":
      message = "Распознавание остановлено.";
      break;
    default:
      message = "Не удалось запустить распознавание речи. Попробуйте ещё раз.";
  }
  return message;
};

export default function VoiceInput({
  onTranscript,
  disabled = false,
  mode = "button",
  active = false,
  onStatus,
  onListeningChange,
  language: preferredLocale,
}: VoiceInputProps) {
  const systemLanguage = useSystemLanguage();
  const translate = (text: string) => translateSystemText(text, systemLanguage);
  const language = preferredLocale ?? speechLocales[systemLanguage];
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const finalizedResultsRef = useRef<Set<number>>(new Set());
  const onTranscriptRef = useRef(onTranscript);
  const errorRef = useRef(false);
  const [listening, setListening] = useState(false);
  const [status, setStatus] = useState("");
  const [interimTranscript, setInterimTranscript] = useState("");
  onTranscriptRef.current = onTranscript;
  const SpeechRecognition = isSpeechRecognitionAvailable();

  useEffect(() => { onStatus?.(status ? translate(status) : ""); }, [onStatus, status, systemLanguage]);

  useEffect(
    () => () => {
      const recognition = recognitionRef.current;
      recognitionRef.current = null;
      if (recognition) {
        recognition.onstart = null;
        recognition.onresult = null;
        recognition.onerror = null;
        recognition.onend = null;
        recognition.abort();
      }
    },
    [],
  );

  const startListening = () => {
    if (!SpeechRecognition || disabled || recognitionRef.current) return;

    const recognition = new SpeechRecognition();
    recognitionRef.current = recognition;
    finalizedResultsRef.current.clear();
    errorRef.current = false;
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = language;
    setInterimTranscript("");
    setStatus("Запрашиваем доступ к микрофону…");

    recognition.onstart = () => {
      setListening(true);
      onListeningChange?.(true);
      setStatus(mode === "managed" ? "Слушаю. Чтобы закончить, нажмите «Завершить разговор»." : "Слушаю. Нажмите «Остановить», когда закончите.");
    };
    recognition.onresult = (event) => {
      if (recognitionRef.current !== recognition) return;
      const interim: string[] = [];
      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        const result = event.results[index];
        const transcript = result[0]?.transcript?.trim();
        if (!transcript) continue;
        if (result.isFinal) {
          if (!finalizedResultsRef.current.has(index)) {
            finalizedResultsRef.current.add(index);
            onTranscriptRef.current(transcript);
          }
        } else {
          interim.push(transcript);
        }
      }
      setInterimTranscript(interim.join(" "));
    };
    recognition.onerror = (event) => {
      errorRef.current = true;
      onListeningChange?.(false);
      setInterimTranscript("");
      setStatus(getErrorMessage(event.error));
    };
    recognition.onend = () => {
      recognitionRef.current = null;
      setListening(false);
        onListeningChange?.(false);
      setInterimTranscript("");
      if (!errorRef.current) setStatus("Голосовой ввод остановлен.");
    };

    try {
      recognition.start();
    } catch {
      recognitionRef.current = null;
      onListeningChange?.(false);
      setStatus("Не удалось запустить микрофон. Попробуйте ещё раз.");
    }
  };

  const stopListening = () => {
    try {
      setStatus("Останавливаем распознавание…");
      recognitionRef.current?.stop();
    } catch {
      setStatus("Не удалось остановить распознавание.");
    }
  };

  useEffect(() => {
    if (mode !== "managed") return;
    if (active && !listening) startListening();
    if (!active && listening) stopListening();
  }, [active, listening, mode, disabled, language]);

  if (!SpeechRecognition || mode === "managed") {
    if (mode === "managed") return <p className="form-hint" role="status" aria-live="polite">{status ? translate(status) : (active ? "Слушаю команды." : "Нажмите, чтобы начать голосовое управление.")}{interimTranscript && ` Распознаётся: ${interimTranscript}`}</p>;
    return (
      <p className="form-hint" role="status">
        Голосовой ввод не поддерживается этим браузером. Можно ввести текст вручную.
      </p>
    );
  }

  return (
    <div>
      <PButton
        type="button"
        variant="secondary"
        className="voice-mic-button"
        aria-label={listening ? "Остановить голосовой ввод" : "Начать голосовой ввод"}
        aria-pressed={listening}
        disabled={disabled && !listening}
        onClick={listening ? stopListening : startListening}
      >
        {listening ? <MicOff size={17} aria-hidden="true" /> : <Mic size={17} aria-hidden="true" />}
        <span>{listening ? "Остановить" : "Голосовой ввод"}</span>
      </PButton>
      {status && <p className="form-hint" role="status" aria-live="polite">{translate(status)}</p>}
      {interimTranscript && (
        <p className="form-hint" aria-live="off">
          Распознаётся: {interimTranscript}
        </p>
      )}
    </div>
  );
}
