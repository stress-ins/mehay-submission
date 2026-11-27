const ids = ["SYNTH-001", "SYNTH-002", "SYNTH-003", "SYNTH-004", "SYNTH-005", "SYNTH-006"];
const namedSessions = new Map([
  ["SYNTH-001", ["SYNTH-SESSION-0002", "SYNTH-SESSION-0003", "SYNTH-SESSION-0004", "SYNTH-SESSION-0001"]],
  ["SYNTH-002", ["FAIL-002", "FAIL-002-A", "FAIL-002-B", "FAIL-002-C"]],
  ["SYNTH-003", ["SYNTH-SESSION-0011", "SYNTH-SESSION-0010", "SYNTH-SESSION-0009"]],
  ["SYNTH-004", ["SYNTH-SESSION-0008", "SYNTH-SESSION-0005", "SYNTH-SESSION-0007", "SYNTH-SESSION-0006"]],
  ["SYNTH-005", ["SYNTH-SESSION-0015", "SYNTH-SESSION-0014", "SYNTH-SESSION-0013", "SYNTH-SESSION-0012"]],
  ["SYNTH-006", ["SYNTH-SESSION-0019", "SYNTH-SESSION-0018", "SYNTH-SESSION-0017", "SYNTH-SESSION-0016"]],
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
    engine_model: ["SYNTH-003", "SYNTH-006"].includes(vehicleId) ? "ЗМЗ-5234.10" : vehicleId === "SYNTH-007" ? "ЯМЗ-536" : "ЯМЗ-236М2",
    fuel,
    vehicle_type: vehicleId === "SYNTH-003" ? "автобус" : "грузовик",
    ...(vehicleId === "SYNTH-006" ? { demo_repair_case: "late-f01" } : {}),
    garage_no: `TEST-${String(index + 1).padStart(3, "0")}`,
    sessions: sessions.map((sessionId, sessionIndex) => {
      const failed = vehicleId === "SYNTH-002" && sessionId === "FAIL-002";
      const normal = (vehicleId === "SYNTH-001" && sessionId === "SYNTH-SESSION-0002") || sessionIndex === 3;
      const code = vehicleId === "SYNTH-003" || vehicleId === "SYNTH-006" ? "F01" :
        sessionId === "SYNTH-SESSION-0008" ? "F13" : sessionId === "SYNTH-SESSION-0015" ? "F08" : fuel === "дизель" ? "F08" : "F13";
      const status = failed ? "check_failed" : normal ? "normal" : "anomaly";
      return {
        vehicle_id: vehicleId,
        session_id: sessionId,
        checked_at: new Date(Date.UTC(2026, 10, 25 - sessionIndex)).toISOString(),
        status,
        anomaly_type: status === "anomaly" ? code : null,
        anomaly_title: status === "anomaly" ? title[code] : null,
        anomaly_score: failed ? null : status === "normal" ? 0.05 : vehicleId === "SYNTH-003" && sessionId === "SYNTH-SESSION-0011" ? 0.85 : 0.76,
        confidence: failed ? null : vehicleId === "SYNTH-001" && sessionId === "SYNTH-SESSION-0004" ? 0.42 : 0.73,
        signal_quality: failed ? "bad" : "good",
        description: "Синтетический результат для автоматических проверок.",
        model_version: "synthetic-test-v1",
      };
    }),
  };
});

export const syntheticNeurodvs = { vehicles };
export const testVehicles = { primary: "SYNTH-001", failed: "SYNTH-002", bus: "SYNTH-003", diesel: "SYNTH-004", alternate: "SYNTH-005", delayed: "SYNTH-006" };
