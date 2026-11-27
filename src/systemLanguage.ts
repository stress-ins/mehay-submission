import { useSyncExternalStore } from "react";
import type { MechanicLanguageCode } from "./neuroVoiceIntents";

export const systemLanguageNames: Record<MechanicLanguageCode, string> = {
  ru: "Русский", en: "English", hi: "हिन्दी", tg: "Тоҷикӣ", uz: "O‘zbekcha",
};
const storageKey = "mechanic-language";
const eventName = "mechanic-language-change";
export function getSystemLanguage(): MechanicLanguageCode {
  const value = window.localStorage.getItem(storageKey);
  return value && Object.hasOwn(systemLanguageNames, value) ? value as MechanicLanguageCode : "ru";
}
export function changeSystemLanguage(language: MechanicLanguageCode) {
  window.localStorage.setItem(storageKey, language);
  document.documentElement.lang = language;
  window.dispatchEvent(new CustomEvent(eventName, { detail: language }));
}
function subscribe(notify: () => void) {
  const onStorage = (event: StorageEvent) => { if (event.key === storageKey || event.key === null) notify(); };
  window.addEventListener(eventName, notify);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(eventName, notify);
    window.removeEventListener("storage", onStorage);
  };
}
export function useSystemLanguage() {
  return useSyncExternalStore(subscribe, getSystemLanguage, () => "ru" as const);
}

export const speechLocales: Record<MechanicLanguageCode, string> = { ru: "ru-RU", en: "en-US", hi: "hi-IN", tg: "tg-TJ", uz: "uz-UZ" };
