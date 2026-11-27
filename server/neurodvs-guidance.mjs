import { readFileSync } from "node:fs";
import path from "node:path";
import { knowledgeDirectory, getManuals, manualById, manualPageText } from "./manuals.mjs";

function readGuidance(directory) {
  try {
    const data = JSON.parse(readFileSync(path.join(directory, "guidance.json"), "utf8"));
    return Array.isArray(data.guidance) ? data.guidance : [];
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw error;
  }
}

export function createGuidanceRepository(records, { manuals, getManualById, getPageText }) {
  const catalog = new Set(manuals.map(({ id }) => id));
  const manualProcedures = [];
  function validate(item) {
    const manual = getManualById(item.manualId);
    const page = getPageText(item.manualId, item.pdfPage);
    if (typeof item.engineModel !== "string" || typeof item.anomalyType !== "string" || !catalog.has(item.manualId) ||
      !Number.isSafeInteger(item.pdfPage) || item.pdfPage < 1 || typeof item.text !== "string" || !item.text.trim() ||
      typeof item.quote !== "string" || !item.quote.trim() || !manual?.engineKeys.includes(item.engineModel.toLocaleLowerCase("ru")) ||
      (item.translations != null && (typeof item.translations !== "object" || Array.isArray(item.translations) ||
        Object.entries(item.translations).some(([language, text]) => !["en", "hi", "tg", "uz"].includes(language) || typeof text !== "string" || !text.trim()))) ||
      typeof page !== "string" || !page.toLocaleLowerCase("ru").replace(/\s+/gu, " ").includes(item.quote.toLocaleLowerCase("ru").replace(/\s+/gu, " "))) {
      throw new Error(`Invalid verified guidance entry: ${item?.engineModel}/${item?.anomalyType}`);
    }
  }
  for (const manual of manuals) {
    if (!Array.isArray(manual.procedures)) continue;
    for (const item of manual.procedures) {
      // A procedure is approved only for the exact PDF indexed with it.
      if (!manual.sha256 || item?.sourceSha256 !== manual.sha256) continue;
      validate(item);
      if (!Array.isArray(item.procedure) || !item.procedure.length) throw new Error("Invalid workshop procedure");
      for (const step of item.procedure) {
        if (typeof step?.title !== "string" || !step.title.trim()) throw new Error("Missing workshop step title");
        validate({ ...step, engineModel: item.engineModel, anomalyType: item.anomalyType });
      }
      manualProcedures.push(item);
    }
  }
  for (const item of records) {
    validate(item);
    if (item.procedure === undefined) continue;
    if (!Array.isArray(item.procedure) || !item.procedure.length) throw new Error("Invalid workshop procedure");
    for (const step of item.procedure) {
      if (typeof step?.title !== "string" || !step.title.trim()) throw new Error("Missing workshop step title");
      validate({ ...step, engineModel: item.engineModel, anomalyType: item.anomalyType });
    }
  }
  function evidence(item) {
    const manual = getManualById(item.manualId);
    return { ...(item.stepKey ? { stepKey: item.stepKey } : {}), ...(item.operationKind ? { operationKind: item.operationKind } : {}), text: item.text, ...(item.translations ? { translations: item.translations } : {}),
      manual: manual.title, pdfPage: item.pdfPage, url: `/api/manuals/${encodeURIComponent(item.manualId)}.pdf#page=${item.pdfPage}`, excerpt: item.quote };
  }
  const mergedRecords = records.map((item) => {
    const matches = manualProcedures.filter((procedure) => procedure.engineModel === item.engineModel &&
      procedure.anomalyType === item.anomalyType && procedure.manualId === item.manualId);
    return matches.length ? { ...item, procedure: [...(item.procedure || []), ...matches.flatMap(({ procedure }) => procedure)] } : item;
  });
  for (const procedure of manualProcedures) {
    if (!records.some((item) => item.engineModel === procedure.engineModel && item.anomalyType === procedure.anomalyType && item.manualId === procedure.manualId)) {
      mergedRecords.push(procedure);
    }
  }
  for (const item of mergedRecords) {
    validate(item);
    if (item.procedure === undefined) continue;
    if (!Array.isArray(item.procedure) || !item.procedure.length) throw new Error("Invalid workshop procedure");
    for (const step of item.procedure) {
      if (typeof step?.title !== "string" || !step.title.trim()) throw new Error("Missing workshop step title");
      validate({ ...step, engineModel: item.engineModel, anomalyType: item.anomalyType });
    }
  }
  function recommendationsFor(vehicle, diagnosis) {
    return mergedRecords.filter(({ engineModel, anomalyType }) => engineModel === vehicle.engine_model && anomalyType === diagnosis.anomaly_type)
      .map(item => ({ ...evidence(item), ...(item.procedure ? { procedure: item.procedure.map(step => ({ ...evidence(step), title: step.title })) } : {}) }));
  }
  return { recommendationsFor };
}

const manuals = getManuals();
const verifiedGuidance = manuals.length ? readGuidance(knowledgeDirectory) : [];
const repository = createGuidanceRepository(verifiedGuidance, { manuals, getManualById: manualById, getPageText: manualPageText });
export { verifiedGuidance };
export const recommendationsFor = repository.recommendationsFor;
export const isRepairOperation = (item) => item?.operationKind === "repair" || (item?.operationKind == null && item?.stepKey === "adjust");
