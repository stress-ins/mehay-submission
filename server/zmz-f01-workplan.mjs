const MANUAL_ID = "zmz-40904-40905";
const SOURCE_SHA256 = "99cf64334c578d668ce67bc4c9a1d7b0bb1e9c59ddac982b6061ea18533a7147";

function contains(page, pattern) {
  return pattern.test(page?.replace(/\r/gu, "") || "");
}

function evidence(page, pattern) {
  const text = page?.replace(/\r/gu, "") || "";
  return text.match(pattern)?.[0]?.trim() || "";
}

export function zmzF01Workplan(manual, getPageText) {
  if (manual?.id !== MANUAL_ID || manual.sha256 !== SOURCE_SHA256 ||
    !manual.engineKeys?.some((key) => key.toLocaleLowerCase("ru") === "змз-40905.10")) return [];

  const page142 = getPageText(MANUAL_ID, 142) || "";
  const page143 = getPageText(MANUAL_ID, 143) || "";
  const page114 = getPageText(MANUAL_ID, 114) || "";
  const page136 = getPageText(MANUAL_ID, 136) || "";
  const page186 = getPageText(MANUAL_ID, 186) || "";
  const page187 = getPageText(MANUAL_ID, 187) || "";

  const warmupEvidence = evidence(page142, /80…90\s*[°º]?\s*С/u);
  const operatingEvidence = evidence(page142, /3…4\s*мин/u);
  const variableEvidence = evidence(page143, /2000…3000\s*об\/мин/u);
  const listeningEvidence = evidence(page143, /15…30\s*с/u);
  const retryEvidence = evidence(page143, /5\s*раз/u);
  const localizationEvidence = evidence(page143, /источник\s+стука/iu);
  const disconnectEvidence = evidence(page136, /провода\s+и\s+шланги/iu);
  const hosesEvidence = evidence(page114, /вентиляции\s+картера/iu);
  const torqueEvidence = evidence(page186, /6,9\s*\.\.\.\s*8,8\s*Н·м/u);
  const diagramEvidence = evidence(page187, /Рис\.147/u);

  if (!warmupEvidence || !operatingEvidence || !variableEvidence || !listeningEvidence || !contains(page142, /30\s*мин/u) ||
    !contains(page142, /2500\s*об\/мин/u) || !contains(`${page142}\n${page143}`, /2000…3000\s*об\/мин/u) ||
    !contains(`${page142}\n${page143}`, /15…30\s*с/u) || !retryEvidence || !contains(page143, /15\s*мин/u) ||
    !contains(page143, /2000…3000\s*об\/мин/u) || !localizationEvidence || !disconnectEvidence ||
    !hosesEvidence || !torqueEvidence || !contains(page186, /рис\.147/iu) ||
    !diagramEvidence || !contains(page187, /крышки\s+клапанов/iu)) return [];

  const ref = { engineModel: "ЗМЗ-40905.10", anomalyType: "F01", manualId: MANUAL_ID };
  const step = (stepKey, title, text, quote, pdfPage, extra = {}) => ({
    ...ref, stepKey, title, text, quote, pdfPage,
    translations: { en: extra.english },
    ...extra,
  });
  return [
    step("zmz_f01_warmup", "Проверить после прогрева", "Доведите охлаждающую жидкость до 80–90 °C. Если стук сохраняется дольше 30 минут после достижения этой температуры, переходите к проверке.", warmupEvidence, 142, { english: "Warm the engine until coolant reaches 80–90 °C. If the noise persists for more than 30 minutes at that temperature, continue with the check." }),
    step("zmz_f01_operating_cycle", "Выполнить контрольный режим", "Установите постоянные 2500 об/мин на 3–4 минуты.", operatingEvidence, 142, { english: "Run at a steady 2,500 rpm for 3–4 minutes." }),
    step("zmz_f01_variable_cycle", "Проверить переменный режим", "Вместо постоянной частоты меняйте обороты в пределах 2000–3000 об/мин в течение контрольного режима.", variableEvidence, 143, { english: "As an alternative, vary engine speed between 2,000 and 3,000 rpm during the check cycle." }),
    step("zmz_f01_listen_idle", "Прослушать двигатель на холостом ходу", "После контрольного режима прослушивайте двигатель на холостом ходу 15–30 секунд.", listeningEvidence, 143, { english: "After the check cycle, listen to the engine at idle for 15–30 seconds." }),
    step("zmz_f01_retry_cycle", "Повторить контрольный цикл", "Если стук не прекратился, повторите контрольный цикл до пяти раз.", retryEvidence, 143, { english: "If the noise continues, repeat the check cycle up to five times." }),
    step("zmz_f01_localize_source", "Определить источник стука", "Если после контрольных циклов стук сохраняется, выполните дополнительный 15-минутный режим при 2000–3000 об/мин, прослушайте двигатель на холостом ходу 15–30 секунд и определите источник стука.", localizationEvidence, 143, { english: "If the noise remains after the check cycles, run for another 15 minutes at 2,000–3,000 rpm, listen at idle for 15–30 seconds, and locate the source." }),
    step("zmz_f01_disconnect", "Подготовить крышку к снятию", "После определения источника перед снятием крышки клапанов отсоедините провода и шланги.", disconnectEvidence, 136, { english: "After locating the source, disconnect the wires and hoses before removing the valve cover." }),
    step("zmz_f01_ventilation", "Снять шланги вентиляции картера", "Снимите шланги и трубки вентиляции картера.", hosesEvidence, 114, { english: "Remove the crankcase ventilation hoses and tubes." }),
    step("zmz_f01_reassemble", "Установить крышку клапанов", "Установите крышку с прокладкой и уплотнителями. Затяните болты моментом 6,9–8,8 Н·м по последовательности рисунка 147.", torqueEvidence, 186, { english: "Install the valve cover with its gasket and seals. Tighten the bolts to 6.9–8.8 N·m in the sequence shown in Figure 147.", illustrationUrl: `/api/manuals/${MANUAL_ID}/pages/187.png`, illustrationPage: 187, illustrationCaption: diagramEvidence }),
  ].map(({ english, ...result }) => result);
}
