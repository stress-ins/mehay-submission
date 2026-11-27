import { createHash, randomUUID } from "node:crypto";
import { isRepairOperation, recommendationsFor } from "./neurodvs-guidance.mjs";
import { repairExperience } from "./repair-experience.mjs";
import { mountNeuroToolRouter } from "./neuro-tool-router.mjs";
import { fleet } from "./neurodvs-data.mjs";

const isInspectionOperation = (item) => item?.operationKind === "inspection";

const vehicles = new Map(fleet.map((vehicle) => [vehicle.vehicle_id, vehicle]));
const statuses = new Set(["normal", "anomaly", "check_failed"]);
const validId = (value) => typeof value === "string" && value.length > 0 && value.length <= 64;
const validText = (value, max = 1000) => typeof value === "string" && value.trim().length > 0 && value.length <= max;
const confidenceThreshold = 0.55;

function validDiagnosis(value, vehicleId, sessionId) {
  const common = value && value.vehicle_id === vehicleId && value.session_id === sessionId && statuses.has(value.status) &&
    (value.confidence === null || (typeof value.confidence === "number" && value.confidence >= 0 && value.confidence <= 1)) &&
    (value.anomaly_score === null || (typeof value.anomaly_score === "number" && value.anomaly_score >= 0 && value.anomaly_score <= 1)) &&
    ["good", "warning", "bad"].includes(value.signal_quality) && typeof value.description === "string";
  if (!common) return false;
  if (value.status === "anomaly") return /^F(0[1-9]|1[0-4])$/.test(value.anomaly_type || "") && validText(value.anomaly_title, 200);
  if (value.status === "normal") return value.anomaly_type === null && value.anomaly_title === null;
  return value.anomaly_type === null && value.anomaly_title === null && value.anomaly_score === null && value.confidence === null;
}

const warningHash = (value) => createHash("sha256").update(JSON.stringify(value)).digest("hex");

function compatibilityConflict(vehicle, value) {
  const expectedFuel = value.anomaly_type === "F08" ? "дизель" : value.anomaly_type === "F13" ? "бензин" : null;
  const actualFuel = String(vehicle?.fuel || "").toLocaleLowerCase("ru");
  return Boolean(expectedFuel && ["дизель", "бензин"].includes(actualFuel) && actualFuel !== expectedFuel);
}

export function publicDiagnosis(value, vehicle, warningAcknowledged = false) {
  const lowConfidence = value.status === "anomaly" && (value.confidence === null || value.confidence < confidenceThreshold);
  const uncertainNormal = value.status === "normal" && (value.confidence === null || value.confidence < confidenceThreshold);
  const urgency = value.anomaly_score === null ? null : value.anomaly_score >= 0.85 ? "high" : value.anomaly_score < 0.65 ? "low" : "medium";
  const confidencePercent = value.confidence === null ? null : Math.round(value.confidence * 100);
  const confidence = { value: value.confidence, percent: confidencePercent, threshold: confidenceThreshold, thresholdPercent: Math.round(confidenceThreshold * 100), label: confidencePercent === null ? "не определена" : value.confidence >= confidenceThreshold ? "достаточная" : "ниже порога" };
  const quality = { value: value.signal_quality, label: ({ good: "хорошее", warning: "требует подтверждения", bad: "непригодное" })[value.signal_quality] };
  let guidance;
  if (value.signal_quality === "bad") guidance = { status: "stop", message: "Стоп: качество сигнала плохое. Не используйте этот результат для решения о работе машины; повторите измерение.", recommendations: [], canCreateTicket: false, nextAction: "repeat_measurement" };
  else if (value.status === "check_failed") guidance = { status: "check_failed", message: "Запись непригодна для диагностики. Повторите измерение; вывод о двигателе не сделан.", recommendations: [], canCreateTicket: false, nextAction: "repeat_measurement" };
  else if (value.status === "anomaly" && compatibilityConflict(vehicle, value)) guidance = { status: "model_conflict", message: `Ошибка модели: код ${value.anomaly_type} (${value.anomaly_title}) не соответствует топливу «${vehicle?.fuel || "не указано"}» двигателя ${vehicle?.engine_model || "неизвестно"}. Повторно проверьте выбранную машину и замер; при сохранении конфликта передайте двигатель на дефектовку.`, recommendations: [], canCreateTicket: false, ticketBlockReason: "model_code_conflict", risk: "unknown", urgency: null, nextAction: "repeat_or_defectoscopy" };
  else if (uncertainNormal) guidance = { status: "uncertain", message: "Запись имеет низкую уверенность. Повторите измерение; заключение о норме не подтверждено.", recommendations: [], canCreateTicket: false, nextAction: "repeat_measurement" };
  else if (lowConfidence) guidance = { status: "uncertain", message: "Результат имеет низкую уверенность. Повторите запись; диагноз и заявка пока не подтверждены.", recommendations: [], canCreateTicket: false, nextAction: "repeat_measurement" };
  else if (value.signal_quality === "warning" && !warningAcknowledged) guidance = { status: "warning_confirmation_required", message: "Качество сигнала требует внимания. Проверьте установку датчика и результат; подтвердите продолжение осознанно либо повторите замер.", recommendations: [], canCreateTicket: false, warningAcknowledgementRequired: true, nextAction: "acknowledge_warning_or_repeat" };
  else if (value.status === "normal") guidance = { status: "normal", message: "Акустическая диагностика не выявила отклонений. После обычных обязательных проверок продолжайте эксплуатацию по штатному регламенту.", recommendations: [], canCreateTicket: false, nextAction: "routine_checks" };
  else if (value.status === "anomaly" && urgency === null) guidance = { status: "uncertain", message: "Отклонение обнаружено, но оценка риска не получена. Уточните результат измерения; автоматическая заявка недоступна.", risk: "unknown", urgency: null, recommendations: [], canCreateTicket: false };
  else guidance = { status: "anomaly", message: `Обнаружено отклонение: ${value.anomaly_title} (${value.anomaly_type}). Проверьте подтверждённые руководством процедуры для двигателя этого ТС.`, risk: urgency, urgency, recommendations: [], canCreateTicket: true };
  return { diagnosis: value, confidence, quality, guidance: { ...guidance, confidence, quality, warningAcknowledged: value.signal_quality === "warning" && warningAcknowledged } };
}

