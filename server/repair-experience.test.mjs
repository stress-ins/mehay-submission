import assert from "node:assert/strict";
import test from "node:test";
import { createApp } from "./index.mjs";
import { fleet, repairExperience, seedRepairHistory } from "./repair-experience.mjs";

test("synthetic test fleet has 50 vehicles and maintenance precedes each diagnostic session", t => {
  const db = createApp({dbPath:":memory:"}).locals.db;
  t.after(()=>db.close());
  const rows = db.prepare("SELECT data FROM vehicles").all().map(r=>JSON.parse(r.data));
  assert.equal(rows.length,50);
  assert.deepEqual(rows.map(v=>[v.id,v.plate,v.engine,v.model]).sort(),fleet.map(v=>[v.vehicle_id,v.vehicle_id,v.engine_model,v.model || v.make]).sort());
  assert.equal(fleet.reduce((n,v)=>n+v.sessions.length,0),195);
  assert.ok(rows.every(v=>v.history.length && v.history.every(h=>h.synthetic && h.actualHours>0)));
  const result=repairExperience(db,"SYNTH-003","SYNTH-SESSION-0011","F01");
  const delayedVehicle = fleet.find(vehicle => vehicle.vehicle_id === "SYNTH-006");
  assert.equal(delayedVehicle.engine_model, "ЗМЗ-5234.10");
  const authored = seedRepairHistory(delayedVehicle, 27).find(row => row.faultCode === "F01");
  assert.deepEqual([authored.plannedHours, authored.actualHours, authored.waitingHours], [4, 12, 16]);
  const analog=result.cases.find(c=>c.vehicleId==="SYNTH-006");
  assert.deepEqual([analog.match,analog.plannedHours,analog.actualHours,analog.waitingHours],["engine",4,12,16]);
  assert.match(result.summary,/Шпилька/);
  assert.ok(result.cases.some(c=>c.match==="similar"));
  assert.ok(!result.cases.some(c=>c.completedAt >= "2026-11-01"));
});

test("existing fleet keeps its operational rows and can read synthetic bus examples", t => {
  const db = createApp({ dbPath: ":memory:", legacyDemo: true }).locals.db;
  t.after(() => db.close());
  const before = db.prepare("SELECT id,data FROM vehicles ORDER BY id").all();
  for (let i = 0; i < 2; i++) {
    const result = repairExperience(db, "SYNTH-003", "SYNTH-SESSION-0011", "F01");
    assert.ok(result.cases.some(row => row.vehicleId === "SYNTH-006" && row.actualHours === 12 && row.synthetic));
    assert.equal(new Set(result.cases.map(row => row.id)).size, result.cases.length);
  }
  assert.deepEqual(db.prepare("SELECT id,data FROM vehicles ORDER BY id").all(), before);
});
