import { fleet } from "./neurodvs-data.mjs";
export { fleet };
const jobs = {
  F01: ["Регулировка клапанного механизма", "Прокладка клапанной крышки"],
  F02: ["Проверка системы смазки", "Масляный фильтр"],
  F03: ["Проверка системы охлаждения", "Уплотнение патрубка"],
  F04: ["Проверка привода агрегатов", "Приводной ремень"],
  F05: ["Проверка генератора", "Регулятор напряжения"],
  F06: ["Проверка привода сцепления", "Пыльник привода сцепления"],
  F07: ["Проверка механизма переключения", "Втулка тяги"],
  F08: ["Проверка дизельной топливоподачи", "Топливный фильтр"],
  F09: ["Проверка системы наддува", "Уплотнение патрубка наддува"],
  F10: ["Проверка пневмосистемы", "Уплотнение штуцера"],
  F11: ["Проверка системы рециркуляции", "Прокладка клапана"],
  F12: ["Проверка зажигания", "Свеча зажигания"],
  F13: ["Проверка подачи бензина", "Топливный фильтр"],
  F14: ["Проверка цепного привода ГРМ", "Прокладка крышки"],
};

// Reproducible, dated synthetic work orders. They do not change the supplied ML sessions.
export function seedRepairHistory(vehicle, index) {
  const compatible = code => !((code === "F08" && vehicle.fuel !== "дизель") || (["F12","F13"].includes(code) && vehicle.fuel === "дизель"));
  const ownCodes = vehicle.sessions.map(s => s.anomaly_type).filter(c => jobs[c] && compatible(c));
  const codes = [...new Set([...ownCodes, "F01", "F02", "F04"])];
  return codes.map((faultCode, i) => {
    const [title, part] = jobs[faultCode];
    const delayed = vehicle.demo_repair_case === "late-f01" && faultCode === "F01";
    const plannedHours = 4 + (i % 3);
    const actualHours = delayed ? 12 : plannedHours + ((index + i) % 3) - 1;
    const completedAt = delayed ? "2026-09-18" : new Date(Date.UTC(2026, 7, 1 + ((index * 7 + i * 11) % 55))).toISOString().slice(0, 10);
    const cause = delayed ? "При разборке обнаружена повреждённая шпилька крышки. Высверливание, восстановление резьбы и повторная сборка добавили 8 человеко-часов." :
      ["Работа завершена в одну смену. Доступ к узлу свободный.", "Дополнительно очищены крепления и проверено уплотнение.", "Деталь подготовили со склада до постановки на пост."][(index+i)%3];
    const fitted = delayed ? "Шпилька клапанной крышки" : part;
    return { id: `hist-${vehicle.vehicle_id}-${faultCode}`, date: completedAt, completedAt, type: "service", title, faultCode,
      description: cause, work: title, result: "Контроль после сборки выполнен.", part: fitted, parts: [{name:fitted, quantity:1, demo:true}],
      plannedHours: delayed ? 4 : plannedHours, actualHours, waitingHours: delayed ? 16 : (index+i)%4, cause, synthetic:true, demo:true };
  });
}

export function repairExperience(db, vehicleId, sessionId, faultCode) {
  const current = fleet.find(v => v.vehicle_id === vehicleId);
  const session = current?.sessions.find(s => s.session_id === sessionId);
  if (!session) return null;
  const cases = [];
  const recordedVehicles = db.prepare("SELECT data FROM vehicles").all().map(row => JSON.parse(row.data));
  const recordedIds = new Set(recordedVehicles.map(vehicle => vehicle.id));
  // Older installations keep their own fleet. Supply the missing hackathon
  // examples to NeuroDVS without inserting or replacing operational vehicles.
  for (const [index, source] of fleet.entries()) {
    if (!recordedIds.has(source.vehicle_id)) {
      recordedVehicles.push({ id: source.vehicle_id, plate: source.vehicle_id, model: source.model,
        engine: source.engine_model, history: seedRepairHistory(source, index) });
    }
  }
  for (const vehicle of recordedVehicles) {
    for (const job of vehicle.history || []) {
      if (job.faultCode !== faultCode || !job.completedAt || job.completedAt >= session.checked_at.slice(0,10)) continue;
      if (![job.plannedHours, job.actualHours, job.waitingHours].every(n => Number.isFinite(n) && n >= 0)) continue;
      const match = vehicle.id === vehicleId ? "vehicle" : vehicle.engine === current.engine_model ? "engine" : "similar";
      cases.push({id:job.id, vehicleId:vehicle.plate, model:vehicle.model, engineModel:vehicle.engine, completedAt:job.completedAt,
        plannedHours:job.plannedHours,actualHours:job.actualHours,waitingHours:job.waitingHours,cause:job.cause,part:job.part,match,synthetic:job.synthetic===true});
    }
  }
  const ranks = {vehicle:0,engine:1,similar:2};
  cases.sort((a,b)=>ranks[a.match]-ranks[b.match] || b.completedAt.localeCompare(a.completedAt) || a.id.localeCompare(b.id));
  const comparable = cases.filter(c=>c.match!=="similar");
  const example = comparable.slice().sort((a,b)=>(b.actualHours-b.plannedHours)-(a.actualHours-a.plannedHours))[0];
  let summary = "В истории нет завершённых сопоставимых работ по этому двигателю и коду.";
  if (example) summary = `Сопоставимых работ: ${comparable.length}. Наибольшее превышение плана — ${example.model}, ${example.vehicleId}: план ${example.plannedHours} ч, фактически ${example.actualHours} ч труда. Ожидание отдельно: ${example.waitingHours} ч. ${example.cause} Перед постановкой на пост сверьте комплектацию и наличие детали «${example.part}». Это опыт парка, заводской норматив смотрите в руководстве.`;
  return {engineModel:current.engine_model,faultCode,cases,summary};
}
