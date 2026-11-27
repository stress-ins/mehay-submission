const ids = ["SYNTH-001", "SYNTH-002", "SYNTH-003", "SYNTH-004", "SYNTH-005", "SYNTH-006"];
const namedSessions = new Map([
  ["SYNTH-001", ["PUBCANDIDATECHECKC", "PUBCANDIDATECHECKD", "PUBCANDIDATECHECKE", "PUBCANDIDATECHECKB"]],
  ["SYNTH-002", ["FAIL-002", "FAIL-002-A", "FAIL-002-B", "FAIL-002-C"]],
  ["SYNTH-003", ["PUBCANDIDATECHECKL", "PUBCANDIDATECHECKK", "PUBCANDIDATECHECKJ"]],
  ["SYNTH-004", ["PUBCANDIDATECHECKI", "PUBCANDIDATECHECKF", "PUBCANDIDATECHECKH", "PUBCANDIDATECHECKG"]],
  ["SYNTH-005", ["PUBCANDIDATECHECKP", "PUBCANDIDATECHECKO", "PUBCANDIDATECHECKN", "PUBCANDIDATECHECKM"]],
  ["SYNTH-006", ["S-0204", "S-0203", "S-0202", "S-0201"]],
]);

const title = { F01: "Клапанный механизм", F08: "Топливоподача", F13: "Подача топлива" };
const vehicles = Array.from({ length: 50 }, (_, index) => {
  const vehicleId = ids[index] || `SYNTH-${String(index + 1).padStart(3, "0")}`;
  const fuel = index % 3 === 1 ? "бензин" : "дизель";
  const sessions = namedSessions.get(vehicleId) || Array.from({ length: index === 6 ? 5 : index >= 45 ? 3 : 4 }, (_, n) => `CHECK-${index + 1}-${n + 1}`);
  return {
    vehicle_id: vehicleId,
    make: "Тестовый производитель",
    model: "Учебный автомобиль",
    engine_model: index === 2 || index === 5 ? "ЗМЗ-5234.10" : index === 6 ? "ЯМЗ-536" : "ЯМЗ-236М2",
    fuel,
    vehicle_type: index === 2 ? "автобус" : "грузовик",
    garage_no: `TEST-${String(index + 1).padStart(3, "0")}`,
    sessions: sessions.map((sessionId, sessionIndex) => {
      const failed = vehicleId === "SYNTH-002" && sessionId === "FAIL-002";
      const normal = (vehicleId === "SYNTH-001" && sessionId === "PUBCANDIDATECHECKC") || sessionIndex === 3;
      const code = vehicleId === "SYNTH-003" || vehicleId === "SYNTH-006" ? "F01" :
        sessionId === "PUBCANDIDATECHECKI" ? "F13" : sessionId === "PUBCANDIDATECHECKP" ? "F08" : fuel === "дизель" ? "F08" : "F13";
      const status = failed ? "check_failed" : normal ? "normal" : "anomaly";
      return {
        vehicle_id: vehicleId,
        session_id: sessionId,
        checked_at: new Date(Date.UTC(2026, 10, 25 - sessionIndex)).toISOString(),
        status,
        anomaly_type: status === "anomaly" ? code : null,
        anomaly_title: status === "anomaly" ? title[code] : null,
        anomaly_score: failed ? null : status === "normal" ? 0.05 : vehicleId === "SYNTH-003" && sessionId === "PUBCANDIDATECHECKL" ? 0.85 : 0.76,
        confidence: failed ? null : vehicleId === "SYNTH-001" && sessionId === "PUBCANDIDATECHECKE" ? 0.42 : 0.73,
        signal_quality: failed ? "bad" : "good",
        description: "Синтетический результат для автоматических проверок.",
        model_version: "synthetic-test-v1",
      };
    }),
  };
});

export const syntheticNeurodvs = { vehicles };
export const testVehicles = { primary: "SYNTH-001", failed: "SYNTH-002", bus: "SYNTH-003", diesel: "SYNTH-004", alternate: "SYNTH-005", delayed: "SYNTH-006" };