function isConnectionRefused(error) {
  for (let current = error; current; current = current.cause) {
    if (current.code === "ECONNREFUSED") return true;
  }
  return false;
}

const sessionView = (vehicle, session) => {
  const { session_id, checked_at, status, anomaly_type, anomaly_title, anomaly_score, confidence, signal_quality } = session;
  const model_conflict = compatibilityConflict(vehicle, session);
  const reliable = !model_conflict && status !== "check_failed" && signal_quality === "good" &&
    confidence >= confidenceThreshold && typeof anomaly_score === "number";
  return { session_id, checked_at, status, anomaly_type, anomaly_title, anomaly_score, confidence, signal_quality, reliable, model_conflict };
};

function measurementPriority(latest) {
  if (!latest?.reliable) return "attention";
  if (latest.status === "normal") return "normal";
  return latest.status === "anomaly" && latest.anomaly_score >= 0.85 ? "quarantine" : "attention";
}

export function vehicleMeasurementPriority(vehicle) {
  const latest = vehicle.sessions.reduce((last, item) => !last || item.checked_at > last.checked_at ? item : last, null);
  return latest ? measurementPriority(sessionView(vehicle, latest)) : null;
}

export function mountNeuroDvs(app, { db, manualSearch, recommendationsFor: getRecommendations = recommendationsFor, fetchImpl = fetch, mlUrl = process.env.MOCK_ML_URL || "http://127.0.0.1:8001", toirUrl = process.env.MOCK_TOIR_URL || "http://127.0.0.1:8002", timeoutMs = 5000 } = {}) {
  db.exec(`CREATE TABLE IF NOT EXISTS neuro_diagnoses(vehicle_id TEXT NOT NULL, session_id TEXT NOT NULL, result TEXT NOT NULL, created_at TEXT NOT NULL, revision TEXT NOT NULL DEFAULT '', PRIMARY KEY(vehicle_id,session_id));
    CREATE TABLE IF NOT EXISTS neuro_conversation(owner TEXT NOT NULL, vehicle TEXT NOT NULL, session TEXT NOT NULL, id TEXT NOT NULL, question TEXT NOT NULL, answer TEXT NOT NULL, evidence TEXT NOT NULL, team_visible INTEGER NOT NULL DEFAULT 0, manual_verified INTEGER NOT NULL DEFAULT 0, PRIMARY KEY(owner,vehicle,session,id));
    CREATE TABLE IF NOT EXISTS neuro_vehicle_assignments(vehicle TEXT NOT NULL, user_id TEXT NOT NULL, assigned_at TEXT NOT NULL, PRIMARY KEY(vehicle,user_id));
    CREATE TABLE IF NOT EXISTS neuro_tickets(vehicle_id TEXT NOT NULL, session_id TEXT NOT NULL, state TEXT NOT NULL, result TEXT, updated_at TEXT NOT NULL, PRIMARY KEY(vehicle_id,session_id));
    CREATE TABLE IF NOT EXISTS neuro_diagnosis_acknowledgements(vehicle_id TEXT NOT NULL, session_id TEXT NOT NULL, result_hash TEXT NOT NULL, acknowledged_at TEXT NOT NULL, PRIMARY KEY(vehicle_id,session_id));
    CREATE TABLE IF NOT EXISTS neuro_ticket_previews(token TEXT PRIMARY KEY, vehicle_id TEXT NOT NULL, session_id TEXT NOT NULL, snapshot TEXT NOT NULL, expires_at TEXT NOT NULL);`);
  if (!db.prepare("PRAGMA table_info(neuro_diagnoses)").all().some((column) => column.name === "revision")) db.exec("ALTER TABLE neuro_diagnoses ADD COLUMN revision TEXT NOT NULL DEFAULT ''");
  if (!db.prepare("PRAGMA table_info(neuro_conversation)").all().some((column) => column.name === "team_visible")) db.exec("ALTER TABLE neuro_conversation ADD COLUMN team_visible INTEGER NOT NULL DEFAULT 0");
  if (!db.prepare("PRAGMA table_info(neuro_conversation)").all().some(column => column.name === "manual_verified")) db.exec("ALTER TABLE neuro_conversation ADD COLUMN manual_verified INTEGER NOT NULL DEFAULT 0");
  const hasUsersTable = Boolean(db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='users'").get());
  const getJson = async (url, body) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetchImpl(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal: controller.signal });
      const json = await response.json().catch(() => null);
      return { response, json };
    } finally { clearTimeout(timer); }
  };
  const acknowledged = (vehicleId, sessionId, result) => db.prepare("SELECT result_hash FROM neuro_diagnosis_acknowledgements WHERE vehicle_id=? AND session_id=?").get(vehicleId, sessionId)?.result_hash === warningHash(result);
  const assess = (vehicle, diagnosis) => {
    const result = publicDiagnosis(diagnosis, vehicle, acknowledged(vehicle.vehicle_id, diagnosis.session_id, diagnosis));
    if (result.guidance.canCreateTicket) {
      result.guidance.recommendations = getRecommendations(vehicle, diagnosis).map(item => isRepairOperation(item) ? { ...item, operationKind: "repair" } : item);
      if (!result.guidance.recommendations.length) {
        result.guidance.message = "Отклонение акустически подтверждено, но руководство не содержит проверенной операции с цитируемой страницей для этого двигателя и кода. Передайте двигатель на дефектовку механику; заявка ТОиР без источника не создана.";
        result.guidance.canCreateTicket = false;
        result.guidance.ticketBlockReason = "manual_evidence_required";
      } else if (!result.guidance.recommendations.some(isRepairOperation)) {
        result.guidance.message += " Проверки выполняйте на месте; рекомендация доступна для отдельной заявки на дефектовку, без ремонта и запчастей.";
        result.guidance.canCreateTicket = false;
        result.guidance.ticketBlockReason = "repair_operation_required";
        result.guidance.nextAction = "perform_check_on_vehicle";
      }
      result.guidance.canCreateDefectoscopyTicket = result.guidance.recommendations.some(isInspectionOperation);
    }
    return result;
  };

  const fleetView = () => fleet.map(({ sessions, ...vehicle }) => ({
    ...vehicle,
    sessions: [...sessions].sort((a, b) => b.checked_at.localeCompare(a.checked_at)).slice(0, 5).map((session) => sessionView(vehicle, session)),
  }));
  app.get("/api/neuro/fleet", (_req, res) => res.set("Cache-Control", "no-store").json({ vehicles: fleetView() }));
  app.get("/api/neuro/summary", (_req, res) => {
    const rows = fleetView().map((vehicle) => {
      const latest = vehicle.sessions[0];
      const reliable = latest.reliable;
      const status = measurementPriority(latest);
      const reason = status === "normal" ? "Последнее надёжное акустическое измерение не выявило отклонений."
        : status === "quarantine" ? `Надёжное измерение выявило ${latest.anomaly_type} с оценкой ${latest.anomaly_score}; требуется решение механика о допуске.`
        : latest.status === "check_failed" ? "Последнее измерение не прошло проверку качества; требуется повторная запись."
          : latest.model_conflict ? "Код неисправности не соответствует двигателю. Проверьте машину и повторите замер."
          : !reliable ? "Последнее измерение не подтверждено по качеству, уверенности или оценке риска."
            : `Последнее измерение выявило ${latest.anomaly_type}; требуется осмотр механика.`;
      return { vehicle_id: vehicle.vehicle_id, model: vehicle.model, engine_model: vehicle.engine_model,
        status, reason, session_id: latest.session_id, checked_at: latest.checked_at,
        anomaly_type: latest.anomaly_type, anomaly_score: latest.anomaly_score,
        confidence: latest.confidence, signal_quality: latest.signal_quality };
    });
    const rank = { quarantine: 0, attention: 1, normal: 2 };
    const priorityVehicles = rows.filter((row) => row.status !== "normal").sort((a, b) => rank[a.status] - rank[b.status] || (b.anomaly_score ?? -1) - (a.anomaly_score ?? -1) || b.checked_at.localeCompare(a.checked_at));
    const summary = { normal: rows.filter((row) => row.status === "normal").length,
      attention: rows.filter((row) => row.status === "attention").length,
      quarantine: rows.filter((row) => row.status === "quarantine").length };
    res.set("Cache-Control", "no-store").json({ summary, priorityVehicles });
  });

  const conversationRoute = "/api/neuro/vehicles/:vehicleId/sessions/:sessionId/conversation";
  app.all(conversationRoute, (req, res, next) => {
    if (!req.user?.id) return res.status(401).json({ error: "authentication_required" });
    const { vehicleId, sessionId } = req.params;
    if (!vehicles.get(vehicleId)?.sessions.some(item => item.session_id === sessionId)) {
      return res.status(404).json({ error: "vehicle_or_session_not_found" });
    }
    res.set("Cache-Control", "no-store");
    next();
  });
  app.get(conversationRoute, (req, res) => {
    const assigned = hasUsersTable && Boolean(db.prepare("SELECT 1 FROM neuro_vehicle_assignments a JOIN users u ON u.id=a.user_id WHERE a.vehicle=? AND a.user_id=? AND u.role='mechanic' AND u.active=1").get(req.params.vehicleId, req.user.id));
    const exchanges = db.prepare(`SELECT c.id,c.session AS sessionId,c.question,c.answer,c.evidence,c.manual_verified,c.owner AS authorId,${hasUsersTable ? "u.username" : "''"} AS authorLogin,${hasUsersTable ? "u.display_name" : "''"} AS authorDisplayName
      FROM neuro_conversation c ${hasUsersTable ? "LEFT JOIN users u ON u.id=c.owner" : ""}
      WHERE c.vehicle=? AND (c.owner=? OR (?=1 AND c.team_visible=1)) ORDER BY c.rowid DESC LIMIT 50`)
      .all(req.params.vehicleId, req.user.id, Number(assigned)).reverse().map(row => ({
        id: row.id, sessionId: row.sessionId, question: row.question, answer: row.answer,
        manualVerified: Boolean(row.manual_verified), evidence: row.manual_verified ? JSON.parse(row.evidence) : [], author: { userId: row.authorId, login: row.authorLogin || "", displayName: row.authorDisplayName || "" },
      }));
    res.json({ exchanges });
  });
  function storeExchange(owner, vehicleId, sessionId, { id, question, answer, evidence }, manualVerified) {
    const sources = JSON.stringify(evidence.map(({ manual, text, pdfPage, url }) => ({ manual, text, pdfPage, url })));
    const key = [owner, vehicleId, sessionId, id];
    const teamVisible = Number(hasUsersTable && Boolean(db.prepare("SELECT 1 FROM neuro_vehicle_assignments a JOIN users u ON u.id=a.user_id WHERE a.vehicle=? AND a.user_id=? AND u.role='mechanic' AND u.active=1").get(vehicleId, owner)));
    const inserted = db.prepare("INSERT INTO neuro_conversation(owner,vehicle,session,id,question,answer,evidence,team_visible,manual_verified) VALUES(?,?,?,?,?,?,?,?,?) ON CONFLICT DO NOTHING")
      .run(...key, question, answer, sources, teamVisible, Number(manualVerified));
    if (!inserted.changes) {
      const old = db.prepare("SELECT question,answer,evidence FROM neuro_conversation WHERE owner=? AND vehicle=? AND session=? AND id=?").get(...key);
      if (old.question !== question || old.answer !== answer || old.evidence !== sources) return 409;
    }
    return inserted.changes ? 201 : 200;
  }
  app.post(conversationRoute, (req, res) => {
    const { id, question, answer, evidence } = req.body || {};
    if (typeof id !== "string" || !/^[0-9a-f-]{36}$/i.test(id) || !validText(question, 1000) || !validText(answer, 24000) ||
        !Array.isArray(evidence) || evidence.length > 16 || !evidence.every(item => item && validText(item.manual, 500) &&
          validText(item.text, 6000) && Number.isSafeInteger(item.pdfPage) && item.pdfPage > 0 &&
          typeof item.url === "string" && /^\/api\/manuals\/[a-zA-Z0-9_%-]+\.pdf#page=\d+$/.test(item.url) && item.url.endsWith("#page=" + item.pdfPage))) {
      return res.status(400).json({ error: "invalid_exchange" });
    }
    const status = storeExchange(req.user.id, req.params.vehicleId, req.params.sessionId, { id, question, answer, evidence }, false);
    if (status === 409) return res.status(409).json({ error: "exchange_conflict" });
    res.status(status).json({ id });
  });

  app.get("/api/neuro/history", (req, res) => {
    const vehicleId = req.query.vehicleId;
    if (!validId(vehicleId)) return res.status(400).json({ error: "invalid_request" });
    const vehicle = vehicles.get(vehicleId);
    if (!vehicle) return res.status(404).json({ error: "vehicle_not_found" });
    const diagnoses = db.prepare("SELECT session_id, result, created_at FROM neuro_diagnoses WHERE vehicle_id=? ORDER BY created_at DESC LIMIT 100").all(vehicleId).map((row) => {
      const result = JSON.parse(row.result);
      return { session_id: row.session_id, created_at: row.created_at, status: result.status,
        anomaly_type: result.anomaly_type, anomaly_title: result.anomaly_title, anomaly_score: result.anomaly_score,
        confidence: result.confidence, signal_quality: result.signal_quality };
    });
    const tickets = db.prepare("SELECT session_id, result, updated_at FROM neuro_tickets WHERE vehicle_id=? AND state='created' ORDER BY updated_at DESC LIMIT 100").all(vehicleId).map((row) => {
      const result = JSON.parse(row.result);
      return { ticket_id: result.ticket_id, session_id: row.session_id, created_at: row.updated_at,
        anomaly_type: result.payload.anomaly_type, urgency: result.payload.urgency };
    });
    res.set("Cache-Control", "no-store").json({ vehicleId,
      checks: [...vehicle.sessions].sort((a, b) => b.checked_at.localeCompare(a.checked_at)).slice(0, 5).map((session) => sessionView(vehicle, session)),
      diagnoses, tickets });
  });

  mountNeuroToolRouter(app);

  app.post("/api/neuro/diagnose", async (req, res) => {
    const { vehicleId, sessionId } = req.body || {};
    if (!validId(vehicleId) || !validId(sessionId)) return res.status(400).json({ error: "invalid_request" });
    const vehicle = vehicles.get(vehicleId);
    if (!vehicle || !vehicle.sessions.some((session) => session.session_id === sessionId)) return res.status(404).json({ error: "vehicle_or_session_not_found" });
    try {
      const { response, json } = await getJson(`${mlUrl.replace(/\/$/, "")}/diagnose`, { vehicle_id: vehicleId, session_id: sessionId });
      if (response.status === 404) return res.status(404).json({ error: "vehicle_or_session_not_found" });
      if (!response.ok || !validDiagnosis(json, vehicleId, sessionId)) return res.status(502).json({ error: "diagnostic_service_failure" });
      db.prepare("INSERT INTO neuro_diagnoses(vehicle_id,session_id,result,created_at,revision) VALUES(?,?,?,?,?) ON CONFLICT(vehicle_id,session_id) DO UPDATE SET result=excluded.result, created_at=excluded.created_at, revision=excluded.revision").run(vehicleId, sessionId, JSON.stringify(json), new Date().toISOString(), randomUUID());
      const result = assess(vehicle, json);
      res.set("Cache-Control", "no-store").json({ ...result, resultHash: warningHash(json), vehicle: { vehicle_id: vehicle.vehicle_id, engine_model: vehicle.engine_model } });
    } catch {
      res.status(502).json({ error: "diagnostic_service_unavailable" });
    }
  });

  app.post("/api/neuro/diagnosis/acknowledge", (req, res) => {
    const { vehicleId, sessionId, resultHash, confirmed } = req.body || {};
    if (!validId(vehicleId) || !validId(sessionId) || !/^[a-f0-9]{64}$/i.test(resultHash || "") || confirmed !== true) return res.status(400).json({ error: "explicit_confirmation_required" });
    const vehicle = vehicles.get(vehicleId);
    const saved = db.prepare("SELECT result,revision FROM neuro_diagnoses WHERE vehicle_id=? AND session_id=?").get(vehicleId, sessionId);
    if (!vehicle || !saved) return res.status(409).json({ error: "diagnosis_required" });
    const diagnosis = JSON.parse(saved.result);
    if (warningHash(diagnosis) !== resultHash) return res.status(409).json({ error: "diagnosis_changed_before_acknowledgement" });
    if (diagnosis.signal_quality !== "warning") return res.status(409).json({ error: "warning_acknowledgement_not_applicable" });
    if (diagnosis.confidence === null || diagnosis.confidence < confidenceThreshold || diagnosis.status === "check_failed" || compatibilityConflict(vehicle, diagnosis)) return res.status(409).json({ error: "diagnosis_requires_repeat_or_review" });
    db.prepare("INSERT INTO neuro_diagnosis_acknowledgements(vehicle_id,session_id,result_hash,acknowledged_at) VALUES(?,?,?,?) ON CONFLICT(vehicle_id,session_id) DO UPDATE SET result_hash=excluded.result_hash,acknowledged_at=excluded.acknowledged_at").run(vehicleId, sessionId, warningHash(diagnosis), new Date().toISOString());
    return res.set("Cache-Control", "no-store").json({ ...assess(vehicle, diagnosis), resultHash });
  });

  app.post("/api/neuro/tickets/preview", (req, res) => {
    const { vehicleId, sessionId, urgency, operations, historicalPart, purpose = "repair" } = req.body || {};
    if (Object.keys(req.body || {}).some((key) => !["vehicleId", "sessionId", "urgency", "operations", "historicalPart", "purpose"].includes(key))) return res.status(400).json({ error: "invalid_request" });
    if (!validId(vehicleId) || !validId(sessionId) || !["low", "medium", "high"].includes(urgency) ||
      !Array.isArray(operations) || !operations.length || operations.length > 20 || !operations.every((item) => validText(item, 500)) ||
      !["repair", "defectoscopy"].includes(purpose) || (historicalPart !== undefined && (purpose !== "repair" || typeof historicalPart !== "string" || historicalPart.length > 200))) return res.status(400).json({ error: "invalid_request" });
    const vehicle = vehicles.get(vehicleId);
    const saved = db.prepare("SELECT result,revision FROM neuro_diagnoses WHERE vehicle_id=? AND session_id=?").get(vehicleId, sessionId);
    if (!vehicle || !saved) return res.status(409).json({ error: "diagnosis_required" });
    const diagnosis = JSON.parse(saved.result);
    const assessment = assess(vehicle, diagnosis);
    if (purpose === "repair" ? !assessment.guidance.canCreateTicket : !assessment.guidance.canCreateDefectoscopyTicket) return res.status(409).json({ error: assessment.guidance.ticketBlockReason || assessment.guidance.status });
    const recommendations = assessment.guidance.recommendations;
    if (!operations.every((operation) => recommendations.some((recommendation) => recommendation.text === operation))) return res.status(422).json({ error: "operation_not_manual_supported" });
    if (operations.length > recommendations.length) return res.status(422).json({ error: "duplicate_operation" });
    const selected = operations.map((operation) => recommendations.find((recommendation) => recommendation.text === operation));
    if (purpose === "repair" ? !selected.every(isRepairOperation) : !selected.every(isInspectionOperation)) return res.status(422).json({ error: purpose === "repair" ? "operation_not_repair" : "operation_not_inspection" });
    const references = [];
    for (const { manual, pdfPage, text } of recommendations) {
      if (operations.includes(text) && !references.some(ref => ref.manual === manual && ref.pdf_page === pdfPage)) {
        references.push({ manual, pdf_page: pdfPage });
      }
    }
    if (!operations.every((operation) => recommendations.some((recommendation) => recommendation.text === operation))) return res.status(422).json({ error: "operation_not_manual_supported" });
    if (!references.length || !references.every((reference) => validText(reference.manual, 200) && Number.isInteger(reference.pdf_page) && reference.pdf_page > 0)) return res.status(409).json({ error: "manual_evidence_required" });
    let historicalNote = "";
    const selectedPart = typeof historicalPart === "string" ? historicalPart.trim() : "";
    if (selectedPart) {
      let history;
      try { history = repairExperience(db, vehicleId, sessionId, diagnosis.anomaly_type); }
      catch { return res.status(503).json({ error: "historical_experience_unavailable" }); }
      const match = history?.cases.find((item) => ["vehicle", "engine"].includes(item.match) && item.part === selectedPart);
      if (!match) return res.status(422).json({ error: "historical_part_not_available" });
      historicalNote = ` Из истории ${match.match === "vehicle" ? "этого ТС" : "двигателя"}: «${selectedPart}»; проверить применимость перед заказом.`;
    }
    const payload = { vehicle_id: vehicleId, session_id: sessionId, anomaly_type: diagnosis.anomaly_type, conclusion: `${purpose === "defectoscopy" ? "Заявка на дефектовку. " : ""}${assessment.guidance.message}${historicalNote}`, urgency, operations, spare_parts: [], references };
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
    const token = randomUUID();
    const preview = { purpose, vehicleId, sessionId, engineModel: vehicle.engine_model, faultCode: diagnosis.anomaly_type, confidence: assessment.confidence, signalQuality: assessment.quality, urgency, urgencyMeaning: ({ high: "До следующего рейса", medium: "К ближайшему плановому ТО", low: "К следующему осмотру" })[urgency], conclusion: payload.conclusion, operations: operations.map((text) => { const item = recommendations.find((recommendation) => recommendation.text === text); return { text, manual: item.manual, pdfPage: item.pdfPage }; }), historicalNote: historicalNote.trim(), spareParts: [] };
    db.prepare("INSERT INTO neuro_ticket_previews(token,vehicle_id,session_id,snapshot,expires_at) VALUES(?,?,?,?,?)").run(token, vehicleId, sessionId, JSON.stringify({ payload, preview, diagnosisRevision: saved.revision }), expiresAt);
    return res.status(201).set("Cache-Control", "no-store").json({ previewToken: token, expiresAt, preview });
  });

  app.post("/api/neuro/tickets", async (req, res) => {
    const { previewToken, confirmed } = req.body || {};
    if (Object.keys(req.body || {}).some((key) => !["previewToken", "confirmed"].includes(key)) || typeof previewToken !== "string" || !/^[0-9a-f-]{36}$/i.test(previewToken) || confirmed !== true) return res.status(400).json({ error: "preview_confirmation_required" });
    const previewRow = db.prepare("SELECT snapshot,expires_at FROM neuro_ticket_previews WHERE token=?").get(previewToken);
    if (!previewRow) return res.status(409).json({ error: "preview_not_found" });
    if (Date.parse(previewRow.expires_at) <= Date.now()) return res.status(410).json({ error: "preview_expired" });
    const { payload, diagnosisRevision } = JSON.parse(previewRow.snapshot);
    const { vehicle_id: vehicleId, session_id: sessionId } = payload;
    const prior = db.prepare("SELECT state,result FROM neuro_tickets WHERE vehicle_id=? AND session_id=?").get(vehicleId, sessionId);
    if (prior?.state === "created") {
      if (JSON.stringify(JSON.parse(prior.result).payload) !== JSON.stringify(payload)) return res.status(409).json({ error: "ticket_payload_conflict" });
      return res.status(200).json(JSON.parse(prior.result));
    }
    const currentDiagnosis = db.prepare("SELECT revision FROM neuro_diagnoses WHERE vehicle_id=? AND session_id=?").get(vehicleId, sessionId);
    if (!currentDiagnosis || currentDiagnosis.revision !== diagnosisRevision) return res.status(409).json({ error: "diagnosis_changed_since_preview" });
    const vehicle = vehicles.get(vehicleId);
    const current = vehicle && assess(vehicle, JSON.parse(db.prepare("SELECT result FROM neuro_diagnoses WHERE vehicle_id=? AND session_id=?").get(vehicleId, sessionId).result));
    const mode = JSON.parse(previewRow.snapshot).preview.purpose || "repair";
    const eligibleOperations = current?.guidance.recommendations?.filter((recommendation) => mode === "repair" ? isRepairOperation(recommendation) : isInspectionOperation(recommendation)) || [];
    const eligible = mode === "repair" ? current?.guidance.canCreateTicket : current?.guidance.canCreateDefectoscopyTicket;
    if (!eligible || !Array.isArray(payload.operations) || !payload.operations.length || !payload.operations.every((operation) => eligibleOperations.some((recommendation) => recommendation.text === operation)) || (mode === "defectoscopy" && payload.spare_parts?.length)) {
      return res.status(409).json({ error: mode === "defectoscopy" ? "inspection_operation_required" : "repair_operation_required" });
    }
    const insert = db.prepare("INSERT INTO neuro_tickets(vehicle_id,session_id,state,result,updated_at) VALUES(?,?,'pending',NULL,?) ON CONFLICT(vehicle_id,session_id) DO UPDATE SET state='pending',result=NULL,updated_at=excluded.updated_at WHERE neuro_tickets.state='failed'");
    const reserved = insert.run(vehicleId, sessionId, new Date().toISOString());
    if (!reserved.changes) {
      const prior = db.prepare("SELECT state,result FROM neuro_tickets WHERE vehicle_id=? AND session_id=?").get(vehicleId, sessionId);
      if (prior?.state === "created") return res.status(200).json(JSON.parse(prior.result));
      return res.status(409).json({ error: "ticket_submission_in_progress_or_uncertain" });
    }
    try {
      const { response, json } = await getJson(`${toirUrl.replace(/\/$/, "")}/tickets`, payload);
      if (!response.ok || typeof json?.ticket_id !== "string" || !json.ticket_id || json.status !== "created") {
        if (response.status === 404 || response.status === 422) {
          db.prepare("DELETE FROM neuro_tickets WHERE vehicle_id=? AND session_id=? AND state='pending'").run(vehicleId, sessionId);
          return res.status(502).json({ error: "ticket_rejected_by_service", retryable: true });
        }
        db.prepare("UPDATE neuro_tickets SET state='uncertain',updated_at=? WHERE vehicle_id=? AND session_id=? AND state='pending'").run(new Date().toISOString(), vehicleId, sessionId);
        return res.status(502).json({ error: "ticket_service_failure" });
      }
      const result = { ticket_id: json.ticket_id, status: json.status, payload };
      db.prepare("UPDATE neuro_tickets SET state='created',result=?,updated_at=? WHERE vehicle_id=? AND session_id=? AND state='pending'").run(JSON.stringify(result), new Date().toISOString(), vehicleId, sessionId);
      return res.status(201).json(result);
    } catch (error) {
      if (isConnectionRefused(error)) {
        db.prepare("DELETE FROM neuro_tickets WHERE vehicle_id=? AND session_id=? AND state='pending'").run(vehicleId, sessionId);
        return res.status(502).json({ error: "ticket_service_unavailable", retryable: true });
      }
      db.prepare("UPDATE neuro_tickets SET state='uncertain',updated_at=? WHERE vehicle_id=? AND session_id=? AND state='pending'").run(new Date().toISOString(), vehicleId, sessionId);
      return res.status(502).json({ error: "ticket_submission_uncertain" });
    }
  });
  return function recordManualAnswer(owner, { vehicleId, sessionId, engineModel, query }, answer, results) {
    const vehicle = vehicles.get(vehicleId);
    if (!owner || !vehicle || vehicle.engine_model !== engineModel || !vehicle.sessions.some(item => item.session_id === sessionId) ||
        !validText(query, 1000) || !results.length || !validText(answer, 24000)) return null;
    const id = randomUUID();
    const evidence = results.map(({ manual, text, pdfPage, url }) => ({ manual: manual.title, text, pdfPage, url }));
    storeExchange(owner, vehicleId, sessionId, { id, question: query, answer, evidence }, true);
    return id;
  };
}
